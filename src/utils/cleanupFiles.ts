// @ts-nocheck
/**
 * Utility script to clean up files with invalid metadata format
 * This removes files that were uploaded before the nonce fix
 */

import { backendService } from '../backend/BackendService';
import { FileAccessService } from '../services/fileAccess';
import { isFormFile } from './formFiles';
import { decryptMetadata } from '../crypto/quantumSafeCrypto';
import { invalidateStorageUsage } from '../services/simpleStorageUsage';

export interface FileToDelete {
  id: string;
  storagePath: string;
  owner: string;
  name: any;
  size: any;
}

/**
 * Check if a file has invalid metadata (empty nonce or old format)
 */
function hasInvalidMetadata(fileData: any): boolean {
  const name = fileData.name;
  const size = fileData.size;
  
  // If it's an object but has empty nonce, it's invalid
  if (typeof name === 'object' && name.nonce === '') {
    return true;
  }
  
  if (typeof size === 'object' && size.nonce === '') {
    return true;
  }
  
  // If it has the old salt format, it's also invalid for files
  if (typeof name === 'object' && 'salt' in name) {
    return true;
  }
  
  if (typeof size === 'object' && 'salt' in size) {
    return true;
  }
  
  return false;
}

/**
 * Get all files with invalid metadata
 */
export async function getFilesWithInvalidMetadata(userUid: string): Promise<FileToDelete[]> {
  const files = await backendService.query.get('files', [
    { type: 'where', field: 'owner', operator: '==', value: userUid },
    { type: 'limit', limitValue: 1000 }
  ]);
  
  const invalidFiles: FileToDelete[] = [];
  
  files.forEach((data) => {
    if (hasInvalidMetadata(data)) {
      invalidFiles.push({
        id: data.id!,
        storagePath: data.storagePath,
        owner: data.owner,
        name: data.name,
        size: data.size,
      });
    }
  });
  
  return invalidFiles;
}

/**
 * Delete a single file from both Firestore and Storage
 */
export async function deleteFile(file: FileToDelete): Promise<void> {
  try {
    // Delete from Firestore
    await backendService.documents.delete('files', file.id);
    
    // Delete from Storage
    if (file.storagePath) {
      await backendService.storage.delete(file.storagePath);
    }
    
    console.log(`Successfully deleted file ${file.id} (${file.storagePath})`);
  } catch (error) {
    console.error(`Failed to delete file ${file.id}:`, error);
    throw error;
  }
}

/**
 * Delete all files with invalid metadata for a user
 */
export async function cleanupInvalidFiles(userUid: string): Promise<void> {
  console.log(`Starting cleanup for user ${userUid}...`);
  
  const invalidFiles = await getFilesWithInvalidMetadata(userUid);
  
  if (invalidFiles.length === 0) {
    console.log('No files with invalid metadata found.');
    return;
  }
  
  console.log(`Found ${invalidFiles.length} files with invalid metadata:`);
  invalidFiles.forEach((file, index) => {
    console.log(`  ${index + 1}. ${file.id} - Name type: ${typeof file.name}, Size type: ${typeof file.size}`);
  });
  
  console.log('Deleting files...');
  
  for (const file of invalidFiles) {
    try {
      await deleteFile(file);
    } catch (error) {
      console.error(`Failed to delete file ${file.id}, continuing...`);
    }
  }
  
  console.log(`Cleanup completed. Deleted ${invalidFiles.length} files.`);
}

/**
 * Get count of files with invalid metadata (for checking before cleanup)
 */
export async function countInvalidFiles(userUid: string): Promise<number> {
  const invalidFiles = await getFilesWithInvalidMetadata(userUid);
  return invalidFiles.length;
}

/**
 * Find and clean up orphaned form attachments
 * These are attachment files that are no longer referenced by any form
 */
export async function cleanupOrphanedFormAttachments(
  userId: string,
  privateKey: string,
  dryRun: boolean = true
): Promise<{ orphaned: string[]; deleted: string[]; errors: Array<{ id: string; error: string }> }> {
  console.log(`🔍 Starting orphaned attachment cleanup for user ${userId}...`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no deletions)' : 'DELETE MODE'}`);
  
  const result = {
    orphaned: [] as string[],
    deleted: [] as string[],
    errors: [] as Array<{ id: string; error: string }>
  };

  try {
    // Step 1: Get all attachment files for this user
    const allFiles = await backendService.query.get('files', [
      { type: 'where', field: 'owner', operator: '==', value: userId },
      { type: 'limit', limitValue: 1000 }
    ]);
    
    const attachmentFiles = allFiles.filter(file => file.fileType === 'attachment');
    console.log(`📎 Found ${attachmentFiles.length} attachment files`);
    
    if (attachmentFiles.length === 0) {
      console.log('✅ No attachments to check');
      return result;
    }

    // Step 2: Get all form files and extract referenced attachment IDs
    const formFiles = allFiles.filter(file => {
      if (!file.name) return false;
      
      // Handle both encrypted and unencrypted names
      if (typeof file.name === 'string') {
        return isFormFile(file.name);
      }
      // For encrypted names, we'll need to decrypt them later
      return true; // Include for now, check after decryption
    });
    
    console.log(`📋 Found ${formFiles.length} potential form files`);
    
    const referencedAttachmentIds = new Set<string>();
    let formsChecked = 0;

    // Step 3: Parse each form to collect referenced attachment IDs
    for (const formFile of formFiles) {
      try {
        // Decrypt filename if needed
        let fileName: string;
        if (typeof formFile.name === 'string') {
          fileName = formFile.name;
        } else {
          const metadata = await decryptMetadata(formFile, userId, privateKey);
          fileName = metadata.decryptedName;
        }

        // Skip if not actually a form file
        if (!isFormFile(fileName)) {
          continue;
        }

        formsChecked++;
        
        // Load and parse form content
        const contentBuffer = await FileAccessService.loadFileContent(formFile, userId, privateKey);
        const formText = new TextDecoder().decode(contentBuffer);
        const formData = JSON.parse(formText);
        
        // Collect attachment IDs from formData.attachments
        if (formData.attachments && typeof formData.attachments === 'object') {
          Object.keys(formData.attachments).forEach(fileId => {
            referencedAttachmentIds.add(fileId);
          });
        }
        
        // Collect attachment IDs from formData.imageAttachments
        if (formData.imageAttachments && Array.isArray(formData.imageAttachments)) {
          formData.imageAttachments.forEach((img: any) => {
            if (img.fileId) {
              referencedAttachmentIds.add(img.fileId);
            }
          });
        }
      } catch (error) {
        console.warn(`⚠️ Could not parse form ${formFile.id}:`, error);
        // Continue with other forms even if one fails
      }
    }
    
    console.log(`✅ Checked ${formsChecked} forms, found ${referencedAttachmentIds.size} referenced attachments`);

    // Step 4: Find orphaned attachments
    for (const attachment of attachmentFiles) {
      if (!referencedAttachmentIds.has(attachment.id!)) {
        result.orphaned.push(attachment.id!);
        
        // Delete if not in dry run mode
        if (!dryRun) {
          try {
            await backendService.documents.delete('files', attachment.id!);
            if (attachment.storagePath) {
              await backendService.storage.delete(attachment.storagePath);
            }
            result.deleted.push(attachment.id!);
            console.log(`🗑️ Deleted orphaned attachment: ${attachment.id}`);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            result.errors.push({ id: attachment.id!, error: errorMsg });
            console.error(`❌ Failed to delete attachment ${attachment.id}:`, error);
          }
        }
      }
    }

    // Invalidate storage cache if we deleted anything
    if (result.deleted.length > 0) {
      invalidateStorageUsage(userId);
    }

    // Step 5: Report results
    console.log('\n📊 Cleanup Results:');
    console.log(`   Total attachments: ${attachmentFiles.length}`);
    console.log(`   Referenced: ${referencedAttachmentIds.size}`);
    console.log(`   Orphaned: ${result.orphaned.length}`);
    if (!dryRun) {
      console.log(`   Deleted: ${result.deleted.length}`);
      console.log(`   Errors: ${result.errors.length}`);
    }
    
    if (dryRun && result.orphaned.length > 0) {
      console.log(`\n💡 Run with dryRun=false to delete these orphaned attachments`);
      console.log('   Orphaned IDs:', result.orphaned);
    }

    return result;
  } catch (error) {
    console.error('❌ Error during orphaned attachment cleanup:', error);
    throw error;
  }
}

/**
 * Get statistics about form attachments
 */
export async function getFormAttachmentStats(
  userId: string,
  privateKey: string
): Promise<{
  totalAttachments: number;
  referencedAttachments: number;
  orphanedAttachments: number;
  totalForms: number;
}> {
  const allFiles = await backendService.query.get('files', [
    { type: 'where', field: 'owner', operator: '==', value: userId },
    { type: 'limit', limitValue: 1000 }
  ]);
  
  const attachmentFiles = allFiles.filter(file => file.fileType === 'attachment');
  const referencedAttachmentIds = new Set<string>();
  let formsCount = 0;

  for (const file of allFiles) {
    try {
      let fileName: string;
      if (typeof file.name === 'string') {
        fileName = file.name;
      } else if (file.name) {
        const metadata = await decryptMetadata(file, userId, privateKey);
        fileName = metadata.decryptedName;
      } else {
        continue;
      }

      if (!isFormFile(fileName)) continue;
      
      formsCount++;
      const contentBuffer = await FileAccessService.loadFileContent(file, userId, privateKey);
      const formText = new TextDecoder().decode(contentBuffer);
      const formData = JSON.parse(formText);
      
      if (formData.attachments) {
        Object.keys(formData.attachments).forEach(fileId => referencedAttachmentIds.add(fileId));
      }
      
      if (formData.imageAttachments) {
        formData.imageAttachments.forEach((img: any) => {
          if (img.fileId) referencedAttachmentIds.add(img.fileId);
        });
      }
    } catch (error) {
      // Skip files that can't be parsed
    }
  }

  return {
    totalAttachments: attachmentFiles.length,
    referencedAttachments: referencedAttachmentIds.size,
    orphanedAttachments: attachmentFiles.length - referencedAttachmentIds.size,
    totalForms: formsCount
  };
}