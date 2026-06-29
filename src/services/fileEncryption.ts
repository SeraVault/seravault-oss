// @ts-nocheck
/**
 * Centralized service for file encryption, decryption, and key management
 * Eliminates redundant encryption logic across components
 */

import { encryptData, decryptData, encryptMetadata, decryptMetadata, hexToBytes, bytesToHex } from '../crypto/quantumSafeCrypto';
import { getOrDecryptFileKey } from './fileKeyCache';
import { getUserProfile } from '../firestore';

export interface FileEncryptionResult {
  encryptedContent: Uint8Array;
  encryptedKeys: { [userId: string]: string };
  encryptedMetadata: {
    name: { ciphertext: string; nonce: string };
    size: { ciphertext: string; nonce: string };
  };
  storagePath: string;
  fileKey: Uint8Array;
}

export interface DecryptionResult {
  content: Uint8Array;
  name: string;
  size: string;
}

export class FileEncryptionService {
  /**
   * Encrypt a file for multiple users with proper key management
   */
  static async encryptFileForUsers(
    content: Uint8Array,
    fileName: string,
    fileSize: number,
    userIds: string[],
    ownerId: string,
    parentFolder?: string | null
  ): Promise<FileEncryptionResult> {
    // Generate file key for content encryption
    const fileKey = crypto.getRandomValues(new Uint8Array(32));
    
    // Encrypt file content with AES-GCM
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const aesKey = await crypto.subtle.importKey('raw', fileKey, { name: 'AES-GCM' }, false, ['encrypt']);
    const encryptedContentBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      content
    );

    // Create final content: [12-byte IV][AES-encrypted content]
    const encryptedContent = new Uint8Array(12 + encryptedContentBuffer.byteLength);
    encryptedContent.set(iv, 0);
    encryptedContent.set(new Uint8Array(encryptedContentBuffer), 12);

    // Encrypt file key for each user using post-quantum encryption (in parallel)
    const encryptedKeyEntries = await Promise.all(
      userIds.map(async (userId) => {
        const userProfile = await getUserProfile(userId);
        if (!userProfile?.publicKey) {
          throw new Error(`Public key not found for user: ${userId}`);
        }

        const publicKey = hexToBytes(userProfile.publicKey);
        const encryptedKeyResult = await encryptData(fileKey, publicKey);

        const keyData = new Uint8Array(
          encryptedKeyResult.iv.length +
          encryptedKeyResult.encapsulatedKey.length +
          encryptedKeyResult.ciphertext.length
        );
        keyData.set(encryptedKeyResult.iv, 0);
        keyData.set(encryptedKeyResult.encapsulatedKey, encryptedKeyResult.iv.length);
        keyData.set(encryptedKeyResult.ciphertext, encryptedKeyResult.iv.length + encryptedKeyResult.encapsulatedKey.length);

        return [userId, bytesToHex(keyData)] as const;
      })
    );
    const encryptedKeys: { [userId: string]: string } = Object.fromEntries(encryptedKeyEntries);

    // Encrypt metadata
    const encryptedMetadata = await encryptMetadata(
      { name: fileName, size: fileSize.toString() },
      fileKey
    );

    // Generate storage path
    const storagePath = `files/${ownerId}/${crypto.randomUUID()}`;

    return {
      encryptedContent,
      encryptedKeys,
      encryptedMetadata,
      storagePath,
      fileKey
    };
  }

  /**
   * Decrypt file content using user's private key
   */
  static async decryptFile(
    encryptedContent: Uint8Array,
    encryptedKey: string,
    userPrivateKey: string
  ): Promise<Uint8Array> {
    // Demo mode sentinel — skip ML-KEM entirely, use all-zeros key
    if (encryptedKey === 'DEMO') {
      const { DEMO_FILE_KEY } = await import('./fileKeyCache');
      const fileKey = DEMO_FILE_KEY;
      if (encryptedContent.length < 12) throw new Error('Invalid encrypted content format');
      const contentIv = encryptedContent.slice(0, 12);
      const content = encryptedContent.slice(12);
      const aesKey = await crypto.subtle.importKey('raw', fileKey, { name: 'AES-GCM' }, false, ['decrypt']);
      const decryptedContent = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: contentIv }, aesKey, content);
      return new Uint8Array(decryptedContent);
    }

    // Parse the encrypted key (IV + encapsulated_key + ciphertext for ML-KEM-768)
    const keyData = hexToBytes(encryptedKey);
    
    // ML-KEM-768: IV (12 bytes) + encapsulated key (1088 bytes) + ciphertext
    const iv = keyData.slice(0, 12);
    const encapsulatedKey = keyData.slice(12, 12 + 1088);
    const ciphertext = keyData.slice(12 + 1088);
    
    // Decrypt the file key using ML-KEM-768
    const privateKeyBytes = hexToBytes(userPrivateKey);
    const fileKey = await decryptData(
      { iv, encapsulatedKey, ciphertext },
      privateKeyBytes
    );
    
    // Extract IV and encrypted content  
    if (encryptedContent.length < 12) {
      throw new Error('Invalid encrypted content format');
    }
    
    const contentIv = encryptedContent.slice(0, 12);
    const content = encryptedContent.slice(12);
    
    // Decrypt the file content with AES-GCM
    const aesKey = await crypto.subtle.importKey('raw', fileKey, { name: 'AES-GCM' }, false, ['decrypt']);
    const decryptedContent = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: contentIv },
      aesKey,
      content
    );
    
    return new Uint8Array(decryptedContent);
  }

  /**
   * Decrypt file metadata (name and size)
   */
  static async decryptFileMetadata(
    encryptedName: { ciphertext: string; nonce: string },
    encryptedSize: { ciphertext: string; nonce: string },
    encryptedKey: string,
    userPrivateKey: string
  ): Promise<{ name: string; size: string }> {
    // Get the file key — uses in-memory cache after first decapsulation.
    const fileKey = await getOrDecryptFileKey(encryptedKey, userPrivateKey);

    // Decrypt metadata
    const name = await decryptMetadata(encryptedName, fileKey);
    const size = await decryptMetadata(encryptedSize, fileKey);

    return { name, size };
  }

  /**
   * Re-encrypt file key for additional users (for sharing)
   */
  static async shareFileWithUsers(
    originalEncryptedKey: string,
    userPrivateKey: string,
    newUserIds: string[]
  ): Promise<{ [userId: string]: string }> {

    // Decrypt the original file key  
    const keyData = hexToBytes(originalEncryptedKey);

    // ML-KEM-768: IV (12 bytes) + encapsulated key (1088 bytes) + ciphertext
    const iv = keyData.slice(0, 12);
    const encapsulatedKey = keyData.slice(12, 12 + 1088);
    const ciphertext = keyData.slice(12 + 1088);
    

    const privateKeyBytes = hexToBytes(userPrivateKey);

    let fileKey: Uint8Array;
    try {
      fileKey = await decryptData(
        { iv, encapsulatedKey, ciphertext },
        privateKeyBytes
      );
    } catch (error) {
      throw new Error(`Cannot decrypt file key for sharing: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Encrypt file key for new users in parallel
    const newEncryptedKeys: { [userId: string]: string } = {};
    
    await Promise.all(newUserIds.map(async (userId) => {
      const userProfile = await getUserProfile(userId);
      if (!userProfile || !userProfile.publicKey) return;

      const publicKeyBytes = hexToBytes(userProfile.publicKey);
      if (publicKeyBytes.length !== 1184) return;

      try {
        const encryptedKeyResult = await encryptData(fileKey, publicKeyBytes);
        
        // Store as: IV + encapsulated_key + ciphertext (ML-KEM-768 format)
        const combinedKeyData = new Uint8Array(
          encryptedKeyResult.iv.length + 
          encryptedKeyResult.encapsulatedKey.length + 
          encryptedKeyResult.ciphertext.length
        );
        combinedKeyData.set(encryptedKeyResult.iv, 0);
        combinedKeyData.set(encryptedKeyResult.encapsulatedKey, encryptedKeyResult.iv.length);
        combinedKeyData.set(encryptedKeyResult.ciphertext, encryptedKeyResult.iv.length + encryptedKeyResult.encapsulatedKey.length);
        
        newEncryptedKeys[userId] = bytesToHex(combinedKeyData);
      } catch (error) {
        console.error(`❌ Failed to encrypt file key for user ${userId}:`, error);
        // Skip this user but continue with others
      }
    }));

    return newEncryptedKeys;
  }

  /**
   * Generate a unique storage path for a file
   */
  static generateStoragePath(ownerId: string): string {
    return `files/${ownerId}/${crypto.randomUUID()}`;
  }

  /**
   * Create file record data for Firestore
   */
  static async createFileRecord(
    ownerId: string,
    encryptedMetadata: { name: { ciphertext: string; nonce: string }; size: { ciphertext: string; nonce: string } },
    storagePath: string,
    encryptedKeys: { [userId: string]: string },
    sharedWith: string[],
    parentFolder?: string | null,
    fileKey?: Uint8Array,
    additionalData?: Record<string, any>
  ) {
    // Create per-user folder associations
    const userFolders: { [userId: string]: string | null } = {};
    
    // Set owner's folder
    userFolders[ownerId] = parentFolder || null;
    
    // Set all other users to root folder by default
    sharedWith.forEach(userId => {
      if (userId !== ownerId) {
        userFolders[userId] = null;
      }
    });

    // Create per-user favorite associations
    const userFavorites: { [userId: string]: boolean } = {};
    
    // Set all users to not favorite by default
    sharedWith.forEach(userId => {
      userFavorites[userId] = false;
    });

    // Create per-user encrypted tag associations
    const userTags: { [userId: string]: { ciphertext: string; nonce: string } } = {};
    let hasUserTags = false;
    
    // Set all users to empty encrypted tags by default
    if (fileKey) {
      for (const userId of sharedWith) {
        // Create empty tags encrypted with file key
        const emptyTagsJson = JSON.stringify([]);
        const encryptedTags = await encryptMetadata({ tags: emptyTagsJson }, fileKey);
        userTags[userId] = encryptedTags.tags;
      }
      hasUserTags = true;
    }

    // Create per-user name associations
    const userNames: { [userId: string]: { ciphertext: string; nonce: string } } = {};
    let hasUserNames = false;
    
    // Initialize user names with the original file name for all shared users
    if (fileKey) {
      // Get the original file name to use as default for all users
      const originalName = encryptedMetadata.name;
      const decryptedOriginal = await decryptMetadata(originalName, fileKey);
      
      for (const userId of sharedWith) {
        // Create encrypted copy of the original name for each user
        const encryptedName = await encryptMetadata(decryptedOriginal, fileKey);
        userNames[userId] = encryptedName;
      }
      hasUserNames = true;
    }

    const fileRecord = {
      owner: ownerId,
      name: encryptedMetadata.name,
      size: encryptedMetadata.size,
      parent: parentFolder || null, // Keep for backward compatibility
      userFolders,
      storagePath,
      encryptedKeys,
      sharedWith,
      createdAt: new Date(),
      lastModified: new Date(),
      isFavorite: false, // Keep for backward compatibility
      userFavorites,
      ...additionalData
    };

    // Only include userTags if we have a fileKey and can properly encrypt them
    if (hasUserTags) {
      fileRecord.userTags = userTags;
    }

    // Only include userNames if we have a fileKey and can properly encrypt them
    if (hasUserNames) {
      fileRecord.userNames = userNames;
    }

    return fileRecord;
  }
}