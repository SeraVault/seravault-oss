import React, { useState, useRef } from 'react';
import { Box, Typography, LinearProgress, Fade, useTheme, Card, CardContent, Alert, Button } from '@mui/material';
import { useAuth } from '../auth/AuthContext';
import { createFileWithSharing } from '../files';
import { useFileUpload } from '../hooks/useFileUpload';
import { FileEncryptionService } from '../services/fileEncryption';
import { useTranslation } from 'react-i18next';

interface FileUploadAreaProps {
  currentFolder: string | null;
  privateKey: string;
  onUploadComplete?: (uploadedFileIds: string[]) => void;
  children: React.ReactNode;
}

const FileUploadArea: React.FC<FileUploadAreaProps> = ({
  currentFolder,
  privateKey,
  onUploadComplete,
  children,
}) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const theme = useTheme();
  const [dragActive, setDragActive] = useState(false);
  const [uploadingMultiple, setUploadingMultiple] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const [currentFileSize, setCurrentFileSize] = useState('');
  const [uploadStage, setUploadStage] = useState('');
  const [uploadStats, setUploadStats] = useState({ current: 0, total: 0, successCount: 0, failCount: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Use the file upload hook
  const { uploadFile } = useFileUpload();

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);
    return `${size.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
  };

  const handleFileUpload = async (file: File): Promise<string | null> => {
    if (!user || !privateKey) return null;

    try {
      // Use the upload hook which handles quota checking, progress, and encryption
      const encryptionResult = await uploadFile(file, {
        folderId: currentFolder,
        participants: [user.uid],
        privateKey,
        onProgress: (progress) => {
          setUploadStage(progress.stage);
          // Note: Individual file progress is handled by the batch progress calculation
        },
      });

      // Create file record in Firestore
      setUploadStage('Creating file record...');
      const fileRecord = await FileEncryptionService.createFileRecord(
        user.uid,
        encryptionResult.encryptedMetadata,
        encryptionResult.storagePath,
        encryptionResult.encryptedKeys,
        [user.uid],
        currentFolder
      );

      const fileId = await createFileWithSharing(fileRecord);

      setUploadStage('Upload complete!');
      return fileId;
    } catch (error) {
      setUploadStage('Upload failed');
      console.error('File upload failed:', error);
      throw error;
    }
  };

  const handleMultipleFileUploads = async (files: File[]) => {
    if (files.length === 0) return;
    
    const totalFiles = files.length;
    let successCount = 0;
    let failCount = 0;
    let quotaExceeded = false;
    const uploadedFileIds: string[] = [];

    setUploadingMultiple(true);
    setUploadStats({ current: 0, total: totalFiles, successCount: 0, failCount: 0 });
    setUploadProgress(0);
    setUploadStage('Preparing files for upload...');
    
    console.log(`Starting upload of ${totalFiles} files...`);
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Update UI state for current file
      setCurrentFileName(file.name);
      setCurrentFileSize(formatFileSize(file.size));
      setUploadStats({ current: i + 1, total: totalFiles, successCount, failCount });
      setUploadStage('Starting upload...');
      
      console.log(`Uploading file ${i + 1}/${totalFiles}: ${file.name}`);
      
      try {
        const fileId = await handleFileUpload(file);
        if (fileId) {
          uploadedFileIds.push(fileId);
        }
        successCount++;
        console.log(`✓ Upload ${i + 1}/${totalFiles} completed: ${file.name}`);
      } catch (error) {
        failCount++;
        console.error(`✗ Upload ${i + 1}/${totalFiles} failed: ${file.name}`, error);

      }
      
      // Update progress and stats
      const progress = ((i + 1) / totalFiles) * 100;
      setUploadProgress(progress);
      setUploadStats({ current: i + 1, total: totalFiles, successCount, failCount });
    }
    
    // Show final status
    if (quotaExceeded) {
      setUploadStage(`Upload stopped: Storage quota exceeded`);
    } else if (failCount === 0) {
      setUploadStage(`Successfully uploaded ${successCount} file${successCount === 1 ? '' : 's'}!`);
    } else {
      setUploadStage(`Upload completed with ${failCount} error${failCount === 1 ? '' : 's'}`);
    }
    
    // Short delay to show completion status
    await new Promise(resolve => setTimeout(resolve, quotaExceeded ? 3000 : 1500));
    
    // Reset upload state
    setUploadingMultiple(false);
    setUploadProgress(0);
    setCurrentFileName('');
    setCurrentFileSize('');
    setUploadStage('');
    setUploadStats({ current: 0, total: 0, successCount: 0, failCount: 0 });
    
    // Notify parent of upload completion with file IDs
    if (onUploadComplete) {
      onUploadComplete(uploadedFileIds);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      handleMultipleFileUploads(Array.from(files));
    }
    // Reset the input value to allow uploading the same file again
    event.target.value = '';
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      handleMultipleFileUploads(files);
    }
  };

  return (
    <Box
      sx={{ 
        position: 'relative',
        height: '100%',
        width: '100%',
        backgroundColor: dragActive ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
        border: dragActive ? '2px dashed #1976d2' : 'none',
        transition: 'all 0.2s ease-in-out',
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        onChange={handleFileChange} 
        multiple 
      />
      
      {/* Drag and Drop Overlay */}
      {dragActive && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(25, 118, 210, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          <Box
            sx={{
              backgroundColor: 'white',
              padding: 4,
              borderRadius: 2,
              boxShadow: 3,
              textAlign: 'center',
              border: '3px dashed #1976d2',
            }}
          >
            <Typography variant="h5" color="primary" gutterBottom>
              Drop files here to upload
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Multiple files supported
            </Typography>
          </Box>
        </Box>
      )}
      
      {/* Upload Progress Indicator */}
      <Fade in={uploadingMultiple}>
        <Box
          sx={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 2000,
            minWidth: 300,
          }}
        >
          <Card
            elevation={8}
            sx={{
              minWidth: 380,
              maxWidth: 480,
              backgroundColor: theme.palette.background.paper,
            }}
          >
            <CardContent sx={{ pb: 2 }}>
              <Typography 
                variant="h6" 
                component="h2"
                gutterBottom 
                sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  color: theme.palette.text.primary,
                  fontWeight: theme.typography.fontWeightMedium
                }}
              >
                <span>Uploading Files</span>
                <span>({uploadStats.current} of {uploadStats.total})</span>
              </Typography>
              
              {/* Current File Section */}
              <Card 
                variant="outlined" 
                sx={{ 
                  mb: 3, 
                  backgroundColor: theme.palette.action.hover,
                  borderColor: theme.palette.divider
                }}
              >
                <CardContent sx={{ py: 2, px: 2, '&:last-child': { pb: 2 } }}>
                  <Typography 
                    variant="overline" 
                    sx={{ 
                      display: 'block', 
                      mb: 1,
                      color: theme.palette.text.secondary,
                      fontWeight: theme.typography.fontWeightMedium
                    }}
                  >
                    Currently Processing:
                  </Typography>
                  
                  <Typography 
                    variant="body1" 
                    sx={{ 
                      fontWeight: theme.typography.fontWeightBold,
                      color: theme.palette.text.primary,
                      mb: 0.5,
                      wordBreak: 'break-all'
                    }}
                    title={currentFileName}
                  >
                    {currentFileName || 'Initializing upload...'}
                  </Typography>
                  
                  <Typography 
                    variant="body2" 
                    sx={{ color: theme.palette.text.secondary }}
                  >
                    {currentFileSize && `${currentFileSize} • `}{uploadStage}
                  </Typography>
                </CardContent>
              </Card>
              
              {/* Progress Bar */}
              <LinearProgress
                variant="determinate"
                value={uploadProgress}
                sx={{
                  height: 10,
                  borderRadius: 5,
                  mb: 2,
                  backgroundColor: theme.palette.action.disabled,
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 5,
                    backgroundColor: theme.palette.primary.main,
                  }
                }}
              />
              
              {/* Status Row */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography 
                  variant="body2" 
                  sx={{ color: theme.palette.text.secondary, fontWeight: theme.typography.fontWeightMedium }}
                >
                  {Math.round(uploadProgress)}% Complete
                </Typography>
                
                {(uploadStats.successCount > 0 || uploadStats.failCount > 0) && (
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    {uploadStats.successCount > 0 && (
                      <Typography 
                        variant="caption" 
                        sx={{ color: theme.palette.success.main, fontWeight: theme.typography.fontWeightMedium }}
                      >
                        ✓ {uploadStats.successCount}
                      </Typography>
                    )}
                    {uploadStats.failCount > 0 && (
                      <Typography 
                        variant="caption" 
                        sx={{ color: theme.palette.error.main, fontWeight: theme.typography.fontWeightMedium }}
                      >
                        ✗ {uploadStats.failCount}
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Fade>

      {/* Render children normally */}
      {children}
      
    </Box>
  );
};

export default FileUploadArea;