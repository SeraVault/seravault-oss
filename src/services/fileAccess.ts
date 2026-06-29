// @ts-nocheck
import { backendService } from '../backend/BackendService';
import { hexToBytes, decryptMetadata, decryptSymmetric } from '../crypto/quantumSafeCrypto';
import { getOrDecryptFileKey } from './fileKeyCache';
import { isFormFile } from '../utils/formFiles';
import type { FileData } from '../files';
import { fileCacheService } from './FileCacheService';
import { offlineFileCache } from './offlineFileCache';
import { cacheLogger } from '../utils/cacheLogger';

export interface FileAccessResult {
  file: FileData;
  decryptedContent?: ArrayBuffer;
}

export class FileAccessService {

  /**
   * Load complete file data by ID from Firestore
   */
  static async loadFileById(fileId: string, userId: string, privateKey: string): Promise<FileData> {
    const fileData = await backendService.files.get(fileId);
    
    if (!fileData) {
      throw new Error('File not found');
    }
    
    // Check if user has access
    if (!fileData.encryptedKeys || !fileData.encryptedKeys[userId]) {
      throw new Error('No access to this file');
    }

    try {
      // Invalidate cache if file was modified
      if (fileData.lastModified) {
        const { metadataCache } = await import('./metadataCache');
        const modifiedTime = fileData.lastModified.toDate ? fileData.lastModified.toDate().getTime() : Date.now();
        metadataCache.invalidateIfModified(fileId, modifiedTime);
      }

      // Use the metadata cache for fast access
      const { getOrDecryptMetadata } = await import('./metadataCache');
      const metadata = await getOrDecryptMetadata(fileData, userId, privateKey);
      
      return {
        ...fileData,
        name: metadata.decryptedName,
        size: metadata.decryptedSize,
      } as FileData;
    } catch (error) {
      console.error('Error decrypting file metadata:', error);
      throw new Error('Failed to decrypt file metadata');
    }
  }

  /**
   * Load file content for viewing/editing, with local caching
   */
  static async loadFileContent(file: FileData, userId: string, privateKey: string): Promise<ArrayBuffer> {
    if (!file.id) {
      throw new Error('File has no ID, cannot process content.');
    }
    if (!file.encryptedKeys || !file.encryptedKeys[userId]) {
      throw new Error('No access key found for this file');
    }

    // Use the timestamp from the FileData we were given. Callers (openFile, etc.) always
    // fetch fresh metadata via loadFileById before calling here, so this is the authoritative
    // server timestamp — no need for a second Firestore round-trip.
    const remoteTimestamp = file.lastModified
      ? (file.lastModified as any).toDate
        ? (file.lastModified as any).toDate().getTime()
        : new Date(file.lastModified as any).getTime()
      : 0;

    const isOnline = navigator.onLine;

    // 1. Check in-memory cache first — zero I/O, fastest path
    const cachedFile = await fileCacheService.getFile(file.id);
    if (cachedFile && cachedFile.timestamp >= remoteTimestamp) {
      cacheLogger.info(`⚡️ Using memory cached content for ${file.id}`);
      return cachedFile.content;
    }

    // 2. Check offline cache (IndexedDB)
    const offlineCached = await offlineFileCache.getCachedFileWithMetadata(file.id);
    if (offlineCached) {
      // Check if cached version is current
      if (offlineCached.cachedAt >= remoteTimestamp) {
        cacheLogger.info(`💾 Using offline cached encrypted content for ${file.id}`);
        // Convert Blob to ArrayBuffer
        const encryptedContent = await offlineCached.blob.arrayBuffer();
        
        // Decrypt the cached encrypted content
        const userEncryptedKey = file.encryptedKeys[userId];
        
        try {
          const fileKey = await getOrDecryptFileKey(userEncryptedKey, privateKey);

          const contentBytes = new Uint8Array(encryptedContent);
          const decryptedContent = await decryptSymmetric(contentBytes.slice(12), fileKey, contentBytes.slice(0, 12));

          // Save decrypted content to memory cache for faster subsequent access
          await fileCacheService.saveFile(file.id, decryptedContent, offlineCached.cachedAt, typeof file.name === 'string' ? file.name : '', isFormFile(typeof file.name === 'string' ? file.name : ''));
          
          return decryptedContent;
        } catch (error) {
          console.error('Failed to decrypt offline cached content:', error);
          // Fall through to download from server
        }
      } else {
        // Cached version is outdated
        cacheLogger.info(`⚠️ Cached file ${file.id} is outdated (cached: ${new Date(offlineCached.cachedAt).toISOString()}, remote: ${new Date(remoteTimestamp).toISOString()})`);
        if (!isOnline) {
          cacheLogger.warn(`📵 Offline: Using outdated cached version of ${file.id}`);
          // Still use outdated cache if offline - better than nothing
          try {
            const encryptedContent = await offlineCached.blob.arrayBuffer();
            const userEncryptedKey = file.encryptedKeys[userId];
            const fileKey = await getOrDecryptFileKey(userEncryptedKey, privateKey);

            const contentBytes = new Uint8Array(encryptedContent);
            const decryptedContent = await decryptSymmetric(contentBytes.slice(12), fileKey, contentBytes.slice(0, 12));

            await fileCacheService.saveFile(file.id, decryptedContent, offlineCached.cachedAt, typeof file.name === 'string' ? file.name : '', isFormFile(typeof file.name === 'string' ? file.name : ''));
            
            return decryptedContent;
          } catch (error) {
            throw new Error(`Failed to decrypt outdated cached file while offline: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        // Online and outdated - will download fresh version below
      }
    } else if (!isOnline) {
      cacheLogger.info(`📵 Offline mode - no cached content available for ${file.id}`);
    }

    // 3. Download from storage if not cached or outdated
    cacheLogger.info(`⬇️ Downloading content for ${file.id}`);
    const { getFile } = await import('../storage');
    const encryptedContent = await getFile(file.storagePath);
    
    // 4. Save encrypted content to offline cache for future offline access
    try {
      await offlineFileCache.cacheFile(
        file.id,
        encryptedContent,
        file.storagePath,
        'application/octet-stream'
      );
      cacheLogger.info(`💾 Cached encrypted file ${file.id} for offline access`);
    } catch (error) {
      console.warn('Failed to cache file for offline access:', error);
      // Continue even if caching fails
    }
    
    // 5. Decrypt file content
    const userEncryptedKey = file.encryptedKeys[userId];
    
    try {
      const fileKey = await getOrDecryptFileKey(userEncryptedKey, privateKey);
      
      if (encryptedContent.byteLength <= 12) {
        throw new Error('Invalid encrypted content format');
      }

      const contentBytes = new Uint8Array(encryptedContent);
      const decryptedContent = await decryptSymmetric(contentBytes.slice(12), fileKey, contentBytes.slice(0, 12));

      // 6. Save decrypted content to memory cache for faster subsequent access
      await fileCacheService.saveFile(file.id, decryptedContent, remoteTimestamp, typeof file.name === 'string' ? file.name : '', isFormFile(typeof file.name === 'string' ? file.name : ''));
      
      return decryptedContent;

    } catch (error) {
      console.error('File content decryption failed:', error);
      throw new Error(`Failed to decrypt file content: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Unified file opening handler - works with both complete FileData and minimal file info
   */
  static async openFile(
    fileInfo: { id: string; name?: string; parent?: string | null } | FileData,
    userId: string,
    privateKey: string,
    callbacks: {
      onFormOpen: (file: FileData, formData?: any) => void;
      onFileOpen: (file: FileData, content: ArrayBuffer) => void;
      onError: (error: string) => void;
    }
  ): Promise<void> {
    try {
      let file: FileData;

      // Always load from Firestore to ensure metadata is properly decrypted
      const fileId = 'id' in fileInfo ? fileInfo.id : (fileInfo as any).id;
      file = await this.loadFileById(fileId, userId, privateKey);

      const fileName = typeof file.name === 'string' ? file.name : '';
      
      if (isFormFile(fileName)) {
        // Handle form files
        try {
          const content = await this.loadFileContent(file, userId, privateKey);
          let jsonString: string;

          if (content instanceof ArrayBuffer) {
            jsonString = new TextDecoder('utf-8', { ignoreBOM: true }).decode(content);
          } else {
            jsonString = String(content);
          }

          // Strip any leading/trailing whitespace or null bytes that would break JSON.parse
          jsonString = jsonString.replace(/^﻿/, '').trim().replace(/\0+$/, '');

          const formData = JSON.parse(jsonString);
          callbacks.onFormOpen(file, formData);
        } catch (error) {
          console.error('Error loading form data:', error);
          // Fallback: open form viewer without data
          callbacks.onFormOpen(file);
        }
      } else {
        // Handle regular files
        try {
          const content = await this.loadFileContent(file, userId, privateKey);
          callbacks.onFileOpen(file, content);
        } catch (error) {
          console.error('Error loading file content:', error);
          callbacks.onError('Failed to load file content');
        }
      }
    } catch (error) {
      console.error('Error opening file:', error);
      const message = error instanceof Error ? error.message : 'Failed to open file';
      callbacks.onError(message);
    }
  }
}