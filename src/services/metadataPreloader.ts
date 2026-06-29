/**
 * Background metadata preloader - eagerly caches all file metadata after passphrase entry
 * This makes search and navigation instant by pre-decrypting all filenames, sizes, and tags
 */

import { backendService } from '../backend/BackendService';
import { metadataCache, getOrDecryptMetadata } from './metadataCache';
import type { FileData } from '../files';

export class MetadataPreloader {
  private isPreloading = false;
  private preloadPromise: Promise<void> | null = null;

  /**
   * Preload all file metadata for a user in the background
   */
  async preloadAllMetadata(userId: string, privateKey: string): Promise<void> {
    // Prevent multiple simultaneous preloads
    if (this.isPreloading) {
      return this.preloadPromise || Promise.resolve();
    }

    this.isPreloading = true;
    console.log('🚀 Starting background metadata preload for all files...');

    this.preloadPromise = this.performPreload(userId, privateKey);

    try {
      await this.preloadPromise;
    } finally {
      this.isPreloading = false;
      this.preloadPromise = null;
    }
  }

  private async performPreload(userId: string, privateKey: string): Promise<void> {
    try {
      const startTime = Date.now();

      // Query for all files the user has access to using backend service
      console.log('📡 Fetching all user files from backend...');
      const [ownedFiles, sharedFiles] = await Promise.all([
        backendService.files.getUserFiles(userId),
        backendService.files.getSharedFiles(userId)
      ]);

      // Combine and deduplicate files
      const allFiles = new Map<string, any>();

      ownedFiles.forEach(file => {
        allFiles.set(file.id!, file);
      });

      sharedFiles.forEach(file => {
        if (!allFiles.has(file.id!)) {
          allFiles.set(file.id!, file);
        }
      });

      const totalFiles = allFiles.size;
      console.log(`📋 Found ${totalFiles} files to preload metadata for`);

      if (totalFiles === 0) {
        console.log('✅ No files to preload');
        return;
      }

      // Check how many are already cached
      const fileIds = Array.from(allFiles.keys());
      const cachedEntries = metadataCache.getBatch(fileIds);
      const uncachedCount = totalFiles - cachedEntries.size;

      console.log(`📊 Preload cache status: ${cachedEntries.size}/${totalFiles} already cached, ${uncachedCount} to decrypt`);

      if (uncachedCount === 0) {
        console.log('✅ All file metadata already cached!');
        return;
      }

      // Process uncached files in small batches to avoid blocking UI
      const uncachedFiles = Array.from(allFiles.values()).filter(file => !cachedEntries.has(file.id));
      // Smaller batches on low-core devices (typically mobile) so the JS thread
      // yields more often and the UI stays responsive during ML-KEM preloading.
      const batchSize = (navigator.hardwareConcurrency ?? 4) <= 4 ? 4 : 10;
      let processed = 0;

      for (let i = 0; i < uncachedFiles.length; i += batchSize) {
        const batch = uncachedFiles.slice(i, i + batchSize);

        console.log(`🔓 Preloading batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(uncachedFiles.length/batchSize)} (${batch.length} files)`);

        // Process batch in parallel
        await Promise.all(
          batch.map(async (fileData) => {
            try {
              // Check if user has access to this file
              if (!fileData.encryptedKeys || !fileData.encryptedKeys[userId]) {
                return; // Skip files without access
              }

              // Decrypt and cache metadata
              await getOrDecryptMetadata(fileData, userId, privateKey);
              processed++;

              // Log progress every 25 files
              if (processed % 25 === 0) {
                console.log(`📈 Preload progress: ${processed}/${uncachedCount} files processed`);
              }
            } catch (error) {
              console.warn(`Failed to preload metadata for file ${fileData.id}:`, error);
            }
          })
        );

        // Small delay between batches to keep UI responsive
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`✅ Metadata preload completed in ${duration}ms:`);
      console.log(`   - Total files: ${totalFiles}`);
      console.log(`   - Already cached: ${cachedEntries.size}`);
      console.log(`   - Newly cached: ${processed}`);
      console.log(`   - Failed: ${uncachedCount - processed}`);
      console.log(`🚀 All searches and navigation should now be instant!`);

    } catch (error) {
      console.error('Error during metadata preload:', error);
    }
  }

  /**
   * Check if preload is currently running
   */
  isRunning(): boolean {
    return this.isPreloading;
  }

  /**
   * Cancel ongoing preload (if possible)
   */
  cancel(): void {
    this.isPreloading = false;
    this.preloadPromise = null;
  }
}

// Export singleton instance
export const metadataPreloader = new MetadataPreloader();