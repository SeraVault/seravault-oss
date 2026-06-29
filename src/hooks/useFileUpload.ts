import { useState, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { FileEncryptionService } from '../services/fileEncryption';
import { uploadFileData } from '../storage';

export interface FileUploadProgress {
  stage: string;
  progress: number;
  fileName: string;
  fileSize: string;
}

export interface FileUploadOptions {
  /** Target folder ID for the file (null for root or chat attachments) */
  folderId: string | null;
  /** User IDs to share the file with */
  participants: string[];
  /** Private key for encryption */
  privateKey: string;
  /** Callback for progress updates */
  onProgress?: (progress: FileUploadProgress) => void;
}

export interface EncryptedFileResult {
  storagePath: string;
  encryptedContent: Uint8Array;
  encryptedKeys: Record<string, string>;
  encryptedMetadata: {
    name: { ciphertext: string; nonce: string };
    size: { ciphertext: string; nonce: string };
  };
}

/**
 * Hook for handling file uploads with encryption, quota checking, and progress tracking
 * Can be used for both regular file uploads and chat attachments
 */
export function useFileUpload() {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<FileUploadProgress>({
    stage: '',
    progress: 0,
    fileName: '',
    fileSize: '',
  });

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);
    return `${size.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
  };

  const updateProgress = useCallback((stage: string, progress: number, fileName: string, fileSize: number, options: FileUploadOptions) => {
    const progressData: FileUploadProgress = {
      stage,
      progress,
      fileName,
      fileSize: formatFileSize(fileSize),
    };
    setUploadProgress(progressData);
    options.onProgress?.(progressData);
  }, []);

  /**
   * Upload and encrypt a file
   * Returns the encrypted file result for further processing
   */
  const uploadFile = useCallback(async (
    file: File,
    options: FileUploadOptions
  ): Promise<EncryptedFileResult> => {
    if (!user) {
      throw new Error('User must be authenticated');
    }

    setUploading(true);

    try {

      // Read file data
      updateProgress('Reading file...', 20, file.name, file.size, options);
      const fileBuffer = await file.arrayBuffer();
      const fileData = new Uint8Array(fileBuffer);
      
      // Encrypt file
      updateProgress('Encrypting file and metadata...', 40, file.name, file.size, options);
      const encryptionResult = await FileEncryptionService.encryptFileForUsers(
        fileData,
        file.name,
        file.size,
        options.participants,
        user.uid,
        options.folderId
      );

      // Upload to storage
      updateProgress('Uploading to secure storage...', 70, file.name, file.size, options);
      await uploadFileData(encryptionResult.storagePath, encryptionResult.encryptedContent.buffer as ArrayBuffer);

      // Complete
      updateProgress('Upload complete!', 100, file.name, file.size, options);
      
      return {
        storagePath: encryptionResult.storagePath,
        encryptedContent: encryptionResult.encryptedContent,
        encryptedKeys: encryptionResult.encryptedKeys,
        encryptedMetadata: encryptionResult.encryptedMetadata,
      };

    } catch (error) {
      console.error('File upload failed:', error);
      throw error;
    } finally {
      setUploading(false);
      // Reset progress after a brief delay
      setTimeout(() => {
        setUploadProgress({
          stage: '',
          progress: 0,
          fileName: '',
          fileSize: '',
        });
      }, 2000);
    }
  }, [user, updateProgress]);

  return {
    uploadFile,
    uploading,
    uploadProgress,
  };
}
