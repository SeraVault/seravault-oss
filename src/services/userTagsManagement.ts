// @ts-nocheck
/**
 * Service for managing encrypted per-user tags on files
 * Tags are encrypted with the file key for maximum privacy
 */

import { updateFile, type FileData } from '../files';
import { encryptMetadata, decryptMetadata, encryptStringToMetadata, decryptSymmetric, hexToBytes, bytesToHex } from '../crypto/quantumSafeCrypto';
import { getOrDecryptFileKey } from './fileKeyCache';
import { metadataCache } from './metadataCache';

/**
 * Get user's decrypted tags for a file
 */
export const getUserTags = async (
  file: FileData, 
  userId: string, 
  userPrivateKey: string
): Promise<string[]> => {
  // If file has no userTags or no entry for this user, return empty array
  if (!file.userTags || !file.userTags[userId]) {
    return [];
  }

  try {
    // Get user's encrypted file key
    const userEncryptedKey = file.encryptedKeys[userId];
    if (!userEncryptedKey) {
      console.warn('No encrypted key found for user:', userId);
      return [];
    }

    // Decrypt file key using user's private key
    const fileKey = await decryptFileKey(userEncryptedKey, userPrivateKey);
    
    // Decrypt user's tags
    const encryptedTags = file.userTags[userId];

    // Convert hex to bytes for decryption
    const ciphertextBytes = hexToBytes(encryptedTags.ciphertext);
    const nonceBytes = hexToBytes(encryptedTags.nonce);

    // Decrypt using the file key
    const decryptedBytes = await decryptSymmetric(ciphertextBytes, fileKey, nonceBytes);
    const decryptedString = new TextDecoder().decode(decryptedBytes);

    // Parse tags from decrypted JSON
    const tags = JSON.parse(decryptedString || '[]');
    return Array.isArray(tags) ? tags : [];
    
  } catch (error) {
    console.error('Error decrypting user tags:', error);
    return [];
  }
};

/**
 * Set user's encrypted tags for a file (returns updated file object)
 */
export const setUserTags = async (
  file: FileData, 
  userId: string, 
  tags: string[],
  userPrivateKey: string
): Promise<FileData> => {
  try {
    // Get user's encrypted file key
    const userEncryptedKey = file.encryptedKeys[userId];
    if (!userEncryptedKey) {
      throw new Error('No encrypted key found for user');
    }

    // Decrypt file key using user's private key
    const fileKey = await decryptFileKey(userEncryptedKey, userPrivateKey);
    
    // Normalize tags (trim, lowercase for consistency, remove duplicates)
    const normalizedTags = [...new Set(
      tags
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 0)
    )];

    // Encrypt tags using file key
    const encryptedTags = await encryptMetadata(
      { tags: JSON.stringify(normalizedTags) }, 
      fileKey
    );

    // Update file object
    const updatedFile = { ...file };
    if (!updatedFile.userTags) {
      updatedFile.userTags = {};
    } else {
      updatedFile.userTags = { ...updatedFile.userTags };
    }
    
    updatedFile.userTags[userId] = encryptedTags.tags;
    return updatedFile;
    
  } catch (error) {
    console.error('Error encrypting user tags:', error);
    throw error;
  }
};

/**
 * Add a tag to user's tags for a file
 */
export const addUserTag = async (
  file: FileData, 
  userId: string, 
  tag: string,
  userPrivateKey: string
): Promise<FileData> => {
  const currentTags = await getUserTags(file, userId, userPrivateKey);
  const normalizedTag = tag.trim().toLowerCase();
  
  if (!normalizedTag || currentTags.includes(normalizedTag)) {
    return file; // No change needed
  }
  
  return await setUserTags(file, userId, [...currentTags, normalizedTag], userPrivateKey);
};

/**
 * Remove a tag from user's tags for a file
 */
export const removeUserTag = async (
  file: FileData, 
  userId: string, 
  tag: string,
  userPrivateKey: string
): Promise<FileData> => {
  const currentTags = await getUserTags(file, userId, userPrivateKey);
  const normalizedTag = tag.trim().toLowerCase();
  const updatedTags = currentTags.filter(t => t !== normalizedTag);
  
  return await setUserTags(file, userId, updatedTags, userPrivateKey);
};

/**
 * Toggle a tag for a user (add if not present, remove if present)
 */
export const toggleUserTag = async (
  file: FileData, 
  userId: string, 
  tag: string,
  userPrivateKey: string
): Promise<FileData> => {
  const currentTags = await getUserTags(file, userId, userPrivateKey);
  const normalizedTag = tag.trim().toLowerCase();
  
  if (currentTags.includes(normalizedTag)) {
    return await removeUserTag(file, userId, normalizedTag, userPrivateKey);
  } else {
    return await addUserTag(file, userId, normalizedTag, userPrivateKey);
  }
};

/**
 * Update user's encrypted tags for a file in Firestore
 */
export const updateUserTagsInFirestore = async (
  fileId: string, 
  userId: string, 
  tags: string[],
  userPrivateKey: string,
  file: FileData
): Promise<void> => {
  console.log('🏷️  Updating encrypted user tags in Firestore:', {
    fileId,
    userId,
    tagCount: tags.length
  });

  try {
    // Get user's encrypted file key
    const userEncryptedKey = file.encryptedKeys[userId];
    if (!userEncryptedKey) {
      throw new Error('No encrypted key found for user');
    }

    // Decrypt file key
    const fileKey = await decryptFileKey(userEncryptedKey, userPrivateKey);
    
    // Normalize and encrypt tags
    const normalizedTags = [...new Set(
      tags
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 0)
    )];

    // Encrypt the tags array as a JSON string
    const encryptedTags = await encryptStringToMetadata(
      JSON.stringify(normalizedTags),
      fileKey
    );

    // Update the userTags field for this specific user
    const updateData: Partial<FileData> = {
      [`userTags.${userId}`]: encryptedTags
    } as any;

    await updateFile(fileId, updateData);

    // Update cache with new tag data instead of just invalidating
    const cached = metadataCache.get(fileId);
    if (cached && 'tags' in cached) {
      metadataCache.set(fileId, {
        ...cached,
        tags: normalizedTags,
      });
      console.log(`📊 Cache updated with ${normalizedTags.length} tags for file ${fileId}`);
    } else {
      // If not cached, invalidate so it gets cached on next access
      metadataCache.invalidate(fileId);
    }

    console.log('✅ Encrypted user tags updated successfully in Firestore');
    
  } catch (error) {
    console.error('❌ Error updating encrypted user tags:', error);
    throw error;
  }
};

/**
 * Add encrypted user tag association when file is created or shared
 */
export const addUserTagAssociation = async (
  file: FileData, 
  userId: string, 
  userPrivateKey: string,
  initialTags: string[] = []
): Promise<FileData> => {
  return await setUserTags(file, userId, initialTags, userPrivateKey);
};

/**
 * Remove user tag association when file sharing is revoked
 */
export const removeUserTagAssociation = (file: FileData, userId: string): FileData => {
  if (!file.userTags || !(userId in file.userTags)) {
    return file;
  }
  
  const updatedFile = { ...file };
  updatedFile.userTags = { ...file.userTags };
  delete updatedFile.userTags[userId];
  
  return updatedFile;
};

/**
 * Get all unique tags for a user across all their files (requires decryption)
 */
export const getAllUserTags = async (
  files: FileData[],
  userId: string,
  userPrivateKey: string
): Promise<string[]> => {
  console.log(`🏷️ Getting all user tags for ${files.length} files using cache...`);
  const startTime = Date.now();

  const allTags = new Set<string>();

  for (const file of files) {
    try {
      // Try to get tags from cache first
      const cached = metadataCache.get(file.id!);
      let userTags: string[];

      if (cached && 'tags' in cached) {
        // Use cached tags - instant performance!
        userTags = cached.tags;
      } else {
        // Fallback to decryption if not in cache
        userTags = await getUserTags(file, userId, userPrivateKey);
      }

      userTags.forEach(tag => allTags.add(tag));
    } catch (error) {
      console.warn('Failed to decrypt tags for file:', file.id, error);
    }
  }

  const endTime = Date.now();
  console.log(`🏷️ Got all user tags in ${endTime - startTime}ms: ${allTags.size} unique tags`);

  return Array.from(allTags).sort();
};

/**
 * Filter files by tags for a specific user (requires decryption)
 */
export const filterFilesByUserTags = async (
  files: FileData[],
  userId: string,
  userPrivateKey: string,
  selectedTags: string[],
  matchAll: boolean = false
): Promise<FileData[]> => {
  if (selectedTags.length === 0) {
    return files;
  }

  console.log(`🏷️ Filtering ${files.length} files by tags using cache...`);
  const startTime = Date.now();

  const normalizedSelectedTags = selectedTags.map(tag => tag.toLowerCase());
  const matchingFiles: FileData[] = [];

  for (const file of files) {
    try {
      // Try to get tags from cache first
      const cached = metadataCache.get(file.id!);
      let userTags: string[];

      if (cached && 'tags' in cached) {
        // Use cached tags - instant performance!
        userTags = cached.tags;
      } else {
        // Fallback to decryption if not in cache
        userTags = await getUserTags(file, userId, userPrivateKey);
      }

      const normalizedUserTags = userTags.map(tag => tag.toLowerCase());

      let matches = false;
      if (matchAll) {
        // AND logic: file must have ALL selected tags
        matches = normalizedSelectedTags.every(tag => normalizedUserTags.includes(tag));
      } else {
        // OR logic: file must have ANY of the selected tags
        matches = normalizedSelectedTags.some(tag => normalizedUserTags.includes(tag));
      }
      
      if (matches) {
        matchingFiles.push(file);
      }
    } catch (error) {
      console.warn('Failed to decrypt tags for filtering:', file.id, error);
    }
  }

  const endTime = Date.now();
  console.log(`🏷️ Tag filtering completed in ${endTime - startTime}ms: ${matchingFiles.length}/${files.length} files match`);

  return matchingFiles;
};

/**
 * Get tag statistics for a user (requires decryption)
 */
export const getUserTagStats = async (
  files: FileData[],
  userId: string,
  userPrivateKey: string
): Promise<{ [tag: string]: number }> => {
  console.log(`📊 Getting tag statistics for ${files.length} files using cache...`);
  const startTime = Date.now();

  const tagCounts: { [tag: string]: number } = {};

  for (const file of files) {
    try {
      // Try to get tags from cache first
      const cached = metadataCache.get(file.id!);
      let userTags: string[];

      if (cached && 'tags' in cached) {
        // Use cached tags - instant performance!
        userTags = cached.tags;
      } else {
        // Fallback to decryption if not in cache
        userTags = await getUserTags(file, userId, userPrivateKey);
      }

      userTags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    } catch (error) {
      console.warn('Failed to decrypt tags for stats:', file.id, error);
    }
  }

  const endTime = Date.now();
  const uniqueTags = Object.keys(tagCounts).length;
  console.log(`📊 Tag statistics completed in ${endTime - startTime}ms: ${uniqueTags} unique tags`);

  return tagCounts;
};

/**
 * Helper function to decrypt file key using user's private key.
 * Delegates to the shared fileKeyCache so ML-KEM-768 decapsulation only runs once per key per session.
 */
async function decryptFileKey(userEncryptedKey: string, userPrivateKey: string): Promise<Uint8Array> {
  return getOrDecryptFileKey(userEncryptedKey, userPrivateKey);
}