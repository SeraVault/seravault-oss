/**
 * Centralized service for folder encryption and key management
 * Ensures consistent folder encryption across the application
 */

import { encryptData, encryptMetadata, bytesToHex, hexToBytes } from '../crypto/quantumSafeCrypto';
import { getPublicKeyForEncryption } from './keyManagement';

export interface FolderEncryptionResult {
  encryptedMetadata: {
    name: { ciphertext: string; nonce: string };
    size: { ciphertext: string; nonce: string };
  };
  encryptedKeys: { [userId: string]: string };
}

export class FolderEncryptionService {
  /**
   * Encrypt folder name and metadata for a user
   */
  static async encryptFolderForUser(
    folderName: string,
    userId: string,
    userPrivateKey: string
  ): Promise<FolderEncryptionResult> {
    // Use centralized key management to get the correct public key
    const publicKeyHex = await getPublicKeyForEncryption(userId, userPrivateKey);
    const publicKey = hexToBytes(publicKeyHex);

    // Generate a random key for folder metadata encryption
    const metadataKey = crypto.getRandomValues(new Uint8Array(32));
    
    // Encrypt the metadata key using quantum-safe ML-KEM-768 + AES
    const encryptedKeyResult = await encryptData(metadataKey, publicKey);
    const iv = encryptedKeyResult.iv;
    const encapsulatedKey = encryptedKeyResult.encapsulatedKey;
    const cipherText = encryptedKeyResult.ciphertext;
    
    // Combine IV, encapsulated key, and ciphertext for storage
    const combinedKeyData = new Uint8Array(iv.length + encapsulatedKey.length + cipherText.length);
    combinedKeyData.set(iv, 0);
    combinedKeyData.set(encapsulatedKey, iv.length);
    combinedKeyData.set(cipherText, iv.length + encapsulatedKey.length);
    
    // Encrypt the folder name (folders have size '0')
    const encryptedMetadata = await encryptMetadata(
      { name: folderName, size: '0' },
      metadataKey
    );

    // Store the encrypted key for this user
    const encryptedKeys = {
      [userId]: bytesToHex(combinedKeyData)
    };

    return {
      encryptedMetadata,
      encryptedKeys
    };
  }

  /**
   * Create a folder document object ready for Firestore
   */
  static createFolderDocument(
    owner: string,
    encryptedMetadata: FolderEncryptionResult['encryptedMetadata'],
    encryptedKeys: { [userId: string]: string },
    parent: string | null
  ) {
    return {
      owner,
      name: encryptedMetadata.name,
      parent,
      encryptedKeys,
      createdAt: new Date(),
      lastModified: new Date(),
    };
  }
}