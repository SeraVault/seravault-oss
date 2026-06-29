// @ts-nocheck
/**
 * Service for file operations (copy, move) with proper key preservation
 * Fixes the issue where copying files breaks sharing by generating new encryption keys
 */

import { FileEncryptionService } from './fileEncryption';
import { createFileWithSharing, updateFile, type FileData } from '../files';
import { updateFolder, type Folder as FolderData, createFolder } from '../firestore';
import { getFile } from '../storage';

export interface CopyOptions {
  preserveSharing?: boolean;
  newParentFolder?: string | null;
  allowContentDeduplication?: boolean;
}

export interface MoveOptions {
  newParentFolder?: string | null;
}

export class FileOperationsService {
  /**
   * Copy a file with proper key preservation to maintain sharing
   */
  static async copyFile(
    originalFile: FileData,
    currentUserId: string,
    userPrivateKey: string,
    options: CopyOptions = {}
  ): Promise<string> {
    const {
      preserveSharing = true,
      newParentFolder = null,
      allowContentDeduplication = true
    } = options;

    // Verify user has access to the file
    if (!originalFile.encryptedKeys[currentUserId]) {
      throw new Error('Cannot copy file: no access to file key');
    }

    // Check if this is a chat file or attachment - they don't have storage content or shouldn't be copied
    const isChatFile = (originalFile as any).fileType === 'chat' || !originalFile.storagePath;
    const isAttachment = (originalFile as any).fileType === 'attachment';
    
    if (isAttachment) {
      throw new Error('Cannot copy form attachment files.');
    }
    
    if (isChatFile) {
      // For chat files, we can't create a duplicate conversation
      // Instead, we just update the user's folder association for this chat
      // This moves the chat to a different folder in their view without duplicating it
      
      // Check if user is a participant in this chat
      const participants = (originalFile as any).participants || [];
      if (!participants.includes(currentUserId)) {
        throw new Error('Cannot copy chat: you are not a participant in this conversation');
      }
      
      // Use the user folder management to move the chat to the new folder for this user only
      const { moveFileForUser } = await import('./userFolderManagement');
      await moveFileForUser(originalFile.id!, currentUserId, newParentFolder, originalFile);
      
      // Return the same file ID since we didn't create a new file
      return originalFile.id!;
    }

    if (preserveSharing && originalFile.sharedWith.length > 1) {
      // PRESERVE ORIGINAL ENCRYPTION - don't generate new keys!
      // This maintains sharing without breaking encryption

      const fileRecord = await FileEncryptionService.createFileRecord(
        currentUserId,
        {
          name: originalFile.name as { ciphertext: string; nonce: string },
          size: originalFile.size as { ciphertext: string; nonce: string }
        },
        allowContentDeduplication ? originalFile.storagePath : FileEncryptionService.generateStoragePath(currentUserId),
        originalFile.encryptedKeys, // PRESERVE ORIGINAL KEYS!
        originalFile.sharedWith,     // PRESERVE SHARING LIST!
        newParentFolder
      );

      // If not allowing deduplication, we need to copy the actual file content
      if (!allowContentDeduplication) {
        // Download, decrypt, and re-upload the content
        const encryptedContent = await getFile(originalFile.storagePath);
        const decryptedContent = await FileEncryptionService.decryptFile(
          new Uint8Array(encryptedContent),
          originalFile.encryptedKeys[currentUserId],
          userPrivateKey
        );

        // Re-encrypt with same keys (but new storage path)
        const { encryptedContent: newEncryptedContent } = await FileEncryptionService.encryptFileForUsers(
          decryptedContent,
          typeof originalFile.name === 'string' ? originalFile.name : '[Encrypted]',
          typeof originalFile.size === 'string' ? parseInt(originalFile.size) : 0,
          originalFile.sharedWith,
          currentUserId,
          newParentFolder
        );

        // Use the new encryption result
        const { uploadFileData } = await import('../storage');
        await uploadFileData(fileRecord.storagePath, newEncryptedContent);
      }

      // Create new file record in Firestore
      const newFileId = await createFileWithSharing(fileRecord);
      return newFileId;

    } else {
      // Create completely new file with new encryption (no sharing preservation)
      // Download and decrypt original content
      const encryptedContent = await getFile(originalFile.storagePath);
      const decryptedContent = await FileEncryptionService.decryptFile(
        new Uint8Array(encryptedContent),
        originalFile.encryptedKeys[currentUserId],
        userPrivateKey
      );

      // Get original metadata
      const originalName = typeof originalFile.name === 'string' 
        ? originalFile.name 
        : '[Encrypted]';
      const originalSize = typeof originalFile.size === 'string' 
        ? parseInt(originalFile.size) 
        : decryptedContent.length;

      // Encrypt for new owner only
      const encryptionResult = await FileEncryptionService.encryptFileForUsers(
        decryptedContent,
        originalName,
        originalSize,
        [currentUserId], // Only current user
        currentUserId,
        newParentFolder
      );

      // Upload new encrypted content
      const { uploadFileData } = await import('../storage');
      await uploadFileData(encryptionResult.storagePath, encryptionResult.encryptedContent);

      // Create file record
      const fileRecord = await FileEncryptionService.createFileRecord(
        currentUserId,
        encryptionResult.encryptedMetadata,
        encryptionResult.storagePath,
        encryptionResult.encryptedKeys,
        [currentUserId], // Only current user
        newParentFolder
      );

      const newFileId = await createFileWithSharing(fileRecord);
      return newFileId;
    }
  }

  /**
   * Move a file to a different folder (preserves all encryption and sharing)
   */
  static async moveFile(
    file: FileData,
    options: MoveOptions = {}
  ): Promise<void> {
    const { newParentFolder = null } = options;

    // Simple metadata update - no encryption changes needed
    await updateFile(file.id!, {
      parent: newParentFolder
    });
  }

  /**
   * Copy a folder (creates new folder with same name in target location)
   */
  static async copyFolder(
    originalFolder: FolderData,
    currentUserId: string,
    userPrivateKey: string,
    options: CopyOptions = {}
  ): Promise<void> {
    const { newParentFolder = null } = options;

    // First, decrypt the original folder name
    let decryptedName: string;
    if (typeof originalFolder.name === 'string') {
      decryptedName = originalFolder.name;
    } else {
      // Decrypt the folder name using the user's private key
      const { decryptMetadata, hexToBytes } = await import('../crypto/quantumSafeCrypto');
      const userEncryptedKey = originalFolder.encryptedKeys?.[currentUserId];
      if (!userEncryptedKey) {
        throw new Error('No access key found for this folder');
      }

      // Parse the encrypted key (IV + encapsulated_key + ciphertext)
      const keyData = hexToBytes(userEncryptedKey);
      const iv = keyData.slice(0, 12);
      const encapsulatedKey = keyData.slice(12, 12 + 1088);
      const ciphertext = keyData.slice(12 + 1088);

      // Decrypt the folder key using ML-KEM-768
      const { decryptData } = await import('../crypto/quantumSafeCrypto');
      const privateKeyBytes = hexToBytes(userPrivateKey);
      const folderKey = await decryptData(
        { iv, encapsulatedKey, ciphertext },
        privateKeyBytes
      );

      // Decrypt the folder name
      decryptedName = await decryptMetadata(originalFolder.name, folderKey);
    }

    // Create new folder with decrypted name in target location
    await createFolder(
      currentUserId,
      decryptedName,
      newParentFolder,
      userPrivateKey
    );
  }

  /**
   * Move a folder to a different parent (preserves all content and structure)
   */
  static async moveFolder(
    folder: FolderData,
    options: MoveOptions = {}
  ): Promise<void> {
    const { newParentFolder = null } = options;

    // Simple metadata update - no content changes needed
    await updateFolder(folder.id!, {
      parent: newParentFolder
    });
  }

  /**
   * Share a file with additional users (adds encrypted keys for new users)
   */
  static async shareFileWithUsers(
    file: FileData,
    currentUserId: string,
    userPrivateKey: string,
    newUserIds: string[],
    recipientParentFolderId?: string | null
  ): Promise<void> {

    // Get current user's encrypted key
    const currentUserEncryptedKey = file.encryptedKeys[currentUserId];
    if (!currentUserEncryptedKey) {
      console.error('❌ Cannot share file: no access to file key for user', currentUserId);
      throw new Error('Cannot share file: no access to file key');
    }


    // Encrypt file key for new users
    const newEncryptedKeys = await FileEncryptionService.shareFileWithUsers(
      currentUserEncryptedKey,
      userPrivateKey,
      newUserIds
    );


    // Update file record with new keys and shared users
    const updatedEncryptedKeys = { ...file.encryptedKeys, ...newEncryptedKeys };
    const updatedSharedWith = [...new Set([...file.sharedWith, ...newUserIds])];

    console.log('📝 Updating file with:', {
      newEncryptedKeysCount: Object.keys(newEncryptedKeys).length,
      totalEncryptedKeysCount: Object.keys(updatedEncryptedKeys).length,
      oldSharedWithCount: file.sharedWith.length,
      newSharedWithCount: updatedSharedWith.length,
      updatedSharedWith
    });

    // Add folder, favorite, and tag associations for newly shared users
    const { addUserFolderAssociation } = await import('./userFolderManagement');
    const { addUserFavoriteAssociation } = await import('./userFavoritesManagement');
    
    const folderUpdates: Promise<void>[] = [];
    const favoriteUpdates: Promise<void>[] = [];
    
    for (const userId of newUserIds) {
      // Use the provided parent folder ID so files appear inside the correct folder
      // for the recipient. Falls back to null (root) when sharing individual files.
      const targetFolder = recipientParentFolderId !== undefined ? recipientParentFolderId : null;
      folderUpdates.push(addUserFolderAssociation(file.id!, userId, targetFolder));
      favoriteUpdates.push(addUserFavoriteAssociation(file.id!, userId));
    }
    
    // Prepare updated userTags with encrypted empty tags for new users (only if file has userTags)
    let updatedUserTags = file.userTags ? { ...file.userTags } : {};
    let hasUserTagsUpdates = false;
    
    // Get the file key to encrypt empty tags for new users
    if (currentUserEncryptedKey && file.userTags) {
      try {
        // Decrypt file key using current user's private key
        const { decryptData, hexToBytes, encryptStringToMetadata } = await import('../crypto/quantumSafeCrypto');
        const keyData = hexToBytes(currentUserEncryptedKey);
        const iv = keyData.slice(0, 12);
        const encapsulatedKey = keyData.slice(12, 12 + 1088);
        const ciphertext = keyData.slice(12 + 1088);
        const privateKeyBytes = hexToBytes(userPrivateKey);
        const fileKey = await decryptData({ iv, encapsulatedKey, ciphertext }, privateKeyBytes);
        
        // Create encrypted empty tags for new users
        for (const userId of newUserIds) {
          if (!updatedUserTags[userId]) {
            const emptyTagsJson = JSON.stringify([]);
            const encryptedTags = await encryptStringToMetadata(emptyTagsJson, fileKey);
            updatedUserTags[userId] = encryptedTags;
            hasUserTagsUpdates = true;
          }
        }
      } catch (error) {
        console.error('Failed to encrypt empty tags for new users:', error);
      }
    }

    // Prepare updated userNames with original file name for new users (only if file has userNames)
    let updatedUserNames = file.userNames ? { ...file.userNames } : {};
    let hasUserNamesUpdates = false;
    
    // Initialize user names with original file name for new users
    if (currentUserEncryptedKey && file.userNames) {
      try {
        // Decrypt file key using current user's private key
        const { decryptData, hexToBytes, encryptStringToMetadata, decryptMetadata } = await import('../crypto/quantumSafeCrypto');
        const keyData = hexToBytes(currentUserEncryptedKey);
        const iv = keyData.slice(0, 12);
        const encapsulatedKey = keyData.slice(12, 12 + 1088);
        const ciphertext = keyData.slice(12 + 1088);
        const privateKeyBytes = hexToBytes(userPrivateKey);
        const fileKey = await decryptData({ iv, encapsulatedKey, ciphertext }, privateKeyBytes);
        
        // Get original file name
        let originalName = '[Encrypted File]';
        if (typeof file.name === 'object') {
          originalName = await decryptMetadata(file.name, fileKey);
        } else {
          originalName = file.name;
        }
        
        // Create encrypted name copies for new users
        for (const userId of newUserIds) {
          if (!updatedUserNames[userId]) {
            const encryptedName = await encryptStringToMetadata(originalName, fileKey);
            updatedUserNames[userId] = encryptedName;
            hasUserNamesUpdates = true;
          }
        }
      } catch (error) {
        console.error('Failed to encrypt names for new users:', error);
      }
    }
    
    // Prepare update data
    const updateData: any = {
      encryptedKeys: updatedEncryptedKeys,
      sharedWith: updatedSharedWith
    };
    
    // Only include userTags if we have updates or the file originally had userTags
    if (file.userTags || hasUserTagsUpdates) {
      updateData.userTags = updatedUserTags;
    }

    // Only include userNames if we have updates or the file originally had userNames
    if (file.userNames || hasUserNamesUpdates) {
      updateData.userNames = updatedUserNames;
    }
    
    // Update file and user associations in parallel
    await Promise.all([
      updateFile(file.id!, updateData),
      ...folderUpdates,
      ...favoriteUpdates
    ]);

    // Send notifications to newly shared users
    try {
      const { NotificationService } = await import('./notificationService');
      const { getUserProfile } = await import('../firestore');
      
      // Get sender display name
      const senderProfile = await getUserProfile(currentUserId);
      const senderDisplayName = senderProfile?.displayName || 'Someone';
      
      // Get file name for notification
      let fileName = '[Encrypted File]';
      if (typeof file.name === 'string') {
        fileName = file.name;
      } else if (typeof file.name === 'object' && currentUserEncryptedKey) {
        try {
          // Decrypt file name for notification
          const { decryptData, hexToBytes } = await import('../crypto/quantumSafeCrypto');
          const keyData = hexToBytes(currentUserEncryptedKey);
          const iv = keyData.slice(0, 12);
          const encapsulatedKey = keyData.slice(12, 12 + 1088);
          const ciphertext = keyData.slice(12 + 1088);
          const privateKeyBytes = hexToBytes(userPrivateKey);
          const fileKey = await decryptData({ iv, encapsulatedKey, ciphertext }, privateKeyBytes);
          const { decryptMetadata } = await import('../crypto/quantumSafeCrypto');
          const decryptedMeta = await decryptMetadata(file.name, fileKey);
          fileName = decryptedMeta.name;
        } catch (error) {
          console.warn('Could not decrypt file name for notification:', error);
        }
      }
      
      // Notifications now handled by Cloud Functions automatically
      console.log(`📤 File shared with ${newUserIds.length} users - Cloud Functions will handle notifications`);
    } catch (error) {
      console.error('Failed to send file sharing notifications:', error);
      // Don't fail the entire operation if notification fails
    }

  }

  /**
   * Remove sharing for specific users (removes their encrypted keys)
   */
  static async removeFileSharing(
    file: FileData,
    userIdsToRemove: string[],
    currentUserId?: string
  ): Promise<void> {
    // Remove encrypted keys for specified users
    const updatedEncryptedKeys = { ...file.encryptedKeys };
    const updatedSharedWith = file.sharedWith.filter(userId => !userIdsToRemove.includes(userId));

    userIdsToRemove.forEach(userId => {
      delete updatedEncryptedKeys[userId];
    });

    // Remove folder, favorite, and tag associations for unshared users
    const { removeUserFolderAssociation } = await import('./userFolderManagement');
    const { removeUserFavoriteAssociation } = await import('./userFavoritesManagement');
    const { removeUserTagAssociation } = await import('./userTagsManagement');
    
    const folderUpdates: Promise<void>[] = [];
    const favoriteUpdates: Promise<void>[] = [];
    
    for (const userId of userIdsToRemove) {
      folderUpdates.push(removeUserFolderAssociation(file.id!, userId));
      favoriteUpdates.push(removeUserFavoriteAssociation(file.id!, userId));
    }
    
    // Remove userTags for unshared users (only if file has userTags)
    let updatedUserTags = file.userTags ? { ...file.userTags } : {};
    if (file.userTags) {
      userIdsToRemove.forEach(userId => {
        delete updatedUserTags[userId];
      });
    }

    // Remove userNames for unshared users (only if file has userNames)
    let updatedUserNames = file.userNames ? { ...file.userNames } : {};
    if (file.userNames) {
      userIdsToRemove.forEach(userId => {
        delete updatedUserNames[userId];
      });
    }
    
    // Prepare update data
    const updateData: any = {
      encryptedKeys: updatedEncryptedKeys,
      sharedWith: updatedSharedWith
    };
    
    // Only include userTags if the file originally had them
    if (file.userTags) {
      updateData.userTags = updatedUserTags;
    }

    // Only include userNames if the file originally had them
    if (file.userNames) {
      updateData.userNames = updatedUserNames;
    }
    
    // Update file and user associations in parallel
    await Promise.all([
      updateFile(file.id!, updateData),
      ...folderUpdates,
      ...favoriteUpdates
    ]);

    // Send notifications to users who lost access (if currentUserId is provided)
    if (currentUserId && userIdsToRemove.length > 0) {
      try {
        const { NotificationService } = await import('./notificationService');
        const { getUserProfile } = await import('../firestore');
        
        // Get sender display name
        const senderProfile = await getUserProfile(currentUserId);
        const senderDisplayName = senderProfile?.displayName || 'Someone';
        
        // Get file name for notification
        let fileName = '[Encrypted File]';
        if (typeof file.name === 'string') {
          fileName = file.name;
        } else if (typeof file.name === 'object') {
          // For unsharing, we can't decrypt the file name easily since we're removing access
          // Use a generic name for now
          fileName = 'Shared file';
        }
        
        // Notifications now handled by Cloud Functions automatically
        console.log(`🔒 File unshared from ${userIdsToRemove.length} users - Cloud Functions will handle notifications`);
      } catch (error) {
        console.error('Failed to send file unsharing notifications:', error);
        // Don't fail the entire operation if notification fails
      }
    }
  }
}