import { updateFile, type FileData } from '../files';
import { backendService } from '../backend/BackendService';

/**
 * Get the folder ID for a specific user for a given file
 */
export const getUserFolderForFile = (file: FileData, userId: string): string | null => {
  // Use new userFolders structure if available
  if (file.userFolders && typeof file.userFolders === 'object' && userId in file.userFolders) {
    return file.userFolders[userId];
  }
  
  // Fallback to legacy parent field if user is owner
  if (file.owner === userId) {
    return file.parent;
  }
  
  // Default to root folder (null) for shared files without userFolders
  return null;
};

/**
 * Set the folder association for a specific user for a given file
 */
export const setUserFolderForFile = async (fileId: string, userId: string, folderId: string | null, currentFile?: FileData): Promise<void> => {
  // If currentFile is not provided, fetch it
  let fileData = currentFile;
  if (!fileData) {
    const fetchedFile = await backendService.files.get(fileId);
    if (!fetchedFile) {
      throw new Error(`File ${fileId} not found`);
    }
    fileData = fetchedFile as FileData;
  }
  
  // Build the complete userFolders object with the update
  const userFolders = {
    ...(fileData.userFolders || {}),
    [userId]: folderId
  };
  
  await updateFile(fileId, { userFolders });
};

/**
 * Move a file to a different folder for a specific user
 */
export const moveFileForUser = async (fileId: string, userId: string, targetFolderId: string | null, currentFile?: FileData): Promise<void> => {
  await setUserFolderForFile(fileId, userId, targetFolderId, currentFile);
};

/**
 * Initialize userFolders structure for existing files during migration
 */
export const initializeUserFoldersForFile = async (file: FileData): Promise<void> => {
  if (!file.id || file.userFolders) {
    return; // Already has userFolders or no ID
  }
  
  const userFolders: { [uid: string]: string | null } = {};
  
  // Set owner's folder from legacy parent
  userFolders[file.owner] = file.parent;
  
  // Set all shared users to root folder by default
  file.sharedWith.forEach(uid => {
    if (uid !== file.owner) {
      userFolders[uid] = null;
    }
  });
  
  await updateFile(file.id, { userFolders });
};

/**
 * Add folder association for a newly shared user
 */
export const addUserFolderAssociation = async (fileId: string, userId: string, defaultFolderId: string | null = null): Promise<void> => {
  // Fetch current file
  const currentFile = await backendService.files.get(fileId);
  if (!currentFile) {
    throw new Error(`File ${fileId} not found`);
  }
  
  // Build the complete userFolders object with the new user
  const userFolders = {
    ...(currentFile.userFolders || {}),
    [userId]: defaultFolderId
  };
  
  await updateFile(fileId, { userFolders });
};

/**
 * Remove folder association when user access is revoked
 */
export const removeUserFolderAssociation = async (fileId: string, userId: string): Promise<void> => {
  // Fetch current file
  const currentFile = await backendService.files.get(fileId);
  if (!currentFile) {
    throw new Error(`File ${fileId} not found`);
  }
  
  // Build the complete userFolders object without the user
  const userFolders = { ...(currentFile.userFolders || {}) };
  delete userFolders[userId];
  
  await updateFile(fileId, { userFolders });
};