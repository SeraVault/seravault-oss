import { backendService } from '../backend/BackendService';
import type { QueryConstraint } from '../backend/BackendInterface';
import type { ChatMessage, Conversation } from '../types/chat';
import { encryptStringToMetadata, decryptMetadata, encryptData, decryptData, hexToBytes } from '../crypto/quantumSafeCrypto';

// In-memory cache for decrypted conversation keys (cleared on logout via clearConversationKeyCache)
const conversationKeyCache = new Map<string, Uint8Array>();

export function clearConversationKeyCache(): void {
  conversationKeyCache.clear();
}

export class ChatService {
  /**
   * Create a new conversation (individual or group)
   * Now stores conversations in the 'files' collection with fileType: 'chat'
   */
  static async createConversation(
    currentUserId: string,
    participantIds: string[],
    type: 'individual' | 'group',
    userPrivateKey: string,
    groupName?: string,
    groupDescription?: string
  ): Promise<string> {
    // Generate a new conversation key (random 32 bytes)
    const conversationKey = crypto.getRandomValues(new Uint8Array(32));
    
    // Get public keys for all participants
    const { getUserPublicKey } = await import('../firestore');
    const encryptedKeys: { [userId: string]: string } = {};
    
    const allParticipants = [currentUserId, ...participantIds];
    
    for (const participantId of allParticipants) {
      const publicKey = await getUserPublicKey(participantId);
      if (!publicKey) {
        throw new Error(`Public key not found for user ${participantId}`);
      }
      
      // Encrypt conversation key for this participant
      const encrypted = await encryptData(conversationKey, hexToBytes(publicKey));
      const keyData = new Uint8Array([
        ...encrypted.iv,
        ...encrypted.encapsulatedKey,
        ...encrypted.ciphertext
      ]);
      const { bytesToHex } = await import('../crypto/quantumSafeCrypto');
      encryptedKeys[participantId] = bytesToHex(keyData);
    }
    
    // Determine default conversation name
    let conversationName = groupName || 'New Conversation';
    if (type === 'individual' && participantIds.length === 1) {
      // For individual chats, use the other participant's name
      const { getUserProfile } = await import('../firestore');
      const otherUser = await getUserProfile(participantIds[0]);
      if (otherUser) {
        conversationName = `Chat with ${otherUser.displayName}`;
      }
    }
    
    // Encrypt conversation name for each participant
    const encryptedName = await encryptStringToMetadata(conversationName, conversationKey);
    
    // Create per-user encrypted names (each user can customize the chat name)
    const userNames: { [uid: string]: { ciphertext: string; nonce: string } } = {};
    const userFolders: { [uid: string]: string | null } = {};
    for (const participantId of allParticipants) {
      userNames[participantId] = encryptedName;
      userFolders[participantId] = null; // All participants start in root folder
    }
    
    // Create conversation document as a file
    const conversationData: any = {
      // File system fields
      fileType: 'chat',
      owner: currentUserId,
      name: encryptedName, // Encrypted conversation name
      userNames, // Per-user names
      userFolders, // All participants in their root folders
      storagePath: '', // Not used for chats
      size: await encryptStringToMetadata('0', conversationKey), // Message count as encrypted metadata
      sharedWith: [...allParticipants], // Create a new array, not a reference
      encryptedKeys,
      createdAt: backendService.utils.serverTimestamp(),
      lastModified: backendService.utils.serverTimestamp(),
      
      // Chat-specific fields
      type,
      participants: [...allParticipants], // Create a new array, not a reference
      createdBy: currentUserId,
      lastMessageAt: backendService.utils.serverTimestamp(),
    };
    
    if (type === 'group') {
      conversationData.groupName = groupName;
      conversationData.groupDescription = groupDescription;
      conversationData.admins = [currentUserId];
    }
    
    // Store in files collection instead of conversations collection
    return await backendService.documents.add('files', conversationData);
  }
  
  /**
   * Get decrypted conversation key for current user
   */
  static async getConversationKey(
    conversationId: string,
    currentUserId: string,
    userPrivateKey: string
  ): Promise<Uint8Array> {
    // Return cached key if available — conversation keys are immutable
    const cacheKey = `${conversationId}:${currentUserId}`;
    const cached = conversationKeyCache.get(cacheKey);
    if (cached) return cached;

    const conversation = await backendService.documents.get('files', conversationId);
    
    if (!conversation) {
      throw new Error('Conversation not found');
    }
    
    const encryptedKey = (conversation as any).encryptedKeys[currentUserId];
    
    if (!encryptedKey) {
      throw new Error('No access to this conversation');
    }

    // Demo mode sentinel — skip ML-KEM entirely, use all-zeros key
    if (encryptedKey === 'DEMO') {
      const demoKey = new Uint8Array(32);
      conversationKeyCache.set(cacheKey, demoKey);
      return demoKey;
    }
    
    // Decrypt conversation key
    const keyData = hexToBytes(encryptedKey);
    const iv = keyData.slice(0, 12);
    const encapsulatedKey = keyData.slice(12, 12 + 1088);
    const ciphertext = keyData.slice(12 + 1088);
    const privateKeyBytes = hexToBytes(userPrivateKey);
    
    const decryptedKey = await decryptData({ iv, encapsulatedKey, ciphertext }, privateKeyBytes);
    conversationKeyCache.set(cacheKey, decryptedKey);
    return decryptedKey;
  }
  
  /**
   * Send a message in a conversation
   */
  static async sendMessage(
    conversationId: string,
    currentUserId: string,
    userPrivateKey: string,
    content: string,
    type: 'text' | 'file' = 'text',
    fileMetadata?: ChatMessage['fileMetadata']
  ): Promise<string> {
    // Get conversation to find participants
    const conversation = await backendService.documents.get('files', conversationId);
    
    if (!conversation) {
      throw new Error('Conversation not found');
    }
    
    // Get conversation key
    const conversationKey = await this.getConversationKey(conversationId, currentUserId, userPrivateKey);
    
    // Encrypt message content for each participant with unique nonce
    const encryptedContent: ChatMessage['encryptedContent'] = {};
    
    for (const participantId of (conversation as any).participants) {
      // Each recipient gets the same content but with a unique nonce
      const encrypted = await encryptStringToMetadata(content, conversationKey);
      encryptedContent[participantId] = encrypted;
    }
    
    // Create message document (conversationId is in the path, not the document)
    const messageData: Partial<ChatMessage> = {
      senderId: currentUserId,
      encryptedContent,
      timestamp: backendService.utils.serverTimestamp(),
      type,
    };
    
    if (fileMetadata) {
      messageData.fileMetadata = fileMetadata;
    }
    
    // Use subcollection path: files/{conversationId}/messages
    const messageId = await backendService.documents.add(`files/${conversationId}/messages`, messageData);
    
    // Update conversation's last message timestamp
    await backendService.documents.update('files', conversationId, {
      lastMessageAt: backendService.utils.serverTimestamp(),
      lastModified: backendService.utils.serverTimestamp()
    });
    
    return messageId;
  }
  
  /**
   * Get decrypted messages for a conversation
   */
  static async getMessages(
    conversationId: string,
    currentUserId: string,
    userPrivateKey: string,
    limitCount: number = 50
  ): Promise<ChatMessage[]> {
    const conversationKey = await this.getConversationKey(conversationId, currentUserId, userPrivateKey);
    
    // Use subcollection path: files/{conversationId}/messages
    const constraints: QueryConstraint[] = [
      { type: 'orderBy', field: 'timestamp', direction: 'desc' },
      { type: 'limit', limitValue: limitCount }
    ];
    
    const messagesData = await backendService.query.getPath(`files/${conversationId}/messages`, constraints);
    // Decrypt all messages in parallel — each uses the same conversation key
    const messages = (await Promise.all(
      messagesData.map(async (messageDoc) => {
        const messageData = messageDoc as ChatMessage;
        if (!messageData.encryptedContent[currentUserId]) return null;
        try {
          const decryptedContent = await decryptMetadata(
            messageData.encryptedContent[currentUserId],
            conversationKey
          );
          (messageData as any).content = decryptedContent;
        } catch (error) {
          console.error('Failed to decrypt message:', messageData.id, error);
          (messageData as any).content = '[Encrypted]';
        }
        return messageData;
      })
    )).filter((m): m is ChatMessage => m !== null);

    return messages.reverse(); // Return in chronological order
  }
  
  /**
   * Subscribe to real-time messages
   */
  static subscribeToMessages(
    conversationId: string,
    currentUserId: string,
    userPrivateKey: string,
    onUpdate: (messages: ChatMessage[]) => void,
    limitCount: number = 50
  ): () => void {
    // Use subcollection path: files/{conversationId}/messages
    const constraints: QueryConstraint[] = [
      { type: 'orderBy', field: 'timestamp', direction: 'desc' },
      { type: 'limit', limitValue: limitCount }
    ];
    
    let isProcessing = false;
    
    // Used backendService.query.subscribePath instead of onSnapshot
    return backendService.query.subscribePath(
      `files/${conversationId}/messages`,
      constraints,
      async (data) => {
        // Prevent concurrent processing
        if (isProcessing) return;
        isProcessing = true;
        
        try {
          const conversationKey = await this.getConversationKey(conversationId, currentUserId, userPrivateKey);
          const messages: ChatMessage[] = [];
          
          for (const messageDoc of data) {
            const messageData = messageDoc as ChatMessage;
            
            // Decrypt message content for current user
            if (messageData.encryptedContent[currentUserId]) {
              try {
                const decryptedContent = await decryptMetadata(
                  messageData.encryptedContent[currentUserId],
                  conversationKey
                );
                
                (messageData as any).content = decryptedContent;
                messages.push(messageData);
              } catch (error) {
                console.error('Failed to decrypt message:', messageData.id, error);
                (messageData as any).content = '[Encrypted]';
                messages.push(messageData);
              }
            }
          }
          
          onUpdate(messages.reverse());
        } catch (error) {
          console.error('Error in message subscription:', error);
          // Don't call onUpdate with empty list on error, keep existing messages
        } finally {
          isProcessing = false;
        }
      }
    );
  }
  
  /**
   * Get all conversations for current user
   */
  static async getConversations(currentUserId: string): Promise<Conversation[]> {
    // Query files collection for chat type files
    const constraints: QueryConstraint[] = [
      { type: 'where', field: 'fileType', operator: '==', value: 'chat' },
      { type: 'where', field: 'participants', operator: 'array-contains', value: currentUserId },
      { type: 'orderBy', field: 'lastMessageAt', direction: 'desc' }
    ];
    
    const conversations = await backendService.query.getPath('files', constraints);
    return conversations as Conversation[];
  }
  
  /**
   * Get a single conversation by ID
   */
  static async getConversation(conversationId: string): Promise<Conversation | null> {
    const conversation = await backendService.documents.get('files', conversationId);
    return conversation as Conversation | null;
  }
  
  /**
   * Subscribe to real-time conversations
   */
  static subscribeToConversations(
    currentUserId: string,
    onUpdate: (conversations: Conversation[]) => void
  ): () => void {
    // Query files collection for chat type files
    const constraints: QueryConstraint[] = [
      { type: 'where', field: 'fileType', operator: '==', value: 'chat' },
      { type: 'where', field: 'participants', operator: 'array-contains', value: currentUserId },
      { type: 'orderBy', field: 'lastMessageAt', direction: 'desc' }
    ];
    
    return backendService.query.subscribePath('files', constraints, (data) => {
      onUpdate(data as Conversation[]);
    });
  }
  
  /**
   * Mark message as read
   */
  static async markMessageAsRead(
    conversationId: string,
    messageId: string,
    currentUserId: string
  ): Promise<void> {
    // Use subcollection path: files/{conversationId}/messages/{messageId}
    await backendService.documents.update(
      `files/${conversationId}/messages`,
      messageId,
      { [`readBy.${currentUserId}`]: new Date() }
    );
  }
  
  /**
   * Mark all messages in conversation as read
   */
  static async markConversationAsRead(
    conversationId: string,
    currentUserId: string
  ): Promise<void> {
    // Use subcollection path: files/{conversationId}/messages
    const constraints: QueryConstraint[] = [
      { type: 'where', field: `readBy.${currentUserId}`, operator: '==', value: null }
    ];
    
    const messages = await backendService.query.getPath(`files/${conversationId}/messages`, constraints);
    
    const batchOperations = messages.map(msg => ({
      collection: `files/${conversationId}/messages`,
      id: msg.id,
      data: { [`readBy.${currentUserId}`]: new Date() }
    }));
    
    if (batchOperations.length > 0) {
      await backendService.batch.update(batchOperations);
    }
  }
  
  /**
   * Update typing indicator
   */
  static async updateTypingIndicator(
    conversationId: string,
    currentUserId: string,
    isTyping: boolean
  ): Promise<void> {
    if (isTyping) {
      await backendService.documents.update('files', conversationId, {
        [`typing.${currentUserId}`]: new Date()
      });
    } else {
      await backendService.documents.update('files', conversationId, {
        [`typing.${currentUserId}`]: null
      });
    }
  }
  
  /**
   * Add participants to group chat
   */
  static async addParticipants(
    conversationId: string,
    currentUserId: string,
    userPrivateKey: string,
    newParticipantIds: string[]
  ): Promise<void> {
    const conversation = await backendService.documents.get('files', conversationId);
    
    if (!conversation) {
      throw new Error('Conversation not found');
    }
    
    const conversationData = conversation as Conversation;
    
    // Check if user is admin
    if (conversationData.type === 'group' && !conversationData.admins?.includes(currentUserId)) {
      throw new Error('Only admins can add participants');
    }
    
    // Get conversation key
    const conversationKey = await this.getConversationKey(conversationId, currentUserId, userPrivateKey);
    
    // Encrypt conversation key for new participants
    const { getUserPublicKey } = await import('../firestore');
    const newEncryptedKeys: { [userId: string]: string } = {};
    
    for (const participantId of newParticipantIds) {
      const publicKey = await getUserPublicKey(participantId);
      if (!publicKey) {
        throw new Error(`Public key not found for user ${participantId}`);
      }
      
      const encrypted = await encryptData(conversationKey, hexToBytes(publicKey));
      const keyData = new Uint8Array([
        ...encrypted.iv,
        ...encrypted.encapsulatedKey,
        ...encrypted.ciphertext
      ]);
      const { bytesToHex } = await import('../crypto/quantumSafeCrypto');
      newEncryptedKeys[participantId] = bytesToHex(keyData);
    }
    
    // Update conversation
    const updatedParticipants = [...new Set([...conversationData.participants, ...newParticipantIds])];
    const updatedEncryptedKeys = { ...conversationData.encryptedKeys, ...newEncryptedKeys };
    
    await backendService.documents.update('files', conversationId, {
      participants: updatedParticipants,
      encryptedKeys: updatedEncryptedKeys
    });
  }
  
  /**
   * Delete a message
   */
  static async deleteMessage(
    conversationId: string,
    messageId: string,
    currentUserId: string
  ): Promise<void> {
    // Use subcollection path: files/{conversationId}/messages/{messageId}
    const message = await backendService.documents.get(`files/${conversationId}/messages`, messageId);
    
    if (!message) {
      throw new Error('Message not found');
    }
    
    const messageData = message as ChatMessage;
    
    // Only sender can delete
    if (messageData.senderId !== currentUserId) {
      throw new Error('Only sender can delete this message');
    }
    
    // If message has a file attachment, delete from storage
    if (messageData.type === 'file' && messageData.fileMetadata?.storagePath) {
      try {
        await backendService.storage.delete(messageData.fileMetadata.storagePath);
        console.log('Deleted file attachment from storage:', messageData.fileMetadata.storagePath);
      } catch (error) {
        console.error('Failed to delete file attachment from storage:', error);
        // Continue with message deletion even if storage delete fails
      }
    }
    
    await backendService.documents.delete(`files/${conversationId}/messages`, messageId);
  }
  
  /**
   * Leave a conversation
   */
  static async leaveConversation(
    conversationId: string,
    currentUserId: string
  ): Promise<void> {
    const conversation = await backendService.documents.get('files', conversationId);
    
    if (!conversation) {
      throw new Error('Conversation not found');
    }
    
    const conversationData = conversation as Conversation;
    
    // Remove user from participants
    const updatedParticipants = conversationData.participants.filter(id => id !== currentUserId);

    if (updatedParticipants.length === 0) {
      // Delete conversation if no participants left
      await backendService.documents.delete('files', conversationId);
    } else {
      const updatedSharedWith = ((conversationData as any).sharedWith as string[] || [])
        .filter(id => id !== currentUserId);
      await backendService.documents.update('files', conversationId, {
        participants: updatedParticipants,
        sharedWith: updatedSharedWith,
      });
    }
  }

  /**
   * Add emoji reaction to a message
   */
  static async addReaction(
    conversationId: string,
    messageId: string,
    currentUserId: string,
    emoji: string
  ): Promise<void> {
    const message = await backendService.documents.get(`files/${conversationId}/messages`, messageId);
    
    if (!message) {
      throw new Error('Message not found');
    }

    const messageData = message as ChatMessage;
    const reactions = messageData.reactions || {};
    
    // Initialize emoji array if it doesn't exist
    if (!reactions[emoji]) {
      reactions[emoji] = [];
    }
    
    // Add user to emoji reactions if not already there
    if (!reactions[emoji].includes(currentUserId)) {
      reactions[emoji].push(currentUserId);
    }

    await backendService.documents.update(`files/${conversationId}/messages`, messageId, { reactions });
  }

  /**
   * Remove emoji reaction from a message
   */
  static async removeReaction(
    conversationId: string,
    messageId: string,
    currentUserId: string,
    emoji: string
  ): Promise<void> {
    const message = await backendService.documents.get(`files/${conversationId}/messages`, messageId);
    
    if (!message) {
      throw new Error('Message not found');
    }

    const messageData = message as ChatMessage;
    const reactions = messageData.reactions || {};
    
    if (reactions[emoji]) {
      // Remove user from emoji reactions
      reactions[emoji] = reactions[emoji].filter(id => id !== currentUserId);
      
      // Remove emoji key if no users left
      if (reactions[emoji].length === 0) {
        delete reactions[emoji];
      }
    }

    await backendService.documents.update(`files/${conversationId}/messages`, messageId, { reactions });
  }

  /**
   * Toggle emoji reaction (add if not present, remove if present)
   */
  static async toggleReaction(
    conversationId: string,
    messageId: string,
    currentUserId: string,
    emoji: string
  ): Promise<void> {
    const message = await backendService.documents.get(`files/${conversationId}/messages`, messageId);
    
    if (!message) {
      throw new Error('Message not found');
    }

    const messageData = message as ChatMessage;
    const reactions = messageData.reactions || {};
    
    if (reactions[emoji]?.includes(currentUserId)) {
      // User already reacted, remove it
      await this.removeReaction(conversationId, messageId, currentUserId, emoji);
    } else {
      // Add reaction
      await this.addReaction(conversationId, messageId, currentUserId, emoji);
    }
  }
}
