/**
 * Offline File Cache Service
 *
 * Stores encrypted file blobs in IndexedDB for offline access.
 * Files are stored encrypted and decrypted on-demand.
 *
 * Features:
 * - 500MB cache size limit
 * - LRU eviction when cache is full
 * - No expiry - files persist until manually cleared or evicted
 * - Files remain encrypted at rest
 */

import { cacheLogger } from '../utils/cacheLogger';

const DB_NAME = 'SeraVaultOfflineFiles';
const DB_VERSION = 1;
const STORE_NAME = 'encryptedFiles';
const METADATA_STORE = 'fileMetadata';

export interface CachedFile {
  fileId: string;
  blob: Blob;
  storagePath: string;
  cachedAt: number;
  size: number;
  mimeType: string;
}

export interface FileMetadata {
  fileId: string;
  availableOffline: boolean;
  lastAccessed: number;
  downloadedAt: number;
}

class OfflineFileCache {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private readonly MAX_CACHE_SIZE = 500 * 1024 * 1024; // 500MB total cache

  /**
   * Initialize IndexedDB
   */
  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create store for encrypted file blobs
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const fileStore = db.createObjectStore(STORE_NAME, { keyPath: 'fileId' });
          fileStore.createIndex('cachedAt', 'cachedAt', { unique: false });
          fileStore.createIndex('storagePath', 'storagePath', { unique: false });
        }

        // Create store for file metadata (offline flags, etc.)
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          const metadataStore = db.createObjectStore(METADATA_STORE, { keyPath: 'fileId' });
          metadataStore.createIndex('availableOffline', 'availableOffline', { unique: false });
          metadataStore.createIndex('lastAccessed', 'lastAccessed', { unique: false });
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * Store an encrypted file blob for offline access
   */
  async cacheFile(
    fileId: string,
    data: Blob | ArrayBuffer,
    storagePath: string,
    mimeType: string = 'application/octet-stream'
  ): Promise<void> {
    try {
      const db = await this.getDB();
      
      // Convert ArrayBuffer to Blob if needed
      const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
      
      // Check cache size before adding
      const currentSize = await this.getCacheSize();
      if (currentSize + blob.size > this.MAX_CACHE_SIZE) {
        cacheLogger.warn('⚠️ Cache full, removing old files');
        await this.cleanupOldFiles();
      }

      const cachedFile: CachedFile = {
        fileId,
        blob,
        storagePath,
        cachedAt: Date.now(),
        size: blob.size,
        mimeType,
      };

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(cachedFile);

        request.onsuccess = () => {
          cacheLogger.info(`✅ Cached file ${fileId} for offline access (${(blob.size / 1024).toFixed(2)} KB)`);
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error caching file:', error);
      throw error;
    }
  }

  /**
   * Retrieve a cached file blob
   */
  async getCachedFile(fileId: string): Promise<Blob | null> {
    const cached = await this.getCachedFileWithMetadata(fileId);
    return cached ? cached.blob : null;
  }

  /**
   * Retrieve a cached file with full metadata
   */
  async getCachedFileWithMetadata(fileId: string): Promise<CachedFile | null> {
    try {
      const db = await this.getDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(fileId);

        request.onsuccess = () => {
          const cached = request.result as CachedFile | undefined;
          
          if (!cached) {
            resolve(null);
            return;
          }

          // Update last accessed time
          this.updateLastAccessed(fileId);

          cacheLogger.info(`✅ Retrieved cached file ${fileId} from offline storage`);
          resolve(cached);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error retrieving cached file:', error);
      return null;
    }
  }

  /**
   * Check if a file is cached
   */
  async isCached(fileId: string): Promise<boolean> {
    try {
      const db = await this.getDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(fileId);

        request.onsuccess = () => {
          const cached = request.result as CachedFile | undefined;
          
          if (!cached) {
            resolve(false);
            return;
          }

          resolve(true);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error checking cached file:', error);
      return false;
    }
  }

  /**
   * Remove a specific file from cache
   */
  async removeCachedFile(fileId: string): Promise<void> {
    try {
      const db = await this.getDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, METADATA_STORE], 'readwrite');
        
        const fileStore = transaction.objectStore(STORE_NAME);
        const metadataStore = transaction.objectStore(METADATA_STORE);
        
        fileStore.delete(fileId);
        metadataStore.delete(fileId);

        transaction.oncomplete = () => {
          cacheLogger.info(`🗑️ Removed cached file ${fileId}`);
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (error) {
      console.error('Error removing cached file:', error);
      throw error;
    }
  }

  /**
   * Mark a file as available offline
   */
  async markAvailableOffline(fileId: string, available: boolean): Promise<void> {
    try {
      const db = await this.getDB();

      const metadata: FileMetadata = {
        fileId,
        availableOffline: available,
        lastAccessed: Date.now(),
        downloadedAt: Date.now(),
      };

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([METADATA_STORE], 'readwrite');
        const store = transaction.objectStore(METADATA_STORE);
        const request = store.put(metadata);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error marking file offline status:', error);
      throw error;
    }
  }

  /**
   * Check if a file is marked as available offline
   */
  async isMarkedOffline(fileId: string): Promise<boolean> {
    try {
      const db = await this.getDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([METADATA_STORE], 'readonly');
        const store = transaction.objectStore(METADATA_STORE);
        const request = store.get(fileId);

        request.onsuccess = () => {
          const metadata = request.result as FileMetadata | undefined;
          resolve(metadata?.availableOffline || false);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error checking offline status:', error);
      return false;
    }
  }

  /**
   * Get all files marked as available offline
   */
  async getOfflineFiles(): Promise<string[]> {
    try {
      const db = await this.getDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([METADATA_STORE], 'readonly');
        const store = transaction.objectStore(METADATA_STORE);
        const index = store.index('availableOffline');
        const request = index.getAllKeys();

        request.onsuccess = () => {
          // Filter to only get files where availableOffline is true
          const allRequest = store.getAll();
          allRequest.onsuccess = () => {
            const metadata = (allRequest.result as FileMetadata[]).filter(m => m.availableOffline);
            resolve(metadata.map(m => m.fileId));
          };
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error getting offline files:', error);
      return [];
    }
  }

  /**
   * Get current cache size in bytes
   */
  async getCacheSize(): Promise<number> {
    try {
      const db = await this.getDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          const files = request.result as CachedFile[];
          const totalSize = files.reduce((sum, file) => sum + file.size, 0);
          resolve(totalSize);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error calculating cache size:', error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{ fileCount: number; totalSize: number; availableOffline: number }> {
    try {
      const db = await this.getDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, METADATA_STORE], 'readonly');
        const fileStore = transaction.objectStore(STORE_NAME);
        const metadataStore = transaction.objectStore(METADATA_STORE);

        const fileRequest = fileStore.getAll();
        const metadataRequest = metadataStore.getAll();

        let files: CachedFile[] = [];
        let allMetadata: FileMetadata[] = [];

        fileRequest.onsuccess = () => {
          files = fileRequest.result as CachedFile[];
        };

        metadataRequest.onsuccess = () => {
          allMetadata = metadataRequest.result as FileMetadata[];
        };

        transaction.oncomplete = () => {
          const totalSize = files.reduce((sum, file) => sum + file.size, 0);
          const offlineFiles = allMetadata.filter(m => m.availableOffline);
          resolve({
            fileCount: files.length,
            totalSize,
            availableOffline: offlineFiles.length,
          });
        };

        transaction.onerror = () => reject(transaction.error);
      });
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return { fileCount: 0, totalSize: 0, availableOffline: 0 };
    }
  }

  /**
   * Update last accessed time
   */
  private async updateLastAccessed(fileId: string): Promise<void> {
    try {
      const db = await this.getDB();

      const transaction = db.transaction([METADATA_STORE], 'readwrite');
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.get(fileId);

      request.onsuccess = () => {
        const metadata = request.result as FileMetadata | undefined;
        if (metadata) {
          metadata.lastAccessed = Date.now();
          store.put(metadata);
        }
      };
    } catch (error) {
      // Non-critical, just log
      console.warn('Could not update last accessed time:', error);
    }
  }

  /**
   * Clean up oldest files to free space using LRU (Least Recently Used)
   * Removes oldest 20% of files (excluding those marked as available offline)
   */
  async cleanupOldFiles(): Promise<void> {
    try {
      const db = await this.getDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, METADATA_STORE], 'readwrite');
        const fileStore = transaction.objectStore(STORE_NAME);
        const metadataStore = transaction.objectStore(METADATA_STORE);
        
        const fileRequest = fileStore.getAll();

        fileRequest.onsuccess = async () => {
          const files = fileRequest.result as CachedFile[];
          
          // Sort by cache time (oldest first)
          files.sort((a, b) => a.cachedAt - b.cachedAt);
          
          // Remove oldest 20% of files
          const filesToRemove = Math.ceil(files.length * 0.2);
          
          for (let i = 0; i < filesToRemove; i++) {
            const file = files[i];
            
            // Don't remove files marked as available offline
            const metadata = await new Promise<FileMetadata | undefined>((res) => {
              const req = metadataStore.get(file.fileId);
              req.onsuccess = () => res(req.result as FileMetadata | undefined);
              req.onerror = () => res(undefined);
            });

            if (!metadata?.availableOffline) {
              fileStore.delete(file.fileId);
              cacheLogger.info(`🗑️ Cleaned up old cached file: ${file.fileId}`);
            }
          }
        };

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (error) {
      console.error('Error cleaning up old files:', error);
      throw error;
    }
  }

  /**
   * Clear all cached files
   */
  async clearAll(): Promise<void> {
    try {
      const db = await this.getDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, METADATA_STORE], 'readwrite');
        const fileStore = transaction.objectStore(STORE_NAME);
        const metadataStore = transaction.objectStore(METADATA_STORE);
        
        fileStore.clear();
        metadataStore.clear();

        transaction.oncomplete = () => {
          cacheLogger.info('🗑️ Cleared all offline file cache');
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (error) {
      console.error('Error clearing cache:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const offlineFileCache = new OfflineFileCache();
