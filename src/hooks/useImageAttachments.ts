import { useState, useCallback, useEffect, useRef } from 'react';
import { useFileUpload } from './useFileUpload';
import { FileEncryptionService } from '../services/fileEncryption';
import { backendService } from '../backend/BackendService';

export interface ImageAttachmentMetadata {
  fileId: string;
  storagePath: string;
  encryptedKey: string;
  fileName: string;
}

interface UseImageAttachmentsOptions {
  userId: string;
  privateKey: string;
  folderId?: string;
  participants?: string[];
  onImageUploaded?: (metadata: ImageAttachmentMetadata) => void;
}

export function useImageAttachments(options: UseImageAttachmentsOptions) {
  const { uploadFile, uploading, uploadProgress } = useFileUpload();
  const [imageCache, setImageCache] = useState<Map<string, string>>(new Map());
  const blobUrlsRef = useRef<Set<string>>(new Set());

  // Debug: Log hook initialization
  useEffect(() => {
    console.log('🎨 useImageAttachments hook initialized - v2.0');
  }, []);

  // Cleanup blob URLs when component unmounts
  useEffect(() => {
    const blobUrls = blobUrlsRef.current;
    return () => {
      blobUrls.forEach(url => {
        URL.revokeObjectURL(url);
      });
      blobUrls.clear();
    };
  }, []);

  // Upload an image and return attachment:// URL with metadata callback
  const uploadImage = useCallback(async (file: File): Promise<string> => {
    try {
      console.log('📸 Starting image upload:', file.name, file.size, 'bytes');
      
      const encryptionResult = await uploadFile(file, {
        participants: options.participants || [options.userId],
        folderId: options.folderId,
        privateKey: options.privateKey,
      });

      console.log('🔐 Encryption result:', {
        storagePath: encryptionResult.storagePath,
        hasKeys: !!encryptionResult.encryptedKeys,
        keyCount: Object.keys(encryptionResult.encryptedKeys).length,
      });

      // Extract fileId from storage path (files/userId/uuid)
      const pathParts = encryptionResult.storagePath.split('/');
      const fileId = pathParts[pathParts.length - 1]; // Get the UUID part
      
      console.log('📝 Extracted fileId:', fileId, 'from path:', encryptionResult.storagePath);
      
      if (!fileId) {
        throw new Error('Failed to extract fileId from storage path');
      }
      
      // Get the encrypted key for the current user
      const encryptedKey = encryptionResult.encryptedKeys[options.userId];
      
      if (!encryptedKey) {
        console.error('❌ No encrypted key found for userId:', options.userId);
        console.error('Available keys:', Object.keys(encryptionResult.encryptedKeys));
        throw new Error('Encrypted key not found for current user');
      }

      // Store metadata via callback
      const metadata: ImageAttachmentMetadata = {
        fileId,
        storagePath: encryptionResult.storagePath,
        encryptedKey,
        fileName: file.name,
      };

      console.log('✅ Image metadata created:', metadata);

      if (options.onImageUploaded) {
        options.onImageUploaded(metadata);
      }
      
      const attachmentUrl = `attachment://${fileId}`;
      
      console.log('✅ Returning attachment URL:', attachmentUrl);
      
      return attachmentUrl;
    } catch (error) {
      console.error('❌ Failed to upload image:', error);
      throw error;
    }
  }, [uploadFile, options]);

  // Decrypt an image and return blob URL
  const decryptImage = useCallback(async (
    storagePath: string,
    encryptedKey: string
  ): Promise<string> => {
    try {
      // Check cache first
      if (imageCache.has(storagePath)) {
        return imageCache.get(storagePath)!;
      }

      // Download encrypted file using backend service
      const url = await backendService.storage.getDownloadURL(storagePath);
      const response = await fetch(url);
      const encryptedData = new Uint8Array(await response.arrayBuffer());

      // Decrypt the image
      const decryptedData = await FileEncryptionService.decryptFile(
        encryptedData,
        encryptedKey,
        options.privateKey
      );

      // Create blob URL
      const blob = new Blob([decryptedData.buffer as ArrayBuffer], { type: 'image/*' });
      const blobUrl = URL.createObjectURL(blob);
      
      // Track blob URL for cleanup
      blobUrlsRef.current.add(blobUrl);
      
      // Cache the result
      setImageCache(prev => new Map(prev).set(storagePath, blobUrl));
      
      return blobUrl;
    } catch (error) {
      console.error('Failed to decrypt image:', error);
      throw error;
    }
  }, [imageCache, options.privateKey]);

  // Process HTML content to replace attachment:// URLs with blob URLs
  const processHtmlContent = useCallback(async (
    html: string,
    attachments: Array<{ fileId: string; storagePath: string; encryptedKey: string }>
  ): Promise<string> => {
    // Find all attachment:// URLs in the HTML
    const attachmentRegex = /attachment:\/\/([a-zA-Z0-9_-]+)/g;
    const matches = [...html.matchAll(attachmentRegex)];

    if (matches.length === 0) return html;

    // Decrypt all referenced attachments in parallel
    const replacements = await Promise.all(
      matches.map(async (match) => {
        const fileId = match[1];
        const attachment = attachments.find(a => a.fileId === fileId);
        if (!attachment) return null;
        try {
          const blobUrl = await decryptImage(attachment.storagePath, attachment.encryptedKey);
          return { placeholder: match[0], blobUrl };
        } catch (error) {
          console.error(`Failed to process attachment ${fileId}:`, error);
          return null; // Keep original attachment:// URL if decryption fails
        }
      })
    );

    let processedHtml = html;
    for (const replacement of replacements) {
      if (replacement) {
        processedHtml = processedHtml.replace(replacement.placeholder, replacement.blobUrl);
      }
    }

    return processedHtml;
  }, [decryptImage]);

  // Cleanup a specific blob URL
  const cleanupBlobUrl = useCallback((url: string) => {
    if (blobUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url);
      blobUrlsRef.current.delete(url);
    }
  }, []);

  return {
    uploadImage,
    decryptImage,
    processHtmlContent,
    cleanupBlobUrl,
    uploading,
    uploadProgress,
  };
}
