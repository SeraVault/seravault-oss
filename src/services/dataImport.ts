// @ts-nocheck
/**
 * Service for importing exported user data
 * Handles importing files, chats, and forms from exported ZIP files
 */

import { backendService } from '../backend/BackendService';
import { FileEncryptionService } from './fileEncryption';
import { uploadFileData } from '../storage';
import { createFileWithSharing } from '../files';
import JSZip from 'jszip';

interface ImportProgress {
  stage: 'preparing' | 'files' | 'chats' | 'forms' | 'complete' | 'error';
  currentItem?: string;
  itemsProcessed: number;
  totalItems: number;
}

export interface ImportOptions {
  onProgress?: (progress: ImportProgress) => void;
  skipDuplicates?: boolean; // If true, skip files that already exist
}

interface FileIndexEntry {
  originalName: string;
  customName: string | null;
  size: string;
  tags: string[];
  isOwned: boolean;
  owner: string;
  createdAt: Date | string | { seconds: number; nanoseconds: number };
  lastModified: Date | string | undefined;
  storagePath: string;
  folderId?: string | null;
}

interface FolderIndexEntry {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: Date | string | { seconds: number; nanoseconds: number };
}

interface FileIndex {
  totalFiles: number;
  totalChats: number;
  totalForms: number;
  exportDate: string;
  files: FileIndexEntry[];
  folders?: FolderIndexEntry[];
}

interface ChatMessage {
  id: string;
  senderId: string;
  timestamp: Date | string | { seconds: number; nanoseconds: number };
  content: string;
  fileAttachments: string[];
}

interface ChatData {
  chatId: string;
  participants: string[];
  createdAt: Date | string | { seconds: number; nanoseconds: number };
  lastMessageAt: Date | string | { seconds: number; nanoseconds: number } | undefined;
  isEncrypted: boolean;
  messages: ChatMessage[];
  decryptionFailed?: boolean;
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

interface FormData {
  formId: string;
  fileName: string;
  createdAt: Date | string | { seconds: number; nanoseconds: number };
  owner: string;
  title: string;
  description?: string;
  fields: FormField[];
  submissions?: FormSubmission[];
}

interface ImportResult {
  success: boolean;
  filesImported: number;
  chatsImported: number;
  formsImported: number;
  errors: string[];
}

/**
 * Import all user data from an exported ZIP file
 */
export async function importExportedData(
  zipFile: File,
  userId: string,
  privateKey: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const { onProgress, skipDuplicates = true } = options;
  
  const result: ImportResult = {
    success: true,
    filesImported: 0,
    chatsImported: 0,
    formsImported: 0,
    errors: [],
  };

  try {
    // Report preparing stage
    onProgress?.({
      stage: 'preparing',
      itemsProcessed: 0,
      totalItems: 0,
    });

    // 1. Load and parse ZIP file
    const zip = await JSZip.loadAsync(zipFile);

    // 2. Read metadata (for validation, not used directly)
    const metadataFile = zip.file('export-metadata.json');
    if (!metadataFile) {
      throw new Error('Invalid export file: missing export-metadata.json');
    }
    await metadataFile.async('text'); // Just validate it exists

    // 3. Read file index
    const fileIndexFile = zip.file('file-index.json');
    if (!fileIndexFile) {
      throw new Error('Invalid export file: missing file-index.json');
    }
    const fileIndexText = await fileIndexFile.async('text');
    const fileIndex: FileIndex = JSON.parse(fileIndexText);

    const totalItems = fileIndex.totalFiles + fileIndex.totalChats + fileIndex.totalForms;

    // 4. Import folders first (if any), maintaining hierarchy
    const folderIdMap: Map<string, string> = new Map(); // old ID -> new ID mapping
    
    if (fileIndex.folders && fileIndex.folders.length > 0) {
      onProgress?.({
        stage: 'preparing',
        itemsProcessed: 0,
        totalItems,
      });

      // Sort folders by hierarchy (parents before children)
      const sortedFolders = [...fileIndex.folders].sort((a, b) => {
        if (!a.parentId && b.parentId) return -1;
        if (a.parentId && !b.parentId) return 1;
        return 0;
      });

      for (const folderEntry of sortedFolders) {
        try {
          const { FolderEncryptionService } = await import('./folderEncryption');

          // Map parent ID if it exists
          const newParentId = folderEntry.parentId ? folderIdMap.get(folderEntry.parentId) || null : null;

          // Encrypt folder name using the user's own private key
          const encryptionResult = await FolderEncryptionService.encryptFolderForUser(
            folderEntry.name,
            userId,
            privateKey
          );

          // Create folder in Firestore
          const newFolderId = await backendService.folders.create({
            owner: userId,
            name: encryptionResult.encryptedMetadata.name,
            parent: newParentId,
            encryptedKeys: encryptionResult.encryptedKeys,
          });
          
          // Store mapping
          folderIdMap.set(folderEntry.id, newFolderId);
        } catch (error) {
          console.error('Failed to import folder:', folderEntry.name, error);
          result.errors.push(`Failed to import folder ${folderEntry.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // 5. Import regular files
    onProgress?.({
      stage: 'files',
      itemsProcessed: 0,
      totalItems,
    });

    for (const fileEntry of fileIndex.files) {
      try {
        onProgress?.({
          stage: 'files',
          currentItem: fileEntry.originalName,
          itemsProcessed: result.filesImported + result.chatsImported + result.formsImported,
          totalItems,
        });

        // Get file from ZIP
        const zipEntry = zip.file(fileEntry.storagePath);
        if (!zipEntry) {
          result.errors.push(`File not found in ZIP: ${fileEntry.storagePath}`);
          continue;
        }

        const fileContent = await zipEntry.async('uint8array');

        // Check if file already exists (by name and size)
        if (skipDuplicates) {
          const existingFiles = await backendService.query.get('files', [
            { type: 'where', field: 'owner', operator: '==', value: userId },
            { type: 'limit', limitValue: 1000 }
          ]);
          
          // Check if a file with the same original name exists
          let duplicate = false;
          for (const existing of existingFiles) {
            try {
              const userEncryptedKey = existing.encryptedKeys[userId];
              if (userEncryptedKey) {
                const { name: existingName } = await FileEncryptionService.decryptFileMetadata(
                  existing.name as { ciphertext: string; nonce: string },
                  existing.size as { ciphertext: string; nonce: string },
                  userEncryptedKey,
                  privateKey
                );
                if (existingName === fileEntry.originalName) {
                  duplicate = true;
                  break;
                }
              }
            } catch {
              // Skip if can't decrypt
              continue;
            }
          }
          
          if (duplicate) {
            result.errors.push(`Skipped duplicate file: ${fileEntry.originalName}`);
            continue;
          }
        }

        // Encrypt and upload the file using the standard encryption service
        const encryptionResult = await FileEncryptionService.encryptFileForUsers(
          fileContent,
          fileEntry.originalName,
          fileContent.length,
          [userId],
          userId,
          null
        );

        // Upload to storage using the uploadFileData function (takes ArrayBuffer)
        await uploadFileData(encryptionResult.storagePath, encryptionResult.encryptedContent.buffer as ArrayBuffer);

        // Map folder ID if file was in a folder
        const newFolderId = fileEntry.folderId ? folderIdMap.get(fileEntry.folderId) || null : null;

        // Create file document in Firestore using the same method as normal uploads
        const fileData = {
          name: encryptionResult.encryptedMetadata.name,
          size: encryptionResult.encryptedMetadata.size,
          storagePath: encryptionResult.storagePath,
          owner: userId,
          encryptedKeys: encryptionResult.encryptedKeys,
          sharedWith: [userId], // Owner must be in sharedWith array
          parent: newFolderId, // Restore folder association if it existed
        };

        console.log('Creating file document:', {
          fileName: fileEntry.originalName,
          hasEncryptedKeys: !!encryptionResult.encryptedKeys,
          encryptedKeysCount: Object.keys(encryptionResult.encryptedKeys).length,
          encryptedKeysUserIds: Object.keys(encryptionResult.encryptedKeys),
          userIdInKeys: userId in encryptionResult.encryptedKeys,
          sharedWith: fileData.sharedWith,
          owner: fileData.owner,
        });

        const fileId = await createFileWithSharing(fileData);

        // Add tags if any
        if (fileEntry.tags && fileEntry.tags.length > 0) {
          const { setUserTags } = await import('./userTagsManagement');
          // Get the file document we just created
          const createdFile = await backendService.documents.get('files', fileId);
          if (createdFile) {
            await setUserTags(createdFile, userId, fileEntry.tags, privateKey);
          }
        }

        // Add custom name if any
        if (fileEntry.customName) {
          const { setUserFileName } = await import('./userNamesManagement');
          // Get the file document
          const createdFile = await backendService.documents.get('files', fileId);
          if (createdFile) {
            await setUserFileName(fileId, fileEntry.customName, userId, privateKey, createdFile);
          }
        }

        result.filesImported++;
      } catch (error) {
        console.error('Failed to import file:', fileEntry.originalName, error);
        result.errors.push(`Failed to import ${fileEntry.originalName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // 5. Import chats
    const chatsFile = zip.file('chats-export.json');
    if (chatsFile) {
      onProgress?.({
        stage: 'chats',
        itemsProcessed: result.filesImported + result.chatsImported + result.formsImported,
        totalItems,
      });

      const chatsText = await chatsFile.async('text');
      const chats: ChatData[] = JSON.parse(chatsText);

      for (const chat of chats) {
        try {
          onProgress?.({
            stage: 'chats',
            currentItem: `Chat with ${chat.participants.length} participants`,
            itemsProcessed: result.filesImported + result.chatsImported + result.formsImported,
            totalItems,
          });

          // Note: Importing chats is complex because they involve multiple users
          // For now, we'll skip chat import as it requires coordination with other users
          // This could be enhanced in the future
          result.errors.push('Chat import not yet supported - chats require multi-user coordination');
        } catch (error) {
          console.error('Failed to import chat:', chat.chatId, error);
          result.errors.push(`Failed to import chat: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // 6. Import forms
    const formsFile = zip.file('forms-export.json');
    if (formsFile) {
      onProgress?.({
        stage: 'forms',
        itemsProcessed: result.filesImported + result.chatsImported + result.formsImported,
        totalItems,
      });

      const formsText = await formsFile.async('text');
      const forms: FormData[] = JSON.parse(formsText);

      for (const form of forms) {
        try {
          onProgress?.({
            stage: 'forms',
            currentItem: form.title,
            itemsProcessed: result.filesImported + result.chatsImported + result.formsImported,
            totalItems,
          });

          // Re-create the form as a file
          const formContent = {
            title: form.title,
            description: form.description,
            fields: form.fields,
            submissions: form.submissions || [],
          };

          const formJson = JSON.stringify(formContent, null, 2);
          const formBytes = new TextEncoder().encode(formJson);

          // Encrypt and upload the form file using the standard encryption service
          const encryptionResult = await FileEncryptionService.encryptFileForUsers(
            formBytes,
            form.fileName,
            formBytes.length,
            [userId],
            userId,
            null
          );

          // Upload to storage using uploadFileData (takes ArrayBuffer)
          await uploadFileData(encryptionResult.storagePath, encryptionResult.encryptedContent.buffer as ArrayBuffer);

          // Create file document in Firestore using the same method as normal uploads
          const fileData = {
            name: encryptionResult.encryptedMetadata.name,
            size: encryptionResult.encryptedMetadata.size,
            storagePath: encryptionResult.storagePath,
            owner: userId,
            encryptedKeys: encryptionResult.encryptedKeys,
            sharedWith: [userId], // Owner must be in sharedWith array
            parent: null, // No folder association on import
            fileType: 'form',
          };

          await createFileWithSharing(fileData);

          result.formsImported++;
        } catch (error) {
          console.error('Failed to import form:', form.title, error);
          result.errors.push(`Failed to import form ${form.title}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // Report completion
    onProgress?.({
      stage: 'complete',
      itemsProcessed: result.filesImported + result.chatsImported + result.formsImported,
      totalItems,
    });

    if (result.errors.length > 0) {
      result.success = false;
    }

    return result;

  } catch (error) {
    console.error('Import failed:', error);
    onProgress?.({
      stage: 'error',
      itemsProcessed: 0,
      totalItems: 0,
    });
    throw error;
  }
}
