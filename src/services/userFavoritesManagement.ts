import { updateFile, type FileData } from '../files';

/**
 * Get the favorite status for a specific user for a given file
 */
export const getUserFavoriteStatus = (file: FileData, userId: string): boolean => {
  // Use new userFavorites structure if available
  if (file.userFavorites && typeof file.userFavorites === 'object' && userId in file.userFavorites) {
    return file.userFavorites[userId] === true;
  }
  
  // Fallback to legacy isFavorite field if user is owner (for backward compatibility)
  if (file.owner === userId && file.isFavorite !== undefined) {
    return file.isFavorite;
  }
  
  // Default to not favorite
  return false;
};

/**
 * Set the favorite status for a specific user for a given file
 */
export const setUserFavoriteStatus = async (fileId: string, userId: string, isFavorite: boolean): Promise<void> => {
  const updatePath = `userFavorites.${userId}`;
  const updateData = {
    [updatePath]: isFavorite,
    lastModified: new Date().toISOString()
  };
  
  await updateFile(fileId, updateData);
};

/**
 * Toggle favorite status for a specific user for a given file
 */
export const toggleUserFavorite = async (file: FileData, userId: string): Promise<boolean> => {
  if (!file.id) {
    throw new Error('File ID is required to toggle favorite status');
  }
  
  const currentStatus = getUserFavoriteStatus(file, userId);
  const newStatus = !currentStatus;
  
  await setUserFavoriteStatus(file.id, userId, newStatus);
  
  return newStatus;
};

/**
 * Add favorite association for a newly shared user (defaults to false)
 */
export const addUserFavoriteAssociation = async (fileId: string, userId: string): Promise<void> => {
  const updatePath = `userFavorites.${userId}`;
  const updateData = {
    [updatePath]: false // Default to not favorite for newly shared files
  };
  
  await updateFile(fileId, updateData);
};

/**
 * Remove favorite association when user access is revoked
 */
export const removeUserFavoriteAssociation = async (fileId: string, userId: string): Promise<void> => {
  // Note: We don't actually delete the field, just set it to false to maintain data structure
  const updatePath = `userFavorites.${userId}`;
  const updateData = {
    [updatePath]: false
  };
  
  await updateFile(fileId, updateData);
};

/**
 * Initialize userFavorites structure for existing files during migration
 */
export const initializeUserFavoritesForFile = async (file: FileData): Promise<void> => {
  if (!file.id || file.userFavorites) {
    return; // Already has userFavorites or no ID
  }
  
  const userFavorites: { [uid: string]: boolean } = {};
  
  // Set owner's favorite from legacy isFavorite field
  userFavorites[file.owner] = file.isFavorite || false;
  
  // Set all shared users to not favorite by default
  file.sharedWith.forEach(uid => {
    if (uid !== file.owner) {
      userFavorites[uid] = false;
    }
  });
  
  await updateFile(file.id, { userFavorites });
};