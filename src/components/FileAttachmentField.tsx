import React, { useState, useRef } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Alert,
  LinearProgress,
  Paper,
  Divider,
} from '@mui/material';
import {
  Delete,
  Description,
  CloudUpload,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { createFileWithSharing } from '../files';
import { FileEncryptionService } from '../services/fileEncryption';
import { useFileUpload } from '../hooks/useFileUpload';
import type { FormFieldDefinition, AttachedFile } from '../utils/formFiles';

interface FileAttachmentFieldProps {
  field: FormFieldDefinition;
  attachments: AttachedFile[];
  userId: string;
  privateKey: string;
  parentFolder: string | null;
  onFileAdded: (fileId: string, metadata: Omit<AttachedFile, 'id'>) => void;
  onFileRemoved: (fileId: string) => void;
  disabled?: boolean;
}

const FileAttachmentField: React.FC<FileAttachmentFieldProps> = ({
  field,
  attachments,
  userId,
  privateKey,
  parentFolder,
  onFileAdded,
  onFileRemoved,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile } = useFileUpload();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const maxFiles = field.fileConfig?.maxFiles; // No default limit - use storage quota
  const maxFileSize = field.fileConfig?.maxFileSize || 10 * 1024 * 1024; // 10MB
  const allowedTypes = field.fileConfig?.allowedTypes;

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const validateFile = (file: File): string | null => {
    if (file.size > maxFileSize) {
      return t('forms.fileField.errors.fileTooLarge', { 
        size: formatFileSize(maxFileSize) 
      }) || `File too large. Maximum size: ${formatFileSize(maxFileSize)}`;
    }

    if (allowedTypes && !allowedTypes.includes(file.type)) {
      return t('forms.fileField.errors.fileTypeNotAllowed', {
        types: allowedTypes.join(', ')
      }) || `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`;
    }

    return null;
  };

  const handleFileSelect = () => {
    if (disabled || uploading) return;
    
    if (maxFiles && attachments.length >= maxFiles) {
      setError(t('forms.fileField.errors.maxFilesReached', { max: maxFiles }) || 
              `Maximum ${maxFiles} files allowed`);
      return;
    }

    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    setUploadProgress(0);

    // Convert FileList to array
    const fileArray = Array.from(files);

    // Validate all files first
    for (const file of fileArray) {
      const validationError = validateFile(file);
      if (validationError) {
        setError(`${file.name}: ${validationError}`);
        return;
      }
    }

    // Check if adding these files would exceed the limit (only if maxFiles is set)
    if (maxFiles && attachments.length + fileArray.length > maxFiles) {
      setError(t('forms.fileField.errors.maxFilesReached', { max: maxFiles }) ||
              `Maximum ${maxFiles} files allowed. You can add ${maxFiles - attachments.length} more file(s).`);
      return;
    }

    setUploading(true);
    let uploadedCount = 0;
    const totalFiles = fileArray.length;

    try {
      // Upload files one at a time to show progress
      for (const file of fileArray) {
        // Use the upload hook which handles quota checking, progress, and encryption
        const encryptionResult = await uploadFile(file, {
          folderId: parentFolder,
          participants: [userId],
          privateKey,
          onProgress: (progress) => {
            // Calculate overall progress across all files
            const baseProgress = (uploadedCount / totalFiles) * 100;
            const fileProgress = (progress.progress / totalFiles);
            setUploadProgress(Math.round(baseProgress + fileProgress));
          },
        });

        // Create file record with fileType: 'attachment' to hide from main view
        const fileRecord = await FileEncryptionService.createFileRecord(
          userId,
          encryptionResult.encryptedMetadata,
          encryptionResult.storagePath,
          encryptionResult.encryptedKeys,
          [userId], // Only current user
          parentFolder
        );
        
        // Mark as attachment so it's hidden from main folder view
        (fileRecord as any).fileType = 'attachment';

        const fileId = await createFileWithSharing(fileRecord);

        // Add to form
        onFileAdded(fileId, {
          originalName: file.name,
          size: file.size,
          mimeType: file.type,
          uploadedAt: new Date().toISOString(),
        });

        uploadedCount++;
      }

      setUploadProgress(100);

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      console.error('Error uploading file:', error);
      setError(error instanceof Error ? error.message : `Upload failed. ${uploadedCount} of ${totalFiles} file(s) uploaded successfully.`);
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 2000);
    }
  };

  const handleRemoveFile = (fileId: string) => {
    if (disabled || uploading) return;
    onFileRemoved(fileId);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !uploading && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setDragActive(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (disabled || uploading) return;

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    // Simulate a file input change event using the dropped files
    const fakeEvent = {
      target: { files, value: '' },
    } as unknown as React.ChangeEvent<HTMLInputElement>;
    await handleFileChange(fakeEvent);
  };

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {field.label} {field.required && '*'}
      </Typography>

      {field.fileConfig?.description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {field.fileConfig.description}
        </Typography>
      )}

      {/* File Upload Area */}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          textAlign: 'center',
          bgcolor: dragActive ? 'action.hover' : disabled ? 'action.disabledBackground' : 'background.default',
          cursor: disabled || uploading || (maxFiles && attachments.length >= maxFiles) ? 'default' : 'pointer',
          border: '2px dashed',
          borderColor: dragActive ? 'primary.main' : error ? 'error.main' : 'divider',
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            borderColor: disabled || uploading || (maxFiles && attachments.length >= maxFiles) ? undefined : 'primary.main',
            bgcolor: disabled || uploading || (maxFiles && attachments.length >= maxFiles) ? undefined : 'action.hover',
          },
        }}
        onClick={handleFileSelect}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <CloudUpload sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
        <Typography variant="h6" sx={{ mb: 1 }}>
          {uploading 
            ? t('forms.fileField.uploading', 'Uploading...') 
            : (maxFiles && attachments.length >= maxFiles)
            ? t('forms.fileField.maxFilesReached', 'Maximum files reached')
            : t('forms.fileField.dropOrClick', 'Drop files here or click to browse')
          }
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('forms.fileField.maxSize', { size: formatFileSize(maxFileSize) }) || 
           `Maximum file size: ${formatFileSize(maxFileSize)}`}
          {allowedTypes && (
            <>
              <br />
              {t('forms.fileField.allowedTypes', { types: allowedTypes.join(', ') }) || 
               `Allowed types: ${allowedTypes.join(', ')}`}
            </>
          )}
        </Typography>
      </Paper>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
        accept={allowedTypes?.join(',')}
        disabled={disabled || uploading || (maxFiles !== undefined && attachments.length >= maxFiles)}
      />

      {/* Upload Progress */}
      {uploading && (
        <Box sx={{ mt: 2 }}>
          <LinearProgress variant="determinate" value={uploadProgress} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t('forms.fileField.uploadProgress', { progress: uploadProgress }) || 
             `Upload progress: ${uploadProgress}%`}
          </Typography>
        </Box>
      )}

      {/* Error Message */}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {/* Attached Files List */}
      {attachments.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t('forms.fileField.attachedFiles', 'Attached Files')} ({attachments.length}{maxFiles ? `/${maxFiles}` : ''})
          </Typography>
          
          {attachments.map((attachment) => (
            <Box
              key={attachment.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                p: 1,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                mb: 1,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <Description sx={{ mr: 1, color: 'text.secondary' }} />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {attachment.originalName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatFileSize(attachment.size)}
                    {attachment.mimeType && ` • ${attachment.mimeType}`}
                  </Typography>
                </Box>
              </Box>
              
              <IconButton
                size="small"
                onClick={() => handleRemoveFile(attachment.id)}
                disabled={disabled || uploading}
                color="error"
              >
                <Delete />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default FileAttachmentField;