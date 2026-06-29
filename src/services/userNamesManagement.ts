import { backendService } from '../backend/BackendService';
import { decryptMetadata, encryptStringToMetadata } from '../crypto/quantumSafeCrypto';
import { getOrDecryptFileKey } from './fileKeyCache';
import { type FileData } from '../files';

/**
 * Get the user's personalized name for a file
 */
export async function getUserFileName(
  file: FileData,
  userId: string,
  userPrivateKey: string
): Promise<string> {
  try {
    // First check if user has a personalized name
    if (file.userNames && file.userNames[userId]) {
      const encryptedName = file.userNames[userId];
      
      // Validate the encrypted name structure
      if (!encryptedName || typeof encryptedName !== 'object' || !encryptedName.ciphertext || !encryptedName.nonce) {
        console.warn(`Invalid userNames structure for user ${userId}:`, encryptedName);
        // Fall through to use original name
      } else {
        try {
          // Decrypt the user's personalized name
          const fileKey = await getFileKey(file, userId, userPrivateKey);
          const decryptedName = await decryptMetadata(encryptedName, fileKey);
          return decryptedName;
        } catch (decryptError) {
          console.warn(`Failed to decrypt personalized name for user ${userId}:`, decryptError);
          // Fall through to use original name
        }
      }
    }
    
    // Fall back to the original file name (owner's name)
    if (typeof file.name === 'object') {
      // Validate the original name structure
      if (!file.name || !file.name.ciphertext || !file.name.nonce) {
        console.warn('Invalid original name structure:', file.name);
        return '[Encrypted File]';
      }
      
      const fileKey = await getFileKey(file, userId, userPrivateKey);
      const decryptedName = await decryptMetadata(file.name, fileKey);
      return decryptedName;
    } else {
      // Legacy string name
      return file.name;
    }
  } catch (error) {
    console.error('Error getting user file name:', error);
    return '[Encrypted File]';
  }
}

/**
 * Set a user's personalized name for a file
 */
export async function setUserFileName(
  fileId: string,
  fileName: string,
  userId: string,
  userPrivateKey: string,
  file: FileData
): Promise<void> {
  try {
    // Get file key to encrypt the name
    const fileKey = await getFileKey(file, userId, userPrivateKey);
    
    // Encrypt the new name
    const encryptedName = await encryptStringToMetadata(fileName, fileKey);
    
    // Update the userNames field for this specific user
    const updateData = {
      [`userNames.${userId}`]: encryptedName,
      lastModified: new Date()
    };
    
    await backendService.documents.update('files', fileId, updateData);
    console.log(`✅ Updated personalized name for user ${userId} on file ${fileId}`);
  } catch (error) {
    console.error('Error setting user file name:', error);
    throw error;
  }
}

/**
 * Remove a user's personalized name for a file (falls back to original name)
 */
export async function removeUserFileName(
  fileId: string,
  userId: string
): Promise<void> {
  try {
    const updateData = {
      [`userNames.${userId}`]: null,
      lastModified: new Date()
    };
    
    await backendService.documents.update('files', fileId, updateData);
    console.log(`✅ Removed personalized name for user ${userId} on file ${fileId}`);
  } catch (error) {
    console.error('Error removing user file name:', error);
    throw error;
  }
}

/**
 * Helper function to get and decrypt the file key for a user.
 * Uses the shared fileKeyCache so ML-KEM-768 decapsulation only runs once per key per session.
 */
async function getFileKey(
  file: FileData,
  userId: string,
  userPrivateKey: string
): Promise<Uint8Array> {
  const encryptedKey = file.encryptedKeys[userId];
  if (!encryptedKey) {
    throw new Error(`User ${userId} does not have access to this file`);
  }
  return getOrDecryptFileKey(encryptedKey, userPrivateKey);
}

/**
 * Initialize userNames for newly shared users (called during file sharing)
 */
export async function initializeUserNamesForNewUsers(
  file: FileData,
  newUserIds: string[],
  fileKey: Uint8Array
): Promise<{ [userId: string]: { ciphertext: string; nonce: string } }> {
  const userNames: { [userId: string]: { ciphertext: string; nonce: string } } = {};
  
  try {
    // Get the original file name to use as default
    let originalName = '[Encrypted File]';
    if (typeof file.name === 'object') {
      const decryptedOriginal = await decryptMetadata(file.name, fileKey);
      originalName = decryptedOriginal;
    } else {
      originalName = file.name;
    }
    
    // Create encrypted copies of the original name for new users
    for (const userId of newUserIds) {
      const encryptedName = await encryptStringToMetadata(originalName, fileKey);
      userNames[userId] = encryptedName;
    }
    
    return userNames;
  } catch (error) {
    console.error('Error initializing user names for new users:', error);
    return {};
  }
}