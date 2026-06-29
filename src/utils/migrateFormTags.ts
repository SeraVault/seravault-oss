/**
 * Temporary migration utility to move tags from encrypted form content
 * to the file collection's userTags field for sidebar filtering
 */

import { backendService } from '../backend/BackendService';
import { getFile } from '../storage';
import { FileEncryptionService } from '../services/fileEncryption';
import { updateUserTagsInFirestore } from '../services/userTagsManagement';
import type { FileData } from '../files';
import type { SecureFormData } from './formFiles';

export interface MigrationStats {
  totalFiles: number;
  formsProcessed: number;
  tagsFound: number;
  tagsMigrated: number;
  errors: number;
}

/**
 * Migrate tags from form content to file collection userTags field
 */
export async function migrateFormTagsToFileCollection(
  userId: string,
  privateKey: string
): Promise<MigrationStats> {
  console.log('🔄 Starting form tags migration to file collection...');

  const stats: MigrationStats = {
    totalFiles: 0,
    formsProcessed: 0,
    tagsFound: 0,
    tagsMigrated: 0,
    errors: 0,
  };

  try {
    // Get all files the user has access to
    const [ownedFiles, sharedFiles] = await Promise.all([
      backendService.query.get('files', [
        { field: 'owner', operator: '==', value: userId }
      ]),
      backendService.query.get('files', [
        { field: 'sharedWith', operator: 'array-contains', value: userId }
      ])
    ]);

    // Combine and deduplicate files
    const allFiles = new Map<string, FileData>();

    ownedFiles.forEach(file => {
      allFiles.set(file.id!, file as FileData);
    });

    sharedFiles.forEach(file => {
      if (!allFiles.has(file.id!)) {
        allFiles.set(file.id!, file as FileData);
      }
    });

    stats.totalFiles = allFiles.size;
    console.log(`📋 Found ${stats.totalFiles} files to check for form tags`);

    // Process files in batches
    const files = Array.from(allFiles.values());
    const batchSize = 5;

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);

      console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(files.length/batchSize)}`);

      await Promise.all(
        batch.map(async (file) => {
          try {
            // Check if this looks like a form file
            const fileName = typeof file.name === 'string' ? file.name : '';
            if (!fileName.endsWith('.form')) {
              return; // Skip non-form files
            }

            // Check if user has access
            if (!file.encryptedKeys[userId]) {
              return; // Skip files without access
            }

            console.log(`📄 Checking form file: ${fileName}`);

            // Download and decrypt the file content
            const encryptedContent = await getFile(file.storagePath);
            const decryptedContent = await FileEncryptionService.decryptFile(
              new Uint8Array(encryptedContent),
              file.encryptedKeys[userId],
              privateKey
            );

            // Parse the JSON content
            const formData: SecureFormData = JSON.parse(new TextDecoder().decode(decryptedContent));
            stats.formsProcessed++;

            // Check if the form has tags
            if (formData.tags && formData.tags.length > 0) {
              console.log(`🏷️ Found ${formData.tags.length} tags in form: ${formData.tags.join(', ')}`);
              stats.tagsFound += formData.tags.length;

              // Check if tags are already in the file collection
              const hasExistingTags = file.userTags && file.userTags[userId];

              if (!hasExistingTags) {
                // Migrate tags to file collection
                await updateUserTagsInFirestore(file.id!, userId, formData.tags, privateKey, file);
                stats.tagsMigrated += formData.tags.length;
                console.log(`✅ Migrated ${formData.tags.length} tags for file ${fileName}`);
              } else {
                console.log(`⏭️ Tags already exist in file collection for ${fileName}`);
              }
            }

          } catch (error) {
            console.error(`❌ Error processing file ${file.id}:`, error);
            stats.errors++;
          }
        })
      );

      // Small delay between batches to keep UI responsive
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('✅ Form tags migration completed!');
    console.log(`📊 Migration Statistics:`);
    console.log(`   - Total files checked: ${stats.totalFiles}`);
    console.log(`   - Form files processed: ${stats.formsProcessed}`);
    console.log(`   - Tags found: ${stats.tagsFound}`);
    console.log(`   - Tags migrated: ${stats.tagsMigrated}`);
    console.log(`   - Errors: ${stats.errors}`);

    return stats;

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Add migration function to window for easy console access
 */
declare global {
  interface Window {
    migrateFormTags: (userId: string, privateKey: string) => Promise<MigrationStats>;
  }
}

if (typeof window !== 'undefined') {
  window.migrateFormTags = migrateFormTagsToFileCollection;
}