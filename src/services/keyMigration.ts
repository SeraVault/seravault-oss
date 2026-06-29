import { backendService } from '../backend/BackendService';
import { decryptData, encryptData, hexToBytes, bytesToHex } from '../crypto/quantumSafeCrypto';

interface FileDocument {
  id: string;
  encryptedKeys: { [userId: string]: string };
  [key: string]: any;
}

/**
 * Count how many files and folders would be affected by key regeneration
 */
export async function countUserFiles(userId: string): Promise<number> {
  try {
    // Query for files owned by user
    const ownedFiles = await backendService.query.get('files', [
      { type: 'where', field: 'owner', operator: '==', value: userId }
    ]);
    
    // Query for files shared with user
    const sharedFiles = await backendService.query.get('files', [
      { type: 'where', field: 'sharedWith', operator: 'array-contains', value: userId }
    ]);

    // Query for folders owned by user  
    const folders = await backendService.query.get('folders', [
      { type: 'where', field: 'owner', operator: '==', value: userId }
    ]);

    // Use Set to avoid counting duplicates
    const itemIds = new Set();
    
    // Count files
    ownedFiles.forEach((doc: any) => {
      if (doc.encryptedKeys && doc.encryptedKeys[userId]) {
        itemIds.add(`file_${doc.id}`);
      }
    });
    
    sharedFiles.forEach(data => {
      if (data.encryptedKeys && data.encryptedKeys[userId]) {
        itemIds.add(`file_${data.id}`);
      }
    });

    // Count folders
    folders.forEach(data => {
      if (data.encryptedKeys && data.encryptedKeys[userId]) {
        itemIds.add(`folder_${data.id}`);
      }
    });

    console.log('=== DEBUG: Key Migration Count ===');
    console.log(`User ID: ${userId}`);
    console.log(`Owned files found: ${ownedFiles.length}`);
    console.log(`Shared files found: ${sharedFiles.length}`);
    console.log(`Folders found: ${folders.length}`);
    console.log(`Total encrypted items found: ${itemIds.size}`);
    
    // Debug individual items
    ownedFiles.forEach(data => {
      console.log(`Owned file ${data.id}:`, {
        hasEncryptedKeys: !!data.encryptedKeys,
        hasUserKey: !!(data.encryptedKeys && data.encryptedKeys[userId]),
        encryptedKeys: data.encryptedKeys
      });
    });
    
    folders.forEach(data => {
      console.log(`Folder ${data.id}:`, {
        hasEncryptedKeys: !!data.encryptedKeys,
        hasUserKey: !!(data.encryptedKeys && data.encryptedKeys[userId]),
        encryptedKeys: data.encryptedKeys
      });
    });
    
    return itemIds.size;
  } catch (error) {
    console.error('Error counting user files:', error);
    return 0;
  }
}

/**
 * Migrate all user's files and folders from old ML-KEM-768 key to new ML-KEM-768 key
 */
export async function migrateUserFiles(
  userId: string,
  oldPrivateKeyHex: string,
  newPublicKeyBytes: Uint8Array,
  onProgress?: (current: number, total: number) => void
): Promise<{ success: number; failed: string[] }> {
  const results = { success: 0, failed: [] as string[] };
  
  try {
    // Get all files that have encrypted keys for this user
    const [ownedFiles, sharedFiles, folders] = await Promise.all([
      backendService.query.get('files', [{ field: 'owner', operator: '==', value: userId }]),
      backendService.query.get('files', [{ field: 'sharedWith', operator: 'array-contains', value: userId }]),
      backendService.query.get('folders', [{ field: 'owner', operator: '==', value: userId }])
    ]);

    // Combine all items, avoiding duplicates
    const itemsMap = new Map<string, { id: string; collection: string; data: any }>();
    
    // Note: ownedFiles, sharedFiles, and folders are already populated with data above
    // No need to iterate again
    
    const items = Array.from(itemsMap.values());
    const total = items.length;
    let current = 0;

    console.log(`Starting migration of ${total} items (files & folders) for user ${userId}`);

    for (const item of items) {
      try {
        // Decrypt the AES key with the old private key
        const userEncryptedKey = item.data.encryptedKeys[userId];
        const keyData = hexToBytes(userEncryptedKey);
        
        // ML-KEM-768 encrypted keys: IV (12 bytes) + encapsulated_key (1088 bytes) + ciphertext
        const iv = keyData.slice(0, 12);
        const encapsulatedKey = keyData.slice(12, 12 + 1088);
        const ciphertext = keyData.slice(12 + 1088);
        
        const oldPrivateKeyBytes = hexToBytes(oldPrivateKeyHex);
        const aesKey = await decryptData(
          { iv, encapsulatedKey, ciphertext },
          oldPrivateKeyBytes
        );

        // Re-encrypt the AES key with the new public key
        const newEncryptedData = await encryptData(aesKey, newPublicKeyBytes);
        
        // Store as: IV + encapsulated_key + ciphertext (same format as original encryption)
        const newKeyData = new Uint8Array(
          newEncryptedData.iv.length + newEncryptedData.encapsulatedKey.length + newEncryptedData.ciphertext.length
        );
        newKeyData.set(newEncryptedData.iv, 0);
        newKeyData.set(newEncryptedData.encapsulatedKey, newEncryptedData.iv.length);
        newKeyData.set(newEncryptedData.ciphertext, newEncryptedData.iv.length + newEncryptedData.encapsulatedKey.length);

        // Update the document
        const updatedEncryptedKeys = {
          ...item.data.encryptedKeys,
          [userId]: bytesToHex(newKeyData)
        };

        await backendService.documents.update(item.collection, item.id, {
          encryptedKeys: updatedEncryptedKeys
        });

        results.success++;
        current++;
        
        if (onProgress) {
          onProgress(current, total);
        }
        
        console.log(`Migrated ${item.collection.slice(0, -1)} ${item.id} (${current}/${total})`);

      } catch (error) {
        console.error(`Failed to migrate ${item.collection.slice(0, -1)} ${item.id}:`, error);
        results.failed.push(`${item.collection.slice(0, -1)}_${item.id}`);
        current++;
        
        if (onProgress) {
          onProgress(current, total);
        }
      }
    }

    console.log(`Migration completed: ${results.success} success, ${results.failed.length} failed`);
    return results;

  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  }
}

/**
 * Check if user has accessible files that would be lost
 */
export async function hasAccessibleFiles(userId: string): Promise<boolean> {
  const count = await countUserFiles(userId);
  return count > 0;
}