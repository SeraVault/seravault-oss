// @ts-nocheck
import { backendService, type FileRecord } from './backend/BackendService';
// Type-only import for FieldValue compatibility
import type { FieldValue } from 'firebase/firestore';
import { getFolderSharingPermissions } from './firestore';
import { invalidateStorageUsage } from './services/simpleStorageUsage';

export interface FileData {
  id?: string;
  owner: string;
  name: string | { ciphertext: string; nonce: string }; // Encrypted (legacy string or new metadata format) - owner's original name
  parent: string | null; // Deprecated - kept for backward compatibility
  userFolders?: { [uid: string]: string | null }; // Per-user folder associations (uid -> folderId or null)
  userNames?: { [uid: string]: { ciphertext: string; nonce: string } }; // Per-user file names (uid -> encrypted name)
  createdAt: FieldValue;
  lastModified?: Date | string; // Date when file was last modified (unencrypted)
  modifiedAt?: FieldValue | number | string;
  fileType?: string; // 'chat' for conversations, 'attachment' for form attachments, undefined for regular files
  size: string | { ciphertext: string; nonce: string }; // Encrypted (legacy string or new metadata format)
  storagePath: string;
  encryptedKeys: { [uid: string]: string }; // uid -> encrypted key exchange result
  sharedWith: string[]; // Array of UIDs that have access
  isFavorite?: boolean; // Deprecated - kept for backward compatibility
  userFavorites?: { [uid: string]: boolean }; // Per-user favorite status (uid -> isFavorite)
  userTags?: { [uid: string]: { ciphertext: string; nonce: string } }; // Per-user encrypted tags
  archivedBy?: string[]; // UIDs of users who have archived this file (mirrors sharedWith pattern)
}

export const createFile = async (fileData: Omit<FileData, 'createdAt'>) => {
  const newFile: FileData = {
    ...fileData,
    createdAt: backendService.utils.serverTimestamp(),
  };
  await backendService.documents.add('files', newFile);
  
  // Invalidate storage usage cache for the file owner
  invalidateStorageUsage(fileData.owner);
};

export const updateFile = async (fileId: string, data: Partial<FileData>) => {
  try {
    await backendService.files.update(fileId, data);
    
    // If the file owner is provided in the update data, invalidate their storage cache
    // Otherwise, fetch the file to get the owner and invalidate
    if (data.owner) {
      invalidateStorageUsage(data.owner);
    } else {
      // Fetch file to get owner for cache invalidation
      try {
        const fileData = await backendService.files.get(fileId);
        if (fileData?.owner) {
          invalidateStorageUsage(fileData.owner);
        }
      } catch (err) {
        console.warn('Could not invalidate storage cache after update:', err);
        // Don't fail the update operation if cache invalidation fails
      }
    }
  } catch (error) {
    console.error('Error updating file in Firestore:', error);
    throw error;
  }
};

/**
 * Update a file and optionally send modification notifications to shared users
 */
export const updateFileWithNotifications = async (
  fileId: string, 
  data: Partial<FileData>,
  currentUserId?: string,
  isContentModification = false
) => {
  try {
    // Update the file first
    await updateFile(fileId, data);
    
    // Send notifications if this is a content modification and we have current user info
    if (isContentModification && currentUserId) {
      try {
        // Get the current file data to find shared users
        const fileData = await backendService.files.get(fileId);
        
        if (fileData) {
          // Only notify if the file is shared with others
          if (fileData.sharedWith && fileData.sharedWith.length > 1) {
            const { NotificationService } = await import('./services/notificationService');
            const { getUserProfile } = await import('./firestore');
            
            // Get sender display name
            const senderProfile = await getUserProfile(currentUserId);
            const senderDisplayName = senderProfile?.displayName || 'Someone';
            
            // Get file name for notification
            let fileName = '[Encrypted File]';
            if (typeof fileData.name === 'string') {
              fileName = fileData.name;
            } else if (typeof fileData.name === 'object') {
              // For modifications, we can't easily decrypt the name without the user's private key
              // Use a generic name for now - this could be improved by passing the decrypted name
              fileName = 'Shared file';
            }
            
//             await NotificationService.notifyFileModified(
//               fileId,
//               fileName,
//               currentUserId,
//               senderDisplayName,
//               fileData.sharedWith
//             );
          }
        }
      } catch (notificationError) {
        console.error('Failed to send file modification notifications:', notificationError);
        // Don't fail the entire operation if notification fails
      }
    }
  } catch (error) {
    console.error('Error updating file with notifications:', error);
    throw error;
  }
};

export const deleteFile = async (fileId: string, userId?: string, privateKey?: string) => {
  try {
    // First get the file document to retrieve the storage path and owner
    const fileData = await backendService.files.get(fileId);
    let fileOwner: string | undefined;

    if (fileData) {
      fileOwner = fileData.owner;

      // If the caller is a shared user (not the owner), just remove them from sharedWith
      if (userId && fileData.owner !== userId) {
        const newSharedWith = (fileData.sharedWith as string[]).filter((id: string) => id !== userId);
        await backendService.documents.update('files', fileId, {
          sharedWith: newSharedWith,
        });
        return;
      }
      
      // Check if this is a form file with attachments
      if (fileData.name && userId && privateKey) {
        const { isFormFile } = await import('./utils/formFiles');
        const { FileAccessService } = await import('./services/fileAccess');
        const { getOrDecryptMetadata } = await import('./services/metadataCache');
        
        // Decrypt the filename to check if it's a form
        let fileName: string;
        if (typeof fileData.name === 'string') {
          fileName = fileData.name; // Legacy unencrypted name
        } else {
          const metadata = await getOrDecryptMetadata(fileData, userId, privateKey);
          fileName = metadata.decryptedName;
        }
        
        // If it's a form file, load the form data to delete attachments
        if (isFormFile(fileName)) {
          try {
            console.log('🗑️ Detected form file deletion, checking for attachments...');
            const contentBuffer = await FileAccessService.loadFileContent(fileData, userId, privateKey);
            const formText = new TextDecoder().decode(contentBuffer);
            const formData = JSON.parse(formText);
            
            // Delete all attachment files and image attachments
            const attachmentIds: string[] = [];
            
            // Collect form field attachments
            if (formData.attachments && typeof formData.attachments === 'object') {
              Object.keys(formData.attachments).forEach(fileId => {
                attachmentIds.push(fileId);
              });
            }
            
            // Collect image attachments from rich text fields
            if (formData.imageAttachments && Array.isArray(formData.imageAttachments)) {
              formData.imageAttachments.forEach((img: any) => {
                if (img.fileId) {
                  attachmentIds.push(img.fileId);
                }
              });
            }
            
            // Delete all attachments
            if (attachmentIds.length > 0) {
              console.log(`🗑️ Deleting ${attachmentIds.length} form attachments...`);
              for (const attachmentId of attachmentIds) {
                try {
                  // Recursively call deleteFile for each attachment
                  // Pass userId and privateKey to handle nested forms if needed
                  await deleteFile(attachmentId, userId, privateKey);
                } catch (attachmentError) {
                  console.warn(`Failed to delete attachment ${attachmentId}:`, attachmentError);
                  // Continue with other deletions even if one fails
                }
              }
              console.log('✅ Form attachments deleted');
            }
          } catch (formError) {
            // If we can't load the form, continue with deletion anyway
            // The form might be corrupted or the user might not have access
            console.warn('Could not load form attachments, proceeding with form deletion:', formError);
          }
        }
      }
      
      // Delete from storage if storage path exists
      if (fileData.storagePath) {
        try {
          await backendService.storage.delete(fileData.storagePath);
        } catch (storageError: any) {
          // Don't fail the entire operation if storage deletion fails
          // File might have already been deleted or path might be invalid
          console.warn(`Failed to delete file from storage ${fileData.storagePath}:`, storageError);
        }
      }
    }

    // Delete the database document
    await backendService.files.delete(fileId);
    
    // Invalidate storage usage cache for the file owner
    if (fileOwner) {
      invalidateStorageUsage(fileOwner);
    }
    
  } catch (error) {
    console.error(`Error deleting file ${fileId}:`, error);
    throw error;
  }
};

export const createFileWithSharing = async (fileData: Omit<FileData, 'createdAt'>) => {
  
  try {
    // Initialize userFolders if not provided
    if (!fileData.userFolders) {
      fileData.userFolders = {};
      // Set owner's folder from legacy parent field for backward compatibility
      if (fileData.parent !== undefined) {
        fileData.userFolders[fileData.owner] = fileData.parent;
      }
    }
    
    // Initialize sharedWith if not provided
    if (!fileData.sharedWith) {
      fileData.sharedWith = [];
    }
    
    // Ensure all users in sharedWith have folder associations (default to null)
    fileData.sharedWith.forEach(uid => {
      if (!(uid in fileData.userFolders!)) {
        fileData.userFolders![uid] = null;
      }
    });
    
    // Get folder sharing permissions from owner's folder if file is in a folder
    const ownerFolder = fileData.userFolders[fileData.owner];
    const folderSharedWith = ownerFolder 
      ? await getFolderSharingPermissions(ownerFolder)
      : [];
    
    // Merge folder sharing with existing file sharing
    const allSharedWith = Array.from(new Set([
      ...fileData.sharedWith,
      ...folderSharedWith
    ]));
    
    // Add folder associations for newly shared users
    allSharedWith.forEach(uid => {
      if (!(uid in fileData.userFolders!)) {
        fileData.userFolders![uid] = null;
      }
    });
    
    const newFile: FileData = {
      ...fileData,
      sharedWith: allSharedWith,
      createdAt: backendService.utils.serverTimestamp(),
    };
    
    const docId = await backendService.documents.add('files', newFile);
    
    // Invalidate storage usage cache for the file owner
    invalidateStorageUsage(fileData.owner);
    
    return docId;
  } catch (error) {
    console.error('Error creating file with sharing:', error);
    throw error;
  }
};