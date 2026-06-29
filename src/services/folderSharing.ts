/**
 * Service for folder sharing operations
 * Handles sharing folders and all contained files with users
 */

import { shareFolder, getSubfolders, getAllFilesInFolder, getAllFilesRecursively, type Folder as FolderData } from '../firestore';
import { FileOperationsService } from './fileOperations';
import { type FileData } from '../files';
import { backendService } from '../backend/BackendService';

export class FolderSharingService {
  /**
   * Share a folder, all its sub-folders, and all files with specified users.
   * Preserves the folder hierarchy: files appear inside their correct folders
   * in the recipient's view, and sub-folders are nested under their parent.
   *
   * @param folderId - The folder to share
   * @param ownerUserId - The owner's user ID
   * @param ownerPrivateKey - The owner's private key (hex string)
   * @param recipientUserIds - Array of user IDs to share with
   * @param recipientParentFolderId - The folder ID that this folder will appear
   *   under in each recipient's view (null = root). Used for recursive calls.
   */
  static async shareFolderWithUsers(
    folderId: string,
    ownerUserId: string,
    ownerPrivateKey: string,
    recipientUserIds: string[],
    recipientParentFolderId: string | null = null
  ): Promise<void> {
    console.log(`📁 Sharing folder ${folderId} with users:`, recipientUserIds, `under parent ${recipientParentFolderId}`);

    // 1. Share this folder itself — encrypt the folder key for each recipient
    //    and set their userFolders location to recipientParentFolderId.
    const recipientUserFolders: { [uid: string]: string | null } = {};
    recipientUserIds.forEach(uid => { recipientUserFolders[uid] = recipientParentFolderId; });

    await shareFolder(folderId, recipientUserIds, ownerUserId, ownerPrivateKey, recipientUserFolders);
    console.log(`✅ Folder ${folderId} shared with encrypted keys`);

    // 2. Share files directly inside this folder, placing them in folderId for recipients.
    const directFiles = await getAllFilesInFolder(folderId, ownerUserId);
    console.log(`📄 Found ${directFiles.length} direct files in folder ${folderId}`);

    let fileSuccessCount = 0;
    let fileErrorCount = 0;

    for (const file of directFiles) {
      try {
        const newRecipients = recipientUserIds.filter(uid => !file.sharedWith?.includes(uid));
        if (newRecipients.length === 0) {
          fileSuccessCount++;
          continue;
        }

        await FileOperationsService.shareFileWithUsers(
          file as FileData,
          ownerUserId,
          ownerPrivateKey,
          newRecipients,
          folderId  // files appear inside this folder for recipients
        );

        fileSuccessCount++;
        console.log(`✅ Shared file ${file.id} (${fileSuccessCount}/${directFiles.length})`);
      } catch (error) {
        console.error(`❌ Failed to share file ${file.id}:`, error);
        fileErrorCount++;
      }
    }

    // 3. Recurse into sub-folders, placing each sub-folder under folderId for recipients.
    const subfolders = await getSubfolders(folderId, ownerUserId);
    console.log(`📂 Found ${subfolders.length} sub-folders in folder ${folderId}`);

    for (const subfolder of subfolders) {
      try {
        await FolderSharingService.shareFolderWithUsers(
          subfolder.id!,
          ownerUserId,
          ownerPrivateKey,
          recipientUserIds,
          folderId  // sub-folder appears under folderId in recipient's view
        );
      } catch (error) {
        console.error(`❌ Failed to share sub-folder ${subfolder.id}:`, error);
      }
    }

    console.log(`🎉 Folder sharing completed: ${fileSuccessCount} files shared, ${fileErrorCount} errors`);
  }

  /**
   * Unshare a folder and all its files from specified users
   * 
   * @param folderId - The folder to unshare
   * @param userIdsToRemove - Array of user IDs to remove access from
   */
  static async unshareFolderFromUsers(
    folderId: string,
    userIdsToRemove: string[]
  ): Promise<void> {
    console.log(`📁 Unsharing folder ${folderId} from users:`, userIdsToRemove);

    // 1. Get the folder
    const folder = await backendService.documents.get('folders', folderId) as FolderData;
    if (!folder) {
      throw new Error('Folder not found');
    }

    // 2. Remove users from folder's sharedWith
    const updatedSharedWith = (folder.sharedWith || []).filter(uid => !userIdsToRemove.includes(uid));
    const updatedUserFolders = { ...(folder.userFolders || {}) };
    userIdsToRemove.forEach(uid => delete updatedUserFolders[uid]);

    await backendService.documents.update('folders', folderId, {
      sharedWith: updatedSharedWith,
      userFolders: updatedUserFolders
    });

    // 3. Get all files in the folder
    const allFiles = await getAllFilesRecursively(folderId, folder.owner);
    console.log(`📄 Found ${allFiles.length} files in folder ${folderId}`);

    // 4. Unshare each file from the users
    let successCount = 0;
    let errorCount = 0;

    for (const file of allFiles) {
      try {
        // Remove users from file's sharedWith
        const updatedFileSharedWith = (file.sharedWith || []).filter(
          (uid: string) => !userIdsToRemove.includes(uid)
        );

        // Remove encrypted keys for removed users
        const updatedEncryptedKeys = { ...file.encryptedKeys };
        userIdsToRemove.forEach(uid => delete updatedEncryptedKeys[uid]);

        // Remove userFolders entries for removed users
        const updatedFileUserFolders = { ...(file.userFolders || {}) };
        userIdsToRemove.forEach(uid => delete updatedFileUserFolders[uid]);

        await backendService.documents.update('files', file.id, {
          sharedWith: updatedFileSharedWith,
          encryptedKeys: updatedEncryptedKeys,
          userFolders: updatedFileUserFolders
        });

        successCount++;
        console.log(`✅ Unshared file ${file.id} (${successCount}/${allFiles.length})`);
      } catch (error) {
        console.error(`❌ Failed to unshare file ${file.id}:`, error);
        errorCount++;
      }
    }

    console.log(`🎉 Folder unsharing completed: ${successCount} files unshared, ${errorCount} errors`);
  }

  /**
   * Move a shared folder to a different location for a specific user
   * Similar to how files can be moved per-user, but for folders
   * 
   * @param folderId - The folder to move
   * @param userId - The user moving the folder
   * @param targetParentFolderId - The new parent folder (null for root)
   */
  static async moveFolderForUser(
    folderId: string,
    userId: string,
    targetParentFolderId: string | null
  ): Promise<void> {
    console.log(`📁 Moving folder ${folderId} for user ${userId} to parent ${targetParentFolderId}`);

    // Get the folder
    const folder = await backendService.documents.get('folders', folderId) as FolderData;
    if (!folder) {
      throw new Error('Folder not found');
    }

    // Check if user has access
    const hasAccess = folder.owner === userId || (folder.sharedWith || []).includes(userId);
    if (!hasAccess) {
      throw new Error('User does not have access to this folder');
    }

    // If user is the owner, update the actual parent field
    if (folder.owner === userId) {
      await backendService.documents.update('folders', folderId, {
        parent: targetParentFolderId
      });
    } else {
      // If user is not the owner, update their userFolders location only
      const userFolders = {
        ...(folder.userFolders || {}),
        [userId]: targetParentFolderId
      };

      await backendService.documents.update('folders', folderId, {
        userFolders
      });
    }

    console.log(`✅ Folder moved successfully for user ${userId}`);
  }

  /**
   * Get the folder location for a specific user
   * Returns the parent folder ID for that user's view
   * 
   * @param folder - The folder data
   * @param userId - The user ID
   * @returns The parent folder ID for this user (null = root)
   */
  static getUserFolderLocation(folder: FolderData, userId: string): string | null {
    // Owner uses the actual parent field
    if (folder.owner === userId) {
      return folder.parent;
    }

    // Shared users use their userFolders entry
    if (folder.userFolders && userId in folder.userFolders) {
      return folder.userFolders[userId];
    }

    // Default to root for shared users without specific location
    return null;
  }
}
