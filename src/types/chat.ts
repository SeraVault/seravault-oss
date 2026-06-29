// import { FieldValue } from 'firebase/firestore';

/**
 * Chat message with quantum-safe encryption
 * Each message has its own unique nonce for security
 * Note: With subcollections, conversationId is in the path, not the document
 */
export interface ChatMessage {
  id?: string;
  conversationId?: string; // Optional - for backward compatibility during migration
  senderId: string;
  senderName?: string; // Cached sender name for display
  
  // Participants array no longer needed with subcollections (kept for migration)
  participants?: string[];
  
  // Encrypted content - each recipient gets their own encrypted version
  encryptedContent: {
    [recipientId: string]: {
      ciphertext: string;
      nonce: string; // Unique nonce per message per recipient
    };
  };
  
  // Message metadata
  timestamp: any | Date;
  edited?: boolean;
  editedAt?: Date;
  
  // Message type
  type: 'text' | 'file' | 'system';
  
  // For file messages
  fileMetadata?: {
    fileName: string;
    fileSize: number;
    mimeType: string;
    storagePath: string;
    encryptedKeys?: { [uid: string]: string }; // Encryption keys for each participant
  };
  
  // Read receipts per user
  readBy?: {
    [userId: string]: Date;
  };
  
  // Reactions (optional future feature)
  reactions?: {
    [emoji: string]: string[]; // emoji -> array of userIds
  };
}

/**
 * Chat conversation (individual or group)
 * Now stored in the files collection with fileType: 'chat'
 * This allows conversations to be organized in folders like regular files
 */
export interface Conversation {
  id?: string;
  
  // File system integration - conversations are files
  owner: string; // Creator of the conversation
  name: string | { ciphertext: string; nonce: string }; // Conversation display name (encrypted)
  fileType: 'chat'; // Distinguishes chat files from regular files
  parent: string | null; // Deprecated - kept for backward compatibility
  userFolders?: { [uid: string]: string | null }; // Per-user folder associations (uid -> folderId or null)
  userNames?: { [uid: string]: { ciphertext: string; nonce: string } }; // Per-user conversation names (uid -> encrypted name)
  createdAt: any | Date;
  lastModified?: Date | string; // Last message timestamp
  size: string | { ciphertext: string; nonce: string }; // Message count or "0" (encrypted)
  storagePath?: string; // Not used for chats, but required for FileData compatibility
  encryptedKeys: { [uid: string]: string }; // uid -> encrypted conversation key
  sharedWith: string[]; // Same as participants - users with access
  userFavorites?: { [uid: string]: boolean }; // Per-user favorite status (uid -> isFavorite)
  userTags?: { [uid: string]: { ciphertext: string; nonce: string } }; // Per-user encrypted tags
  
  // Chat-specific fields
  type: 'individual' | 'group';
  participants: string[]; // Array of user IDs (same as sharedWith)
  
  // Group metadata (only for group chats)
  groupName?: string;
  groupDescription?: string;
  groupAvatar?: string;
  admins?: string[]; // User IDs with admin privileges
  
  // Conversation metadata
  createdBy: string;
  lastMessageAt?: Date;
  lastMessagePreview?: string; // Encrypted preview for each user
  
  // Per-user settings
  userSettings?: {
    [userId: string]: {
      muted?: boolean;
      archived?: boolean;
      pinnedAt?: Date;
      customName?: string; // User's custom name for this conversation
      lastRead?: Date;
    };
  };
  
  // Typing indicators (not persisted, used in real-time)
  typing?: {
    [userId: string]: Date;
  };
}

/**
 * User presence status
 */
export interface UserPresence {
  userId: string;
  status: 'online' | 'away' | 'offline';
  lastSeen: Date;
  currentlyTypingIn?: string; // conversationId if typing
}

/**
 * Chat notification
 */
export interface ChatNotification {
  id?: string;
  recipientId: string;
  conversationId: string;
  messageId: string;
  senderId: string;
  senderName: string;
  preview: string; // Encrypted message preview
  timestamp: any | Date;
  read: boolean;
}
