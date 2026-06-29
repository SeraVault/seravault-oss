// @ts-nocheck
/**
 * Form utilities that treat forms as JSON files using existing file encryption/sharing
 */

import { createFileWithSharing, updateFile } from '../files';
import { uploadFileData } from '../storage';
import { getUserProfile } from '../firestore';
import { FileEncryptionService } from '../services/fileEncryption';
import { decryptData, hexToBytes } from '../crypto/quantumSafeCrypto';

export interface FormFieldDefinition {
  id: string;
  type: 'text' | 'password' | 'email' | 'number' | 'date' | 'select' | 'textarea' | 'richtext' | 'file' | 'url' | 'phone' | 'otp';
  label: string;
  placeholder?: string;
  required?: boolean;
  sensitive?: boolean; // For fields like passwords, card numbers
  options?: string[]; // For select fields
  fileConfig?: { // Configuration for file fields
    maxFiles?: number; // Maximum number of files allowed (default: 5)
    maxFileSize?: number; // Maximum file size in bytes (default: 10MB)
    allowedTypes?: string[]; // Allowed MIME types (default: all)
    description?: string; // Help text for file upload
  };
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    customMessage?: string;
  };
}

export interface FormField extends FormFieldDefinition {
  value: string | string[]; // string for regular fields, string[] for file field (file IDs)
}

export interface AttachedFile {
  id: string; // File ID from the files collection
  originalName: string; // Original filename when uploaded
  size: number; // File size in bytes
  mimeType?: string; // MIME type
  uploadedAt: string; // ISO timestamp
}

export interface FormMetadata {
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
  version: string;
  author?: string;
  created: string;
  modified: string;
  isFavorite?: boolean; // Add favorites support
}

export interface FormLocalization {
  [fieldId: string]: {
    label?: string;
    placeholder?: string;
    options?: string[];
    description?: string;
  };
}

export type FormType = 'blank' | 'template' | 'builtin' | 'credit_card' | 'password' | 'bank_account' | 'identity' | 'secure_note' | 'wifi' | 'custom';

export interface FormTemplate {
  // Template identification
  templateId?: string; // Optional template ID if created from a template
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
  version: string;
  author?: string; // User ID of template creator
  isPublic?: boolean; // Whether this template can be shared publicly
  isOfficial?: boolean; // Whether this is an official template
  titleField?: string; // Field ID to use as document title/name
  
  // Template structure (same as schema)
  schema: {
    fields: FormFieldDefinition[];
    sections?: {
      id: string;
      title: string;
      fieldIds: string[];
      collapsible?: boolean;
    }[];
  };
  
  // Default data structure for new instances
  defaultData?: {
    [fieldId: string]: string | string[];
  };
  
  // Usage tracking (for templates)
  usageCount?: number;
  tags?: string[];
}

export interface SecureFormData {
  // Form metadata
  metadata: FormMetadata;
  
  // Embedded template information - this travels with the form
  template?: FormTemplate;
  
  // Form structure definition (can come from template or be custom)
  schema: {
    fields: FormFieldDefinition[];
    sections?: {
      id: string;
      title: string;
      fieldIds: string[];
      collapsible?: boolean;
    }[];
  };
  
  // User's data for this form instance
  data: {
    [fieldId: string]: string | string[]; // string for regular fields, string[] for file field IDs
  };
  
  // File attachments metadata (keyed by file ID)
  attachments?: {
    [fileId: string]: AttachedFile;
  };
  
  // Image attachments in richtext fields
  imageAttachments?: Array<{
    fileId: string;
    storagePath: string;
    encryptedKey: string;
    fileName: string;
  }>;
  
  // User-defined localization
  localization?: {
    [locale: string]: {
      metadata?: Partial<FormMetadata>;
      fields?: FormLocalization;
      sections?: { [sectionId: string]: string };
    };
  };
  
  // Instance-specific metadata
  tags?: string[];
  favorite?: boolean;
  lastAccessed?: string;
}

/**
 * Create a new blank form
 */
export function createBlankForm(name: string, author?: string): SecureFormData {
  const now = new Date().toISOString();
  
  return {
    metadata: {
      name,
      version: '1.0.0',
      author,
      created: now,
      modified: now,
    },
    schema: {
      fields: [],
    },
    data: {},
    attachments: {},
    tags: [],
  };
}

// Helper functions removed - now using imports from crypto module

/**
 * Helper: Prepare form data for saving (update timestamp, serialize to JSON)
 */
function prepareFormDataForSave(formData: SecureFormData): {
  updatedFormData: SecureFormData;
  jsonString: string;
  content: Uint8Array;
  fileName: string;
  totalSize: number;
} {
  const updatedFormData = {
    ...formData,
    metadata: {
      ...formData.metadata,
      modified: new Date().toISOString(),
    },
  };

  const jsonString = JSON.stringify(updatedFormData, null, 2);
  const content = new TextEncoder().encode(jsonString);
  const fileName = generateDocumentName(updatedFormData);
  const totalSize = calculateTotalFormSize(jsonString.length, updatedFormData);

  console.log('🎯 Form preparation - Size:', totalSize, 'bytes (JSON:', jsonString.length, ', Attachments:', Object.keys(updatedFormData.attachments || {}).length, ')');

  return { updatedFormData, jsonString, content, fileName, totalSize };
}

/**
 * Generate document filename based on template's titleField
 */
function generateDocumentName(formData: SecureFormData): string {
  // Get form category/type for filename
  const formCategory = formData.template?.category || formData.metadata?.category || 'custom';
  
  // Check if form has an embedded template with titleField
  if (formData.template?.titleField) {
    const titleFieldId = formData.template.titleField;
    const titleValue = formData.data[titleFieldId];
    
    if (titleValue && typeof titleValue === 'string' && titleValue.trim()) {
      // Clean the title value for filename (remove invalid characters)
      const cleanTitle = titleValue.trim().replace(/[^\w\s\-.]/g, '').substring(0, 50);
      return `${cleanTitle}.${formCategory}.form`;
    }
  }
  
  // Fallback to metadata name if no title field or value
  const fallbackName = formData.metadata.name || 'Untitled Form';
  return `${fallbackName}.${formCategory}.form`;
}

/**
 * Helper: Encrypt form content with an existing file key
 */
async function encryptFormContentWithKey(
  content: Uint8Array,
  fileKey: Uint8Array,
  userId: string
): Promise<{ encryptedData: Uint8Array; storagePath: string }> {
  // Generate new IV for this encryption
  const contentIv = crypto.getRandomValues(new Uint8Array(12));
  
  // Encrypt content with AES-GCM
  const encryptedContent = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: contentIv },
    await crypto.subtle.importKey('raw', fileKey, 'AES-GCM', false, ['encrypt']),
    content
  );

  // Combine IV and encrypted content (standard format)
  const encryptedData = new Uint8Array(contentIv.length + encryptedContent.byteLength);
  encryptedData.set(contentIv, 0);
  encryptedData.set(new Uint8Array(encryptedContent), contentIv.length);
  
  // Generate new storage path for updated content (must include userId for storage rules)
  const storagePath = `files/${userId}/${crypto.randomUUID()}`;
  
  return { encryptedData, storagePath };
}

/**
 * Update an existing form file (preserves sharing and encryption keys)
 */
export async function updateFormFile(
  fileId: string,
  formData: SecureFormData,
  userId: string,
  privateKey: string
): Promise<void> {
  try {
    // Get the existing file to preserve sharing and encryption keys
    const { backendService } = await import('../backend/BackendService');
    const existingFile = await backendService.files.get(fileId);
    if (!existingFile) {
      throw new Error('File not found');
    }
    
    // Decrypt the existing file key using the user's private key
    const userEncryptedKey = existingFile.encryptedKeys[userId];
    if (!userEncryptedKey) {
      throw new Error('User does not have access to this file');
    }
    
    const privateKeyBytes = hexToBytes(privateKey);
    const keyData = hexToBytes(userEncryptedKey);
    
    // ML-KEM-768 encrypted keys: IV (12) + encapsulated_key (1088) + ciphertext
    const iv = keyData.slice(0, 12);
    const encapsulatedKey = keyData.slice(12, 12 + 1088);
    const ciphertext = keyData.slice(12 + 1088);
    
    // Decrypt the file key
    const fileKey = await decryptData({ iv, encapsulatedKey, ciphertext }, privateKeyBytes);

    // Prepare form data for saving
    const { content, fileName, totalSize } = prepareFormDataForSave(formData);
    
    // Encrypt content with existing file key
    const { encryptedData, storagePath } = await encryptFormContentWithKey(content, fileKey, userId);
    
    // Upload encrypted content to storage
    await uploadFileData(storagePath, encryptedData);
    
    // Encrypt the updated metadata using the file key
    const { encryptMetadata } = await import('../crypto/quantumSafeCrypto');
    const encryptedMetadata = await encryptMetadata(
      { name: fileName, size: totalSize.toString() },
      fileKey
    );

    // Update the user's personalized file name
    const { setUserFileName } = await import('../services/userNamesManagement');
    await setUserFileName(fileId, fileName, userId, privateKey, existingFile);

    // Update file record with new storage path and metadata (preserve encryption keys)
    await updateFile(fileId, {
      storagePath,
      name: encryptedMetadata.name,
      size: encryptedMetadata.size,
      // encryptedKeys NOT updated - preserves sharing
    });

    console.log('✅ Form updated successfully');

    // Invalidate all caches for this file
    console.log('🗑️ Invalidating caches...');
    const { metadataCache } = await import('../services/metadataCache');
    const { fileCacheService } = await import('../services/FileCacheService');
    const { offlineFileCache } = await import('../services/offlineFileCache');
    
    metadataCache.invalidate(fileId);
    await fileCacheService.invalidate(fileId);
    await offlineFileCache.removeCachedFile(fileId).catch(() => {}); // Ignore errors
    
    console.log('✅ Caches invalidated');
  } catch (error) {
    console.error('Error updating form file:', error);
    throw error;
  }
}

export async function saveFormAsFile(
  formData: SecureFormData,
  userId: string,
  _privateKey: string,
  parentFolder: string | null = null
): Promise<string> {
  try {
    // Prepare form data for saving
    const { content, fileName, totalSize } = prepareFormDataForSave(formData);


    // Encrypt form for current user using centralized service
    const encryptionResult = await FileEncryptionService.encryptFileForUsers(
      content,
      fileName,
      totalSize,
      [userId],
      userId,
      parentFolder
    );
    
    // Upload encrypted content to storage
    await uploadFileData(encryptionResult.storagePath, encryptionResult.encryptedContent);

    // Create file record
    const fileRecord = await FileEncryptionService.createFileRecord(
      userId,
      encryptionResult.encryptedMetadata,
      encryptionResult.storagePath,
      encryptionResult.encryptedKeys,
      [userId],
      parentFolder
    );
    
    const fileId = await createFileWithSharing(fileRecord);
    console.log('✅ Form created successfully:', fileId);

    return fileId;
  } catch (error) {
    console.error('Error saving form file:', error);
    throw new Error(`Form save failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Load form data from a JSON file
 */
export async function loadFormFromFile(fileContent: string): Promise<SecureFormData> {
  try {
    const formData = JSON.parse(fileContent) as SecureFormData;
    
    // Validate the form data structure
    if (!formData.metadata?.name || !formData.schema?.fields || !formData.data) {
      throw new Error('Invalid form data structure');
    }
    
    // Update last accessed timestamp
    if (formData.lastAccessed) {
      formData.lastAccessed = new Date().toISOString();
    }
    
    return formData;
  } catch (error) {
    console.error('Error parsing form data:', error);
    throw new Error('Failed to load form data');
  }
}

/**
 * Check if a file is a form file based on extension
 */
export function isFormFile(fileName: string): boolean {
  return fileName.endsWith('.form');
}

/**
 * Extract form type/category from filename
 * Expected format: Name.category.form (e.g., MyPassword.password.form)
 */
export function getFormTypeFromFilename(fileName: string): string | null {
  if (!isFormFile(fileName)) return null;
  
  // Remove .form extension
  const nameWithoutForm = fileName.replace(/\.form$/, '');
  
  // Split by dots and get the last part (the category)
  const parts = nameWithoutForm.split('.');
  if (parts.length >= 2) {
    // Last part should be the category
    return parts[parts.length - 1];
  }
  
  return null;
}

/**
 * Get display name from form filename
 * Removes both the category and .form extension
 * Example: 'MyPassword.password.form' -> 'MyPassword'
 */
export function getFormDisplayName(fileName: string): string {
  // Remove the .form extension
  const withoutForm = fileName.replace(/\.form$/, '');
  
  // Remove the category (last part before .form)
  // Format is: name.category.form, so we need to remove .category
  const parts = withoutForm.split('.');
  if (parts.length >= 2) {
    // Remove the last part (the category)
    return parts.slice(0, -1).join('.');
  }
  
  return withoutForm;
}

/**
 * Add a custom field to a form schema
 */
export function addFormField(
  formData: SecureFormData,
  fieldDefinition: Omit<FormFieldDefinition, 'id'>
): SecureFormData {
  const fieldId = `field_${Date.now()}`;
  const newField: FormFieldDefinition = {
    id: fieldId,
    ...fieldDefinition,
  };

  return {
    ...formData,
    schema: {
      ...formData.schema,
      fields: [...formData.schema.fields, newField],
    },
    data: {
      ...formData.data,
      [fieldId]: fieldDefinition.type === 'file' ? [] : '', // Initialize array for file fields, string for others
    },
    metadata: {
      ...formData.metadata,
      modified: new Date().toISOString(),
    },
  };
}

/**
 * Remove a field from a form schema
 */
export function removeFormField(formData: SecureFormData, fieldId: string): SecureFormData {
  const updatedData = { ...formData.data };
  delete updatedData[fieldId];

  return {
    ...formData,
    schema: {
      ...formData.schema,
      fields: formData.schema.fields.filter(field => field.id !== fieldId),
    },
    data: updatedData,
    metadata: {
      ...formData.metadata,
      modified: new Date().toISOString(),
    },
  };
}

/**
 * Update a field definition in a form schema
 */
export function updateFormField(
  formData: SecureFormData,
  fieldId: string,
  updates: Partial<FormFieldDefinition>
): SecureFormData {
  return {
    ...formData,
    schema: {
      ...formData.schema,
      fields: formData.schema.fields.map(field =>
        field.id === fieldId ? { ...field, ...updates } : field
      ),
    },
    metadata: {
      ...formData.metadata,
      modified: new Date().toISOString(),
    },
  };
}

/**
 * Update field data (user's input)
 */
export function updateFormData(
  formData: SecureFormData,
  fieldId: string,
  value: string | string[]
): SecureFormData {

  const result = {
    ...formData,
    data: {
      ...formData.data,
      [fieldId]: value,
    },
    metadata: {
      ...formData.metadata,
      modified: new Date().toISOString(),
    },
  };

  return result;
}

/**
 * Add a file attachment to a form
 */
export function addFileAttachment(
  formData: SecureFormData,
  fieldId: string,
  fileId: string,
  fileMetadata: Omit<AttachedFile, 'id'>
): SecureFormData {
  const field = formData.schema.fields.find(f => f.id === fieldId);
  if (!field || field.type !== 'file') {
    throw new Error('Field is not a file field');
  }

  const currentFiles = (formData.data[fieldId] as string[]) || [];
  const maxFiles = field.fileConfig?.maxFiles;
  
  if (maxFiles && currentFiles.length >= maxFiles) {
    throw new Error(`Maximum ${maxFiles} files allowed`);
  }

  const attachment: AttachedFile = {
    id: fileId,
    ...fileMetadata,
  };

  return {
    ...formData,
    data: {
      ...formData.data,
      [fieldId]: [...currentFiles, fileId],
    },
    attachments: {
      ...formData.attachments,
      [fileId]: attachment,
    },
    metadata: {
      ...formData.metadata,
      modified: new Date().toISOString(),
    },
  };
}

/**
 * Remove a file attachment from a form
 */
export function removeFileAttachment(
  formData: SecureFormData,
  fieldId: string,
  fileId: string
): SecureFormData {
  const currentFiles = (formData.data[fieldId] as string[]) || [];
  const updatedFiles = currentFiles.filter(id => id !== fileId);
  
  const updatedAttachments = { ...formData.attachments };
  delete updatedAttachments[fileId];

  return {
    ...formData,
    data: {
      ...formData.data,
      [fieldId]: updatedFiles,
    },
    attachments: updatedAttachments,
    metadata: {
      ...formData.metadata,
      modified: new Date().toISOString(),
    },
  };
}

/**
 * Get file attachments for a specific field
 */
export function getFieldAttachments(
  formData: SecureFormData,
  fieldId: string
): AttachedFile[] {
  const fileIds = (formData.data[fieldId] as string[]) || [];
  return fileIds
    .map(fileId => formData.attachments?.[fileId])
    .filter((attachment): attachment is AttachedFile => attachment !== undefined);
}

/**
 * Calculate total size of a form including all attachments
 * @param formJsonSize - Size of the form JSON file itself
 * @param formData - Parsed form data containing attachment metadata
 * @returns Total size in bytes (form + all attachments)
 */
export function calculateTotalFormSize(
  formJsonSize: number | string,
  formData: SecureFormData
): number {
  // Start with the form JSON file size
  let totalSize = typeof formJsonSize === 'string' ? parseInt(formJsonSize, 10) || 0 : formJsonSize;
  
  // Add all attachment sizes
  if (formData.attachments) {
    Object.values(formData.attachments).forEach(attachment => {
      totalSize += attachment.size || 0;
    });
  }
  
  return totalSize;
}

/**
 * Validate form data
 */
export function validateForm(formData: SecureFormData): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!formData.metadata.name.trim()) {
    errors.push('Form title is required');
  }

  // Only validate the titleField if one is defined in the template
  const titleField = formData.template?.titleField;
  if (titleField) {
    const titleValue = formData.data[titleField] as string || '';
    if (!titleValue.trim()) {
      const field = formData.schema.fields.find(f => f.id === titleField);
      errors.push(`${field?.label || 'Title field'} is required`);
    }
  }

  formData.schema.fields.forEach((field) => {
    const value = formData.data[field.id];
    
    // Skip required validation - only titleField is required now
    // Just validate format for non-empty fields
    
    // Handle file fields separately
    if (field.type === 'file') {
      return;
    }
    
    // Handle regular text fields - only validate format if value exists
    const textValue = value as string || '';
    if (!textValue) {
      return; // Skip validation for empty optional fields
    }

    if (textValue) {
      // Validate email fields
      if (field.type === 'email' && !/\S+@\S+\.\S+/.test(textValue)) {
        errors.push(`${field.label} must be a valid email address`);
      }

      // Validate URL fields
      if (field.type === 'url') {
        try {
          new URL(textValue);
        } catch {
          errors.push(`${field.label} must be a valid URL`);
        }
      }

      // Validate phone fields (international format)
      if (field.type === 'phone' && !/^\+?[\d\s\-()]+$/.test(textValue)) {
        errors.push(`${field.label} must be a valid phone number`);
      }

      // Validate OTP/TOTP fields (base32 encoded)
      if (field.type === 'otp' && textValue && !/^[A-Z2-7]+=*$/i.test(textValue.replace(/\s/g, ''))) {
        errors.push(`${field.label} must be a valid TOTP secret (Base32 format)`);
      }

      // Validate date fields
      if (field.type === 'date' && isNaN(Date.parse(textValue))) {
        errors.push(`${field.label} must be a valid date`);
      }

      // Validate number fields
      if (field.type === 'number' && isNaN(Number(textValue))) {
        errors.push(`${field.label} must be a valid number`);
      }

      // Validate custom validation rules
      if (field.validation) {
        const validation = field.validation;
        
        if (validation.minLength && textValue.length < validation.minLength) {
          errors.push(validation.customMessage || `${field.label} must be at least ${validation.minLength} characters long`);
        }
        
        if (validation.maxLength && textValue.length > validation.maxLength) {
          errors.push(validation.customMessage || `${field.label} must be no more than ${validation.maxLength} characters long`);
        }
        
        if (validation.pattern && !new RegExp(validation.pattern).test(textValue)) {
          errors.push(validation.customMessage || `${field.label} has an invalid format`);
        }
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Get localized field definition
 */
export function getLocalizedField(
  formData: SecureFormData,
  fieldId: string,
  locale: string = 'en'
): FormFieldDefinition {
  const field = formData.schema.fields.find(f => f.id === fieldId);
  if (!field) {
    throw new Error(`Field ${fieldId} not found`);
  }

  const localization = formData.localization?.[locale]?.fields?.[fieldId];
  if (!localization) {
    return field;
  }

  return {
    ...field,
    label: localization.label || field.label,
    placeholder: localization.placeholder || field.placeholder,
    options: localization.options || field.options,
  };
}

/**
 * Toggle favorite status of a form file
 */
export async function toggleFormFavorite(
  fileId: string,
  _privateKey: string,
  userId: string
): Promise<void> {
  const { backendService } = await import('../backend/BackendService');
  
  try {
    // Get the current file document
    const fileData = await backendService.files.get(fileId);
    
    if (!fileData) {
      throw new Error('File not found');
    }
    
    // Check if user has access to this file
    if (fileData.owner !== userId && !fileData.sharedWith?.includes(userId)) {
      throw new Error('Access denied');
    }
    
    // Toggle the favorite status directly in the file document
    const currentFavorite = fileData.isFavorite || false;
    
    await backendService.documents.update('files', fileId, {
      isFavorite: !currentFavorite,
      lastModified: new Date().toISOString(),
    });
    
    console.log(`✅ Toggled favorite status for file: ${fileData.name || '[Encrypted]'} -> ${!currentFavorite}`);
    
  } catch (error) {
    console.error('Error toggling favorite status:', error);
    throw error;
  }
}