// @ts-nocheck
/**
 * Service for exporting all user data in unencrypted format
 * WARNING: This exports data without encryption - use with extreme caution
 */

import { backendService } from '../backend/BackendService';
import { FileEncryptionService } from './fileEncryption';
import { hexToBytes } from '../crypto/quantumSafeCrypto';
import type { FileData } from '../files';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface ExportProgress {
  stage: 'preparing' | 'files' | 'complete' | 'error';
  currentFile?: string;
  filesProcessed: number;
  totalFiles: number;
}

export interface ExportOptions {
  onProgress?: (progress: ExportProgress) => void;
  saveToDirectory?: boolean; // If true, uses File System Access API to save to a directory
}

interface FileIndexEntry {
  originalName: string;
  customName: string | null;
  size: string;
  tags: string[];
  isOwned: boolean;
  owner: string;
  createdAt: any;
  lastModified: any;
  storagePath: string;
  folderId: string | null;
}

interface FolderExportEntry {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: any;
  path: string[];
}

interface ChatData {
  chatId: string;
  participants: string[];
  createdAt: any;
  lastMessageAt: any;
  isEncrypted: boolean;
  messages: ChatMessage[];
  decryptionFailed?: boolean;
}

interface ChatMessage {
  id: string;
  senderId: string;
  timestamp: any;
  content: string;
  fileAttachments: string[];
}

interface FileDataWithType {
  id?: string;
  fileType?: string;
  lastModified?: any;
  sharedWith?: string[];
  encryptedKeys: Record<string, string>;
  name: { ciphertext: string; nonce: string } | string;
  size: { ciphertext: string; nonce: string } | string;
  createdAt: any;
  storagePath: string;
  owner: string;
  userTags?: Record<string, { ciphertext: string; nonce: string }>;
  userNames?: Record<string, { ciphertext: string; nonce: string }>;
}

interface FormData {
  formId: string;
  fileName: string;
  createdAt: any;
  owner: string;
  title: string;
  description?: string;
  fields: FormField[];
  submissions?: FormSubmission[];
}

interface FormField {
  id: string;
  type: string;
  label: string;
  required?: boolean;
  options?: string[];
}

interface FormSubmission {
  id: string;
  submittedAt: Date | string;
  submittedBy: string;
  responses: Record<string, string | number | boolean | string[]>;
}

/**
 * Export all user data (files, forms, metadata) in unencrypted format
 */
export async function exportAllUserData(
  userId: string,
  privateKey: string,
  options: ExportOptions = {}
): Promise<void> {
  const { onProgress } = options;
  let { saveToDirectory = false } = options;
  
  try {
    // Report preparing stage
    onProgress?.({
      stage: 'preparing',
      filesProcessed: 0,
      totalFiles: 0,
    });

    // 1. Get all files owned by or shared with the user (with pagination)
    let ownedFiles: any[] = [];
    let sharedFiles: any[] = [];
    
    try {
      // Fetch owned files in batches to handle users with > 1000 files
      let lastDoc: any = null;
      let hasMore = true;
      
      while (hasMore) {
        const constraints: any[] = [
          { type: 'where', field: 'owner', operator: '==', value: userId },
          { type: 'orderBy', field: 'createdAt', direction: 'asc' }, // orderBy for consistent pagination
          { type: 'limit', limitValue: 1000 }
        ];
        
        if (lastDoc) {
          constraints.push({ type: 'startAfter', startAfter: lastDoc });
        }
        
        const batch = await backendService.query.get('files', constraints);
        
        if (batch.length === 0) {
          hasMore = false;
        } else {
          ownedFiles = ownedFiles.concat(batch);
          
          if (batch.length < 1000) {
            hasMore = false;
          } else {
            lastDoc = batch[batch.length - 1];
          }
        }
      }
      
      console.log(`Fetched ${ownedFiles.length} owned files`);
    } catch (error) {
      console.error('Error fetching owned files:', error);
      
      // Check if it's an index building error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('index') && errorMessage.includes('building')) {
        throw new Error('Database index is still building. This usually takes 1-5 minutes. Please try again in a few minutes.');
      }
      
      throw new Error('Failed to fetch your files. Please check your permissions.');
    }
    
    try {
      // Fetch shared files in batches
      let lastDoc: any = null;
      let hasMore = true;
      
      while (hasMore) {
        const constraints: any[] = [
          { type: 'where', field: 'sharedWith', operator: 'array-contains', value: userId },
          { type: 'orderBy', field: 'createdAt', direction: 'asc' },
          { type: 'limit', limitValue: 1000 }
        ];
        
        if (lastDoc) {
          constraints.push({ type: 'startAfter', startAfter: lastDoc });
        }
        
        const batch = await backendService.query.get('files', constraints);
        
        if (batch.length === 0) {
          hasMore = false;
        } else {
          sharedFiles = sharedFiles.concat(batch);
          
          if (batch.length < 1000) {
            hasMore = false;
          } else {
            lastDoc = batch[batch.length - 1];
          }
        }
      }
      
      console.log(`Fetched ${sharedFiles.length} shared files`);
    } catch (error) {
      console.warn('Error fetching shared files (continuing with owned files only):', error);
      // Continue with just owned files if shared files query fails
    }

    // Combine and deduplicate files
    const filesMap = new Map<string, FileData>();
    ownedFiles.forEach(data => {
      if (data.encryptedKeys[userId]) {
        filesMap.set(data.id!, { ...data, id: data.id } as FileData);
      }
    });
    sharedFiles.forEach(data => {
      if (data.encryptedKeys[userId] && !filesMap.has(data.id!)) {
        filesMap.set(data.id!, { ...data, id: data.id } as FileData);
      }
    });

    const allFiles = Array.from(filesMap.values());
    
    // 2. Separate chat files from regular files
    const chatFiles = allFiles.filter(f => (f as FileDataWithType).fileType === 'chat');
    const regularFiles = allFiles.filter(f => (f as FileDataWithType).fileType !== 'chat');

    const totalFiles = regularFiles.length;
    const totalChats = chatFiles.length;
    const totalItems = totalFiles + totalChats;
    
    // Fetch folders for user
    const folders = await backendService.folders.getUserFolders(userId);

    if (totalItems === 0 && folders.length === 0) {
      throw new Error('No data found to export');
    }

    // 2. Create zip file or directory handle
    let zip: JSZip | null = null;
    let directoryHandle: FileSystemDirectoryHandle | null = null;

    if (saveToDirectory && 'showDirectoryPicker' in window) {
      try {
        directoryHandle = await (window as unknown as { showDirectoryPicker: (options: { mode: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({
          mode: 'readwrite',
        });
      } catch {
        // User cancelled or browser doesn't support it, fall back to zip
        saveToDirectory = false;
      }
    }

    if (!directoryHandle) {
      zip = new JSZip();
    }

    // 3. Create metadata file
    const metadata = {
      exportDate: new Date().toISOString(),
      userId,
      totalFiles,
      totalChats,
      totalItems,
      totalFolders: folders.length,
      warning: 'This export contains UNENCRYPTED data. Store securely.',
    };

    if (zip) {
      zip.file('export-metadata.json', JSON.stringify(metadata, null, 2));
    } else if (directoryHandle) {
      const metadataFile = await directoryHandle.getFileHandle('export-metadata.json', { create: true });
      const writable = await metadataFile.createWritable();
      await writable.write(JSON.stringify(metadata, null, 2));
      await writable.close();
    }

    // 3.5. Process and export folders
    const folderExports: FolderExportEntry[] = [];
    const privateKeyBytes = hexToBytes(privateKey);
    
    for (const folder of folders) {
      try {
        const { FolderEncryptionService } = await import('./folderEncryption');
        
        // Decrypt folder name
        const decryptedName = await FolderEncryptionService.decryptFolderName(
          folder.name as { ciphertext: string; nonce: string },
          folder.encryptedKeys![userId],
          privateKeyBytes
        );
        
        folderExports.push({
          id: folder.id!,
          name: decryptedName,
          parentId: folder.parent || null,
          createdAt: folder.createdAt,
          path: [], // Path reconstruction would require more logic, skipping for now
        });
      } catch (error) {
        console.error('Failed to decrypt folder:', folder.id, error);
      }
    }

    // 4. Process regular files (non-chat files)
    let filesProcessed = 0;
    const fileList: FileIndexEntry[] = [];
    const formExports: FormData[] = [];

    for (const file of regularFiles) {
      try {
        // Skip files with invalid storage paths
        if (!file.storagePath || file.storagePath.trim() === '') {
          console.warn('Skipping file with invalid storage path:', file.id);
          filesProcessed++;
          continue;
        }

        // Decrypt metadata
        const userEncryptedKey = file.encryptedKeys[userId];
        const { name: fileName, size: fileSize } = await FileEncryptionService.decryptFileMetadata(
          file.name as { ciphertext: string; nonce: string },
          file.size as { ciphertext: string; nonce: string },
          userEncryptedKey,
          privateKey
        );

        onProgress?.({
          stage: 'files',
          currentFile: fileName,
          filesProcessed,
          totalFiles,
        });

        // Download and decrypt file content
        const encryptedContent = await backendService.storage.download(file.storagePath);
        const decryptedContent = await FileEncryptionService.decryptFile(
          encryptedContent,
          userEncryptedKey,
          privateKey
        );

        // Check if this is a form file
        const isFormFile = fileName.endsWith('.form');
        if (isFormFile) {
          try {
            const formText = new TextDecoder().decode(decryptedContent);
            const formContent = JSON.parse(formText);
            formExports.push({
              formId: file.id || '',
              fileName: fileName,
              createdAt: file.createdAt,
              owner: file.owner,
              title: formContent.title || 'Untitled Form',
              description: formContent.description,
              fields: formContent.fields || [],
              submissions: formContent.submissions || [],
            });
            // Form is captured in forms-export.json — skip adding to fileList/zip
            // to prevent the file being imported twice on restore.
            filesProcessed++;
            continue;
          } catch (error) {
            console.warn('Failed to parse form file:', fileName, error);
            // Fall through: add to fileList as a regular file so it isn't lost
          }
        }

        // Sanitize filename for filesystem
        const safeFileName = fileName.replace(/[<>:"/\\|?*]/g, '_');
        
        // Get user tags if any
        let tags: string[] = [];
        if (file.userTags && file.userTags[userId]) {
          try {
            const { getUserTags } = await import('./userTagsManagement');
            tags = await getUserTags(file, userId, privateKey);
          } catch (error) {
            console.warn('Failed to decrypt tags for file:', fileName, error);
          }
        }

        // Get custom user name if any
        let customName = '';
        if (file.userNames && file.userNames[userId]) {
          try {
            const { getUserFileName } = await import('./userNamesManagement');
            customName = await getUserFileName(file, userId, privateKey);
          } catch (error) {
            console.warn('Failed to decrypt custom name for file:', fileName, error);
          }
        }

        // Add to file list for index
        fileList.push({
          originalName: fileName,
          customName: customName || null,
          size: fileSize,
          tags,
          isOwned: file.owner === userId,
          owner: file.owner,
          createdAt: file.createdAt,
          lastModified: file.lastModified,
          storagePath: safeFileName,
          folderId: file.userFolders?.[userId] || file.parent || null,
        });

        // Save file
        if (zip) {
          zip.file(safeFileName, decryptedContent);
        } else if (directoryHandle) {
          const fileHandle = await directoryHandle.getFileHandle(safeFileName, { create: true });
          const writable = await fileHandle.createWritable();
          // Write the uint8array directly
          await writable.write(decryptedContent as unknown as FileSystemWriteChunkType);
          await writable.close();
        }

        filesProcessed++;
      } catch (error) {
        console.error('Failed to export file:', file.id, {
          storagePath: file.storagePath,
          hasEncryptedKey: !!file.encryptedKeys[userId],
          error
        });
        // Continue with next file - don't let one failure stop the entire export
        filesProcessed++;
      }
    }

    // 5. Export chats (chat files with messages)
    const chatExports: ChatData[] = [];
    for (const chatFile of chatFiles) {
      try {
        // Decrypt chat metadata
        const userEncryptedKey = chatFile.encryptedKeys[userId];
        await FileEncryptionService.decryptFileMetadata(
          chatFile.name as { ciphertext: string; nonce: string },
          chatFile.size as { ciphertext: string; nonce: string },
          userEncryptedKey,
          privateKey
        );

        const fileDataWithType = chatFile as FileData & { fileType?: string; lastModified?: any };

        const chatData: ChatData = {
          chatId: chatFile.id || '',
          participants: fileDataWithType.sharedWith || [],
          createdAt: chatFile.createdAt,
          lastMessageAt: fileDataWithType.lastModified,
          isEncrypted: true, // All chats in SeraVault are encrypted
          messages: []
        };

        // Get all messages for this chat
        let messages: any[] = [];
        try {
          messages = await backendService.query.getPath(
            `files/${chatFile.id}/messages`,
            [{ field: 'timestamp', direction: 'asc' }]
          );
        } catch (error) {
          console.warn(`Failed to fetch messages for chat ${chatFile.id}:`, error);
          chatData.decryptionFailed = true;
        }

        // Decrypt chat key for message decryption
        let fileKey: Uint8Array | null = null;
        try {
          const { hexToBytes, decryptData } = await import('../crypto/quantumSafeCrypto');
          const keyData = hexToBytes(userEncryptedKey);
          const iv = keyData.slice(0, 12);
          const encapsulatedKey = keyData.slice(12, 12 + 1088);
          const ciphertext = keyData.slice(12 + 1088);
          const privateKeyBytes = hexToBytes(privateKey);
          fileKey = await decryptData({ iv, encapsulatedKey, ciphertext }, privateKeyBytes);
        } catch (error) {
          console.error('Failed to decrypt chat key:', chatFile.id, error);
          chatData.decryptionFailed = true;
        }

        // Process messages
        if (fileKey) {
          for (const msgData of messages) {
            let content = '';

            // Decrypt message content for this user
            if (msgData.encryptedContent && msgData.encryptedContent[userId]) {
              try {
                const { decryptMetadata } = await import('../crypto/quantumSafeCrypto');
                const decryptedContent = await decryptMetadata(
                  msgData.encryptedContent[userId],
                  fileKey
                );
                content = decryptedContent;
              } catch (error) {
                console.error('Failed to decrypt message:', msgData.id, error);
                content = '[Decryption failed]';
              }
            } else {
              // Fallback to plain content if exists
              content = msgData.content || '';
            }

            chatData.messages.push({
              id: msgData.id,
              senderId: msgData.senderId,
              timestamp: msgData.timestamp,
              content,
              fileAttachments: msgData.fileAttachments || [],
            });
          }
        }

        chatExports.push(chatData);
      } catch (error) {
        console.error('Failed to export chat:', chatFile.id, error);
      }
    }

    // Save chats to file
    if (chatExports.length > 0) {
      const chatsJson = JSON.stringify(chatExports, null, 2);
      if (zip) {
        zip.file('chats-export.json', chatsJson);
      } else if (directoryHandle) {
        const chatsFile = await directoryHandle.getFileHandle('chats-export.json', { create: true });
        const writable = await chatsFile.createWritable();
        await writable.write(chatsJson);
        await writable.close();
      }
    }

    // Save forms to file
    if (formExports.length > 0) {
      const formsJson = JSON.stringify(formExports, null, 2);
      if (zip) {
        zip.file('forms-export.json', formsJson);
      } else if (directoryHandle) {
        const formsFile = await directoryHandle.getFileHandle('forms-export.json', { create: true });
        const writable = await formsFile.createWritable();
        await writable.write(formsJson);
        await writable.close();
      }
    }

    // 6. Create file index
    const fileIndex = {
      totalFiles: filesProcessed,
      totalChats: chatExports.length,
      totalForms: formExports.length,
      exportDate: new Date().toISOString(),
      files: fileList,
      folders: folderExports,
    };

    if (zip) {
      zip.file('file-index.json', JSON.stringify(fileIndex, null, 2));
    } else if (directoryHandle) {
      const indexFile = await directoryHandle.getFileHandle('file-index.json', { create: true });
      const writable = await indexFile.createWritable();
      await writable.write(JSON.stringify(fileIndex, null, 2));
      await writable.close();
    }

    // 6. Generate and download zip if not using directory
    if (zip) {
      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      saveAs(blob, `seravault-export-${timestamp}.zip`);
    }

    onProgress?.({
      stage: 'complete',
      filesProcessed,
      totalFiles,
    });

  } catch (error) {
    console.error('Export failed:', error);
    onProgress?.({
      stage: 'error',
      filesProcessed: 0,
      totalFiles: 0,
    });
    throw error;
  }
}