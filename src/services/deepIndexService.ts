/**
 * Deep Index Service - Persistent background indexing for form contents
 * 
 * This service runs independently of component lifecycle, allowing
 * indexing to continue even when users navigate to different pages.
 */

import type { FileData } from '../files';
import type { CachedFileMetadata } from './metadataCache';
import { FileAccessService } from './fileAccess';
import { FileEncryptionService } from './fileEncryption';
import { isFormFile } from '../utils/formFiles';

export interface DeepIndexProgress {
  isIndexing: boolean;
  total: number;
  processed: number;
  currentFile?: string;
}

type ProgressListener = (progress: DeepIndexProgress) => void;

/**
 * Shared version extractor - must be used consistently in both deepIndexService
 * and useGlobalFileIndex to ensure cache keys match.
 */
export const extractFileVersion = (file: FileData): string => {
  if (!file) return 'unknown';
  const candidate = (file as any).lastModified || (file as any).modifiedAt || (file as any).updatedAt;
  if (candidate?.seconds !== undefined) {
    return `${candidate.seconds}-${candidate.nanoseconds ?? 0}`;
  }
  if (typeof candidate?.toMillis === 'function') {
    return `${candidate.toMillis()}`;
  }
  if (typeof candidate === 'number' || typeof candidate === 'string') {
    return `${candidate}`;
  }
  return `${file.id || 'unknown'}`;
};

class DeepIndexService {
  private formTextCache: Map<string, string> = new Map();

  constructor() {
    // Remove any previously persisted plaintext cache (security cleanup)
    try { localStorage.removeItem('seravault_deep_index_cache'); } catch { /* ignore */ }
  }
  private indexingPromise: Promise<void> | null = null;
  private progressListeners: Set<ProgressListener> = new Set();
  private currentProgress: DeepIndexProgress = {
    isIndexing: false,
    total: 0,
    processed: 0,
  };
  private shouldCancel = false;

  addProgressListener(listener: ProgressListener): () => void {
    this.progressListeners.add(listener);
    listener({ ...this.currentProgress });
    return () => { this.progressListeners.delete(listener); };
  }

  private notifyProgress(progress: DeepIndexProgress): void {
    this.currentProgress = { ...progress };
    this.progressListeners.forEach(listener => {
      try { listener({ ...this.currentProgress }); } catch { /* ignore */ }
    });
  }

  /**
   * Get current indexing progress
   */
  getProgress(): DeepIndexProgress {
    return { ...this.currentProgress };
  }

  /**
   * Check if a form file is already indexed
   */
  hasCache(fileId: string, fileVersion: string): boolean {
    const cacheKey = `${fileId}:${fileVersion}`;
    return this.formTextCache.has(cacheKey);
  }

  /**
   * Get cached search text for a file
   */
  getCache(fileId: string, fileVersion: string): string | undefined {
    const cacheKey = `${fileId}:${fileVersion}`;
    return this.formTextCache.get(cacheKey);
  }

  /**
   * Set cached search text for a file
   */
  setCache(fileId: string, fileVersion: string, searchText: string): void {
    const cacheKey = `${fileId}:${fileVersion}`;
    this.formTextCache.set(cacheKey, searchText);
  }

  /**
   * Clear all cached search text
   */
  clearCache(): void {
    this.formTextCache.clear();
  }

  /**
   * Invalidate cache entries for a specific file
   */
  invalidateFileCache(fileId: string): void {
    const keysToDelete: string[] = [];
    this.formTextCache.forEach((_, key) => {
      if (key.startsWith(`${fileId}:`)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.formTextCache.delete(key));
  }

  /**
   * Check if any forms are indexed
   */
  hasAnyIndex(): boolean {
    return this.formTextCache.size > 0;
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.formTextCache.size;
  }

  // Use the shared exported extractFileVersion
  private extractFileVersion(file: FileData): string {
    return extractFileVersion(file);
  }

  /**
   * Build searchable text from form content
   */
  private async buildFormSearchText(
    file: FileData,
    userId: string,
    privateKey: string,
    forceRefresh = false
  ): Promise<string | undefined> {
    try {
      let contentBuffer: Uint8Array | ArrayBuffer;
      
      if (forceRefresh) {
        // Force fresh download from storage, bypassing all caches
        const { getFile } = await import('../storage');
        const encryptedContent = await getFile(file.storagePath);
        
        const userEncryptedKey = file.encryptedKeys[userId];
        if (!userEncryptedKey) {
          throw new Error('No access key found for this file');
        }
        
        contentBuffer = await FileEncryptionService.decryptFile(
          new Uint8Array(encryptedContent),
          userEncryptedKey,
          privateKey
        );
      } else {
        // Use normal loading with caching
        contentBuffer = await FileAccessService.loadFileContent(file, userId, privateKey);
      }
      
      const decoded = new TextDecoder().decode(new Uint8Array(contentBuffer));
      const formData = JSON.parse(decoded);

      const parts: string[] = [];

      const addText = (value: unknown) => {
        if (!value) return;
        if (Array.isArray(value)) { value.forEach(addText); return; }
        if (typeof value === 'object') return; // skip file IDs / nested objects
        const str = String(value).trim();
        if (str && str !== '[object Object]') parts.push(str.toLowerCase());
      };

      // SecureFormData structure: { metadata: { name }, schema: { fields }, data: { [fieldId]: value } }
      if (formData.metadata?.name) {
        parts.push(formData.metadata.name.toLowerCase());
      }
      if (formData.metadata?.description) {
        parts.push(formData.metadata.description.toLowerCase());
      }
      if (formData.metadata?.category) {
        parts.push(formData.metadata.category.toLowerCase());
      }

      if (Array.isArray(formData.schema?.fields) && formData.data) {
        formData.schema.fields.forEach((field: Record<string, unknown>) => {
          // Index the field label so searching label text works too
          if (field.label && typeof field.label === 'string') {
            parts.push(field.label.toLowerCase());
          }
          // Index the user's value for this field (skip sensitive fields like passwords)
          if (!field.sensitive && field.id && typeof field.id === 'string') {
            const val = (formData.data as Record<string, unknown>)[field.id as string];
            if (val !== undefined && val !== null) addText(val);
          }
        });
      }

      // Also handle a flat { title, fields: [{label, value}] } legacy structure, just in case
      if (!formData.schema && formData.title) {
        parts.push(String(formData.title).toLowerCase());
      }
      if (!formData.schema && Array.isArray(formData.fields)) {
        formData.fields.forEach((field: Record<string, unknown>) => {
          if (field.label && typeof field.label === 'string') parts.push(field.label.toLowerCase());
          if (!field.sensitive && field.value !== undefined) addText(field.value);
        });
      }

      return parts.length > 0 ? parts.join(' ') : undefined;
    } catch (error) {
      console.warn('Failed to build form search text:', error);
      return undefined;
    }
  }

  /**
   * Start deep indexing of form files
   * Returns immediately if indexing is already in progress
   */
  async startIndexing(
    formFiles: Array<{ file: FileData; metadata: CachedFileMetadata }>,
    userId: string,
    privateKey: string
  ): Promise<void> {
    // If already indexing, return the existing promise
    if (this.indexingPromise) {
      return this.indexingPromise;
    }

    const filesToIndex = formFiles.filter(({ file }) => {
      const version = this.extractFileVersion(file);
      return !this.hasCache(file.id!, version);
    });

    if (filesToIndex.length === 0) {
      // All already indexed - notify so UI updates to show Deep Search chip
      this.notifyProgress({
        isIndexing: false,
        total: formFiles.length,
        processed: formFiles.length,
      });
      return;
    }

    this.shouldCancel = false;
    this.indexingPromise = this.performIndexing(filesToIndex, userId, privateKey);

    try {
      await this.indexingPromise;
    } catch (error) {
      console.error('Deep indexing failed:', error);
      this.notifyProgress({ isIndexing: false, total: filesToIndex.length, processed: 0 });
    } finally {
      this.indexingPromise = null;
    }
  }

  /**
   * Perform the actual indexing work
   */
  private async performIndexing(
    filesToIndex: Array<{ file: FileData; metadata: CachedFileMetadata }>,
    userId: string,
    privateKey: string
  ): Promise<void> {
    const total = filesToIndex.length;
    let processed = 0;

    // Notify start
    this.notifyProgress({
      isIndexing: true,
      total,
      processed: 0,
    });

    // Process in parallel batches — 3 concurrent Storage downloads is safe and fast.
    // A single yield between batches keeps the UI responsive without the per-file 10ms tax.
    const BATCH_SIZE = 3;

    try {
      for (let i = 0; i < filesToIndex.length; i += BATCH_SIZE) {
        if (this.shouldCancel) break;

        const batch = filesToIndex.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map(async ({ file }) => {
            try {
              const version = this.extractFileVersion(file);
              const searchText = await this.buildFormSearchText(file, userId, privateKey);
              // Always cache (even empty string) to mark file as indexed.
              // This ensures hasAnyIndex() returns true after a full pass,
              // and prevents re-indexing files with no extractable text.
              this.setCache(file.id!, version, searchText ?? '');
            } catch (error) {
              console.warn(`Failed to index form ${file.id}:`, error);
            }
          })
        );

        processed += batch.length;
        this.notifyProgress({ isIndexing: true, total, processed });

        // Single yield per batch — enough to keep the event loop free
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    } catch (error) {
      console.error('Critical error during indexing:', error);
    } finally {
      this.notifyProgress({ isIndexing: false, total, processed });
    }
  }

  cancelIndexing(): void {
    this.shouldCancel = true;
  }

  /**
   * Index a single form file
   */
  async indexSingleForm(
    file: FileData,
    metadata: CachedFileMetadata,
    userId: string,
    privateKey: string,
    forceRefresh = false
  ): Promise<string | undefined> {
    if (!isFormFile(metadata.decryptedName)) {
      return undefined;
    }

    const version = this.extractFileVersion(file);
    if (this.hasCache(file.id!, version) && !forceRefresh) {
      return this.getCache(file.id!, version);
    }

    const searchText = await this.buildFormSearchText(file, userId, privateKey, forceRefresh);
    if (searchText) {
      this.setCache(file.id!, version, searchText);
    }
    return searchText;
  }
}

// Singleton instance
export const deepIndexService = new DeepIndexService();
