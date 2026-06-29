/**
 * Persistent cache for decrypted file metadata to speed up search and filtering
 * Now uses IndexedDB for offline persistence
 */

import type { FileData } from '../files';

export interface CachedFileMetadata {
  id: string;
  decryptedName: string;
  decryptedSize: string;
  tags: string[];
  formType?: string; // Form category/type for display
  formCategory?: string; // Raw form category from template
  lastModified: number; // timestamp for cache invalidation
}

export interface CachedFolderMetadata {
  id: string;
  decryptedName: string;
  decryptedSize?: string;
  lastModified: number; // timestamp for cache invalidation
}

export type CachedMetadata = CachedFileMetadata | CachedFolderMetadata;

// Helper to check if metadata is file metadata
function isFileMetadata(metadata: CachedMetadata): metadata is CachedFileMetadata {
  return 'tags' in metadata;
}

const DB_NAME = 'SeraVaultMetadataCache';
const DB_VERSION = 1;
const STORE_NAME = 'decryptedMetadata';

class MetadataCache {
  private memoryCache = new Map<string, CachedMetadata>(); // Fast in-memory cache
  private dbPromise: Promise<IDBDatabase> | null = null;
  private readonly CACHE_TTL_SHORT = 15 * 60 * 1000; // 15 minutes - matches passphrase timeout
  private readonly CACHE_TTL_LONG = 60 * 60 * 1000; // 60 minutes - matches extended passphrase timeout
  private currentTTL = this.CACHE_TTL_SHORT; // Default to short timeout

  constructor() {
    this.initDB();
  }

  /**
   * Initialize IndexedDB
   */
  private initDB(): void {
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        // Load all data into memory cache on startup
        this.loadAllToMemory(db);
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('lastModified', 'lastModified', { unique: false });
        }
      };
    });
  }

  /**
   * Load all cached metadata into memory for fast access
   */
  private async loadAllToMemory(db: IDBDatabase): Promise<void> {
    try {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = request.result as CachedMetadata[];
        items.forEach(item => {
          // Only load non-expired items
          if (Date.now() - item.lastModified <= this.currentTTL) {
            this.memoryCache.set(item.id, item);
          }
        });
        console.log(`📦 Loaded ${this.memoryCache.size} cached metadata items from IndexedDB`);
      };
    } catch (error) {
      console.error('Error loading cache to memory:', error);
    }
  }

  /**
   * Set cache timeout to match passphrase timeout preference
   */
  setTimeoutPreference(rememberLonger: boolean): void {
    this.currentTTL = rememberLonger ? this.CACHE_TTL_LONG : this.CACHE_TTL_SHORT;
  }

  /**
   * Save metadata to IndexedDB
   */
  private async saveToDB(metadata: CachedMetadata): Promise<void> {
    try {
      const db = await this.dbPromise;
      if (!db) return;
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put(metadata);
    } catch (error) {
      console.error('Failed to save metadata to IndexedDB:', error);
    }
  }

  /**
   * Delete metadata from IndexedDB
   */
  private async deleteFromDB(itemId: string): Promise<void> {
    try {
      const db = await this.dbPromise;
      if (!db) return;
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.delete(itemId);
    } catch (error) {
      console.error('Failed to delete metadata from IndexedDB:', error);
    }
  }

  /**
   * Clear all metadata from IndexedDB
   */
  private async clearDB(): Promise<void> {
    try {
      const db = await this.dbPromise;
      if (!db) return;
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
    } catch (error) {
      console.error('Failed to clear IndexedDB:', error);
    }
  }

  /**
   * Get cached metadata for a file or folder
   */
  get(itemId: string): CachedMetadata | null {
    const cached = this.memoryCache.get(itemId);
    if (!cached) return null;

    // Check if cache entry is expired using current TTL
    if (Date.now() - cached.lastModified > this.currentTTL) {
      this.memoryCache.delete(itemId);
      this.deleteFromDB(itemId); // Also remove from IndexedDB
      return null;
    }

    return cached;
  }

  /**
   * Set cached metadata for a file or folder
   */
  set(itemId: string, metadata: Omit<CachedMetadata, 'id' | 'lastModified'>): void {
    const cachedData: CachedMetadata = {
      id: itemId,
      ...metadata,
      lastModified: Date.now(),
    } as CachedMetadata;
    
    this.memoryCache.set(itemId, cachedData);
    this.saveToDB(cachedData); // Persist to IndexedDB
  }

  /**
   * Invalidate cache for a specific file
   */
  invalidate(fileId: string): void {
    this.memoryCache.delete(fileId);
    this.deleteFromDB(fileId);
  }

  /**
   * Invalidate cache for multiple files
   */
  invalidateMultiple(fileIds: string[]): void {
    for (const fileId of fileIds) {
      this.memoryCache.delete(fileId);
      this.deleteFromDB(fileId);
    }
  }

  /**
   * Invalidate cache if file was modified
   * Used to detect when files have been updated on the server
   */
  invalidateIfModified(fileId: string, currentModifiedTime: number): void {
    const cached = this.memoryCache.get(fileId);
    if (cached) {
      // If the cached entry is older than the file's modified time, invalidate it
      if (cached.lastModified < currentModifiedTime) {
        console.log(`🔄 Invalidating stale cache for ${fileId}`);
        this.memoryCache.delete(fileId);
        this.deleteFromDB(fileId);
      }
    }
  }

  /**
   * Clear all cached metadata
   */
  clear(): void {
    this.memoryCache.clear();
    this.clearDB();
  }

  /**
   * Clear expired cache entries (alias for clearExpired)
   */
  cleanup(): void {
    this.clearExpired();
  }

  /**
   * Clear expired cache entries
   */
  clearExpired(): void {
    const now = Date.now();
    for (const [fileId, metadata] of this.memoryCache.entries()) {
      if (now - metadata.lastModified > this.currentTTL) {
        this.memoryCache.delete(fileId);
        this.deleteFromDB(fileId);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; ttl: number } {
    return {
      size: this.memoryCache.size,
      ttl: this.currentTTL,
    };
  }

  /**
   * Get all cached file metadata for building complete file lists
   */
  getAllCachedFileMetadata(): Map<string, CachedFileMetadata> {
    const fileMetadata = new Map<string, CachedFileMetadata>();
    const now = Date.now();

    for (const [itemId, metadata] of this.memoryCache.entries()) {
      // Check if not expired and is file metadata (has tags field)
      if (
        (now - metadata.lastModified <= this.currentTTL) &&
        isFileMetadata(metadata)
      ) {
        fileMetadata.set(itemId, metadata);
      }
    }

    return fileMetadata;
  }

  /**
   * Batch get multiple cached entries
   */
  getBatch(itemIds: string[]): Map<string, CachedMetadata> {
    const result = new Map<string, CachedMetadata>();
    const now = Date.now();

    for (const itemId of itemIds) {
      const cached = this.memoryCache.get(itemId);
      if (cached && (now - cached.lastModified <= this.currentTTL)) {
        result.set(itemId, cached);
      }
    }

    return result;
  }

  /**
   * Batch set multiple entries
   */
  setBatch(entries: Array<{ fileId: string; metadata: Omit<CachedFileMetadata, 'id' | 'lastModified'> }>): void {
    const now = Date.now();
    for (const { fileId, metadata } of entries) {
      const cachedData: CachedFileMetadata = {
        id: fileId,
        ...metadata,
        lastModified: now,
      };
      this.memoryCache.set(fileId, cachedData);
      this.saveToDB(cachedData);
    }
  }

  /**
   * Build file data from cache, using original files as fallback
   * Used for instant loading when all files are cached
   */
  buildFileDataFromCache(fileIds: string[], originalFiles: FileData[]): FileData[] {
    const result: FileData[] = [];
    
    for (const fileId of fileIds) {
      const originalFile = originalFiles.find(f => f.id === fileId);
      if (!originalFile) continue;
      
      const cached = this.memoryCache.get(fileId);
      
      if (cached && isFileMetadata(cached)) {
        // Use cached metadata
        result.push({
          ...originalFile,
          name: cached.decryptedName,
          size: cached.decryptedSize,
        });
      } else {
        // Use original file (encrypted metadata)
        result.push(originalFile);
      }
    }
    
    return result;
  }
}

// Export singleton instance
export const metadataCache = new MetadataCache();

// Cleanup expired entries every 5 minutes (more frequent than TTL for efficiency)
// This ensures memory doesn't grow indefinitely with expired entries
setInterval(() => {
  const beforeSize = metadataCache.getStats().size;
  metadataCache.cleanup();
  const afterSize = metadataCache.getStats().size;

  if (beforeSize !== afterSize) {
    console.log(`🧹 Cache cleanup: ${beforeSize - afterSize} expired entries removed, ${afterSize} remaining`);
  }
}, 5 * 60 * 1000);

// Folder metadata caching can be added later if needed

/**
 * Helper function to get or decrypt and cache file metadata
 */
export const getOrDecryptMetadata = async (
  file: FileData,
  userId: string,
  privateKey: string
): Promise<CachedFileMetadata> => {
  // Check cache first
  const cached = metadataCache.get(file.id!);
  if (cached && isFileMetadata(cached)) {
    return cached;
  }

  // Cache miss - decrypt and cache the metadata
  try {
    // Check if user has access to this file
    const userEncryptedKey = file.encryptedKeys?.[userId];
    if (!userEncryptedKey) {
      console.error('No encrypted key found for user:', {
        userId,
        fileId: file.id,
        fileName: file.name,
        hasEncryptedKeys: !!file.encryptedKeys,
        encryptedKeysKeys: file.encryptedKeys ? Object.keys(file.encryptedKeys) : [],
        userInKeys: file.encryptedKeys ? userId in file.encryptedKeys : false,
        fullFile: file
      });
      throw new Error('User does not have access to this file');
    }
    
    // Get user's personalized file name
    const { getUserFileName } = await import('./userNamesManagement');
    const decryptedName = await getUserFileName(file, userId, privateKey);

    // Decrypt file size
    const { FileEncryptionService } = await import('./fileEncryption');
    console.log('About to decrypt metadata:', {
      userId,
      fileId: file.id,
      userEncryptedKey,
      userEncryptedKeyType: typeof userEncryptedKey,
      userEncryptedKeyLength: userEncryptedKey?.length,
      encryptedName: file.name,
      encryptedSize: file.size
    });
    const { size: decryptedSize } = await FileEncryptionService.decryptFileMetadata(
      file.name as { ciphertext: string; nonce: string },
      file.size as { ciphertext: string; nonce: string },
      userEncryptedKey,
      privateKey
    );

    // Get user tags
    const { getUserTags } = await import('./userTagsManagement');
    const tags = await getUserTags(file, userId, privateKey);

    // Extract form type from filename if this is a form file
    let formType: string | undefined;
    let formCategory: string | undefined;
    if (decryptedName.endsWith('.form')) {
      const { getFormTypeFromFilename } = await import('../utils/formFiles');
      formCategory = getFormTypeFromFilename(decryptedName) || undefined;
      formType = formCategory;
    }

    const metadata: Omit<CachedFileMetadata, 'id' | 'lastModified'> = {
      decryptedName,
      decryptedSize,
      tags,
      formType,
      formCategory,
    };

    // Cache the result
    metadataCache.set(file.id!, metadata);

    return {
      id: file.id!,
      ...metadata,
      lastModified: Date.now(),
    };
  } catch (error) {
    console.error('Error decrypting file metadata:', error);
    const fallbackMetadata: Omit<CachedFileMetadata, 'id' | 'lastModified'> = {
      decryptedName: '[Encrypted File]',
      decryptedSize: '',
      tags: [],
    };

    // Cache the fallback to avoid repeated failures
    metadataCache.set(file.id!, fallbackMetadata);

    return {
      id: file.id!,
      ...fallbackMetadata,
      lastModified: Date.now(),
    };
  }
};