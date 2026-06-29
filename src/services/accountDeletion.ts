/**
 * Account Deletion Service
 * Handles complete user account deletion including all associated data
 * 
 * @deprecated Prefer using the 'deleteUserAccount' Cloud Function for reliability.
 * This client-side implementation is kept for reference or specific use cases.
 */

import { backendService } from '../backend/BackendService';
import type { QueryConstraint } from '../backend/BackendInterface';

interface DeletionProgress {
  step: string;
  current: number;
  total: number;
}

/**
 * Delete all user data from Firestore and Storage, then delete the auth account
 */
export async function deleteUserAccount(
  userId: string,
  onProgress?: (progress: DeletionProgress) => void
): Promise<void> {
  if (!userId) {
    throw new Error('No userId provided for deletion');
  }

  const updateProgress = (step: string, current: number, total: number) => {
    if (onProgress) {
      onProgress({ step, current, total });
    }
  };

  try {
    // Step 1: Delete user's files from Storage
    updateProgress('Deleting storage files', 0, 100);
    await deleteUserStorageFiles(userId, (current, total) => {
      updateProgress('Deleting storage files', current, total);
    });

    // Step 2: Delete user's files from Firestore
    updateProgress('Deleting file records', 0, 100);
    await deleteUserFiles(userId);

    // Step 3: Delete user's folders
    updateProgress('Deleting folders', 0, 100);
    await deleteUserFolders(userId);

    // Step 4: Delete user's contacts and contact requests
    updateProgress('Deleting contacts', 0, 100);
    await deleteUserContacts(userId);

    // Step 5: Delete user's groups
    updateProgress('Deleting groups', 0, 100);
    await deleteUserGroups(userId);

    // Step 6: Delete user's notifications
    updateProgress('Deleting notifications', 0, 100);
    await deleteUserNotifications(userId);

    // Step 7: Delete user's conversations/chats
    updateProgress('Deleting conversations', 0, 100);
    await deleteUserConversations(userId);

    // Step 8: Remove user from shared files
    updateProgress('Cleaning up shared files', 0, 100);
    await removeUserFromSharedFiles(userId);

    // Step 9: Remove user from shared folders (TODO: implement when folder sharing is added)
    // updateProgress('Cleaning up shared folders', 0, 100);
    // await removeUserFromSharedFolders(userId);

    // Step 10: Delete user profile
    updateProgress('Deleting user profile', 0, 1);
    await deleteUserProfile(userId);

    // Step 11: Delete authentication account
    updateProgress('Deleting authentication account', 0, 1);
    
    // Only attempt to delete auth account if the current user is the one being deleted
    const currentUser = backendService.auth.getCurrentUser();
    if (currentUser && currentUser.uid === userId) {
      await backendService.auth.deleteAccount();
    } else {
      console.warn('Skipping auth account deletion: Current user does not match target userId');
    }

    updateProgress('Account deletion complete', 1, 1);
  } catch (error) {
    console.error('Error deleting user account:', error);
    throw new Error(`Failed to delete account: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete all files owned by the user from Storage
 */
async function deleteUserStorageFiles(
  userId: string,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  try {
    const userStoragePath = `users/${userId}`;
    await deleteFolderRecursive(userStoragePath, onProgress);
  } catch (error) {
    console.error('Error deleting storage files:', error);
    // Continue with deletion even if storage cleanup fails
  }
}

/**
 * Recursively delete a folder and its contents
 */
async function deleteFolderRecursive(
  path: string, 
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const listing = await backendService.storage.list(path);
  
  let current = 0;
  const total = listing.items.length;
  
  // Delete items
  const deletePromises = listing.items.map(async (itemPath) => {
    await backendService.storage.delete(itemPath);
    current++;
    if (onProgress) onProgress(current, total);
  });
  
  await Promise.all(deletePromises);

  // Recurse into subfolders
  for (const prefix of listing.prefixes) {
    await deleteFolderRecursive(prefix, onProgress);
  }
}

/**
 * Delete all file records owned by the user from Firestore
 */
async function deleteUserFiles(userId: string): Promise<void> {
  const constraints: QueryConstraint[] = [
    { type: 'where', field: 'owner', operator: '==', value: userId }
  ];

  const files = await backendService.query.getPath('files', constraints);
  
  if (files.length > 0) {
    const operations = files.map(file => ({
      collection: 'files',
      id: file.id
    }));
    await backendService.batch.delete(operations);
  }
}

/**
 * Delete all folders owned by the user
 */
async function deleteUserFolders(userId: string): Promise<void> {
  const constraints: QueryConstraint[] = [
    { type: 'where', field: 'owner', operator: '==', value: userId }
  ];

  const folders = await backendService.query.getPath('folders', constraints);
  
  if (folders.length > 0) {
    const operations = folders.map(folder => ({
      collection: 'folders',
      id: folder.id
    }));
    await backendService.batch.delete(operations);
  }
}

/**
 * Delete all contacts where user is involved
 */
async function deleteUserContacts(userId: string): Promise<void> {
  // Delete contacts where user is userId1
  const constraints1: QueryConstraint[] = [
    { type: 'where', field: 'userId1', operator: '==', value: userId }
  ];

  // Delete contacts where user is userId2
  const constraints2: QueryConstraint[] = [
    { type: 'where', field: 'userId2', operator: '==', value: userId }
  ];

  const [contacts1, contacts2] = await Promise.all([
    backendService.query.getPath('contacts', constraints1),
    backendService.query.getPath('contacts', constraints2)
  ]);

  const allContacts = [...contacts1, ...contacts2];

  if (allContacts.length > 0) {
    const operations = allContacts.map(contact => ({
      collection: 'contacts',
      id: contact.id
    }));
    await backendService.batch.delete(operations);
  }

  // Delete contact requests sent by user
  const fromConstraints: QueryConstraint[] = [
    { type: 'where', field: 'fromUserId', operator: '==', value: userId }
  ];

  // Delete contact requests sent to user
  const toConstraints: QueryConstraint[] = [
    { type: 'where', field: 'toUserId', operator: '==', value: userId }
  ];

  const [fromRequests, toRequests] = await Promise.all([
    backendService.query.getPath('contactRequests', fromConstraints),
    backendService.query.getPath('contactRequests', toConstraints)
  ]);

  const allRequests = [...fromRequests, ...toRequests];
  
  if (allRequests.length > 0) {
    const operations = allRequests.map(req => ({
      collection: 'contactRequests',
      id: req.id
    }));
    await backendService.batch.delete(operations);
  }
}

/**
 * Delete all groups owned by the user
 */
async function deleteUserGroups(userId: string): Promise<void> {
  const constraints: QueryConstraint[] = [
    { type: 'where', field: 'ownerId', operator: '==', value: userId }
  ];

  const groups = await backendService.query.getPath('groups', constraints);
  
  if (groups.length > 0) {
    const operations = groups.map(group => ({
      collection: 'groups',
      id: group.id
    }));
    await backendService.batch.delete(operations);
  }
}

/**
 * Delete all notifications for the user
 */
async function deleteUserNotifications(userId: string): Promise<void> {
  const constraints: QueryConstraint[] = [
    { type: 'where', field: 'userId', operator: '==', value: userId }
  ];

  const notifications = await backendService.query.getPath('notifications', constraints);
  
  if (notifications.length > 0) {
    const operations = notifications.map(notif => ({
      collection: 'notifications',
      id: notif.id
    }));
    await backendService.batch.delete(operations);
  }
}

/**
 * Delete all conversations where user is a participant
 */
async function deleteUserConversations(userId: string): Promise<void> {
  const constraints: QueryConstraint[] = [
    { type: 'where', field: 'participants', operator: 'array-contains', value: userId }
  ];

  const conversations = await backendService.query.getPath('conversations', constraints);
  
  if (conversations.length > 0) {
    const operations = conversations.map(conv => ({
      collection: 'conversations',
      id: conv.id
    }));
    await backendService.batch.delete(operations);
  }
}

/**
 * Remove user from sharedWith arrays in files they don't own
 */
async function removeUserFromSharedFiles(userId: string): Promise<void> {
  const constraints: QueryConstraint[] = [
    { type: 'where', field: 'sharedWith', operator: 'array-contains', value: userId }
  ];

  const sharedFiles = await backendService.query.getPath('files', constraints);
  
  if (sharedFiles.length > 0) {
    const operations = sharedFiles.map(file => {
      const data = file;
      const sharedWith = (data.sharedWith || []).filter((uid: string) => uid !== userId);
      const encryptedKeys = { ...data.encryptedKeys };
      delete encryptedKeys[userId];

      return {
        collection: 'files',
        id: file.id,
        data: { 
          sharedWith,
          encryptedKeys,
          [`userFavorites.${userId}`]: null,
          [`userFolders.${userId}`]: null,
          [`userTags.${userId}`]: null,
          [`userNames.${userId}`]: null
        }
      };
    });
    
    await backendService.batch.update(operations);
  }
}

/**
 * Delete user profile document
 */
async function deleteUserProfile(userId: string): Promise<void> {
  await backendService.documents.delete('users', userId);
}
