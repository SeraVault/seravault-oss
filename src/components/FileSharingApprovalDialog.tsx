import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Avatar,
  Chip,
  Alert,
  FormControlLabel,
  Checkbox,
  CircularProgress,
} from '@mui/material';
import {
  Share,
  Person,
  Security,
  Block,
  Check,
  Warning,
} from '@mui/icons-material';

interface FileSharingApprovalDialogProps {
  open: boolean;
  onClose: () => void;
  senderName: string;
  senderEmail: string;
  fileName: string;
  fileSize?: string;
  fileType?: string;
  onApprove: (options: { addToContacts: boolean; alwaysAllow: boolean }) => Promise<void>;
  onReject: (options: { blockUser: boolean }) => Promise<void>;
  isProcessing?: boolean;
}

const FileSharingApprovalDialog: React.FC<FileSharingApprovalDialogProps> = ({
  open,
  onClose,
  senderName,
  senderEmail,
  fileName,
  fileSize,
  fileType,
  onApprove,
  onReject,
  isProcessing = false,
}) => {
  const [addToContacts, setAddToContacts] = useState(false);
  const [alwaysAllow, setAlwaysAllow] = useState(false);
  const [blockUser, setBlockUser] = useState(false);

  const handleApprove = async () => {
    await onApprove({ addToContacts, alwaysAllow });
  };

  const handleReject = async () => {
    await onReject({ blockUser });
  };

  const getDomainFromEmail = (email: string): string => {
    return email.split('@')[1] || '';
  };

  const formatFileSize = (size: string | undefined): string => {
    if (!size) return '';
    const bytes = parseInt(size);
    if (isNaN(bytes)) return size;
    
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let fileSize = bytes;
    
    while (fileSize >= 1024 && unitIndex < units.length - 1) {
      fileSize /= 1024;
      unitIndex++;
    }
    
    return `${Math.round(fileSize * 100) / 100} ${units[unitIndex]}`;
  };

  return (
    <Dialog
      open={open}
      onClose={isProcessing ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
        }
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Share color="primary" />
          <Typography variant="h6">
            File Sharing Request
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Alert severity="info" sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Warning />
            <Typography variant="body2">
              Someone you don't know wants to share a file with you
            </Typography>
          </Box>
        </Alert>

        {/* Sender Information */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <Avatar sx={{ bgcolor: 'primary.main', width: 56, height: 56 }}>
            <Person />
          </Avatar>
          <Box>
            <Typography variant="h6" gutterBottom>
              {senderName}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {senderEmail}
            </Typography>
            <Chip 
              label={`@${getDomainFromEmail(senderEmail)}`} 
              size="small" 
              variant="outlined" 
            />
          </Box>
        </Box>

        {/* File Information */}
        <Box sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 1, mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            File Details
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 1 }}>
            {fileName}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {fileType && (
              <Chip label={fileType} size="small" variant="outlined" />
            )}
            {fileSize && (
              <Chip label={formatFileSize(fileSize)} size="small" variant="outlined" />
            )}
          </Box>
        </Box>

        {/* Security Information */}
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Security sx={{ fontSize: 20, mt: 0.1 }} />
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Security Notice
              </Typography>
              <Typography variant="body2">
                This file will be encrypted and only you will be able to decrypt it. 
                However, be cautious when accepting files from unknown users.
              </Typography>
            </Box>
          </Box>
        </Alert>

        {/* Approval Options */}
        <Box sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 1, mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            If you accept this file:
          </Typography>
          
          <FormControlLabel
            control={
              <Checkbox
                checked={addToContacts}
                onChange={(e) => setAddToContacts(e.target.checked)}
              />
            }
            label={`Add ${senderName} to your contacts`}
            sx={{ mb: 1 }}
          />
          
          <FormControlLabel
            control={
              <Checkbox
                checked={alwaysAllow}
                onChange={(e) => setAlwaysAllow(e.target.checked)}
              />
            }
            label={`Always allow files from @${getDomainFromEmail(senderEmail)}`}
          />
        </Box>

        {/* Rejection Options */}
        <Box sx={{ bgcolor: 'error.50', p: 2, borderRadius: 1 }}>
          <Typography variant="subtitle2" gutterBottom color="error">
            If you reject this file:
          </Typography>
          
          <FormControlLabel
            control={
              <Checkbox
                checked={blockUser}
                onChange={(e) => setBlockUser(e.target.checked)}
              />
            }
            label={`Block ${senderName} from sending you files`}
            sx={{ color: 'error.main' }}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 3, gap: 1 }}>
        <Button
          onClick={handleReject}
          color="error"
          variant="outlined"
          disabled={isProcessing}
          startIcon={<Block />}
          sx={{ minWidth: 120 }}
        >
          {isProcessing ? <CircularProgress size={20} /> : 'Reject'}
        </Button>
        
        <Button
          onClick={handleApprove}
          color="primary"
          variant="contained"
          disabled={isProcessing}
          startIcon={<Check />}
          sx={{ minWidth: 120 }}
        >
          {isProcessing ? <CircularProgress size={20} /> : 'Accept'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FileSharingApprovalDialog;