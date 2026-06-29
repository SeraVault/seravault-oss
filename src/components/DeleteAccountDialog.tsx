import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  TextField,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  LinearProgress,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import {
  DeleteForever,
  Storage,
  Folder,
  People,
  Chat,
  Notifications
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

interface DeleteAccountDialogProps {
  open: boolean;
  userEmail: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  progress?: {
    step: string;
    current: number;
    total: number;
  } | null;
}

const DeleteAccountDialog: React.FC<DeleteAccountDialogProps> = ({
  open,
  userEmail,
  onClose,
  onConfirm,
  progress,
}) => {
  const { t } = useTranslation();
  const [confirmationText, setConfirmationText] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfirmationValid = confirmationText === 'DELETE' && understood;

  const handleConfirm = async () => {
    if (!isConfirmationValid) return;

    setDeleting(true);
    setError(null);

    try {
      await onConfirm();
      // Dialog will be closed by parent after successful deletion
    } catch (err) {
      console.error('Error deleting account:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete account');
      setDeleting(false);
    }
  };

  const handleClose = () => {
    if (!deleting) {
      setConfirmationText('');
      setUnderstood(false);
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={deleting}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 1,
        color: 'error.main'
      }}>
        <DeleteForever />
        Delete Account Permanently
      </DialogTitle>
      
      <DialogContent>
        {deleting && progress ? (
          <Box>
            <Typography variant="body1" gutterBottom>
              Deleting your account and all associated data...
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {progress.step}
            </Typography>
            <LinearProgress 
              variant={progress.total > 0 ? "determinate" : "indeterminate"}
              value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {progress.total > 0 ? `${progress.current} of ${progress.total}` : 'Processing...'}
            </Typography>
          </Box>
        ) : (
          <>
            <Alert severity="error" sx={{ mb: 3 }}>
              <Typography variant="body2" fontWeight="bold">
                This action cannot be undone!
              </Typography>
            </Alert>

            <Typography variant="body1" gutterBottom>
              You are about to permanently delete your account:
            </Typography>
            <Typography variant="body2" fontWeight="bold" sx={{ mb: 2, ml: 2 }}>
              {userEmail}
            </Typography>

            <Typography variant="body2" gutterBottom sx={{ mb: 2 }}>
              The following data will be permanently deleted:
            </Typography>

            <List dense sx={{ mb: 3 }}>
              <ListItem>
                <ListItemIcon>
                  <Storage color="error" />
                </ListItemIcon>
                <ListItemText 
                  primary="All encrypted files and storage"
                  secondary="Files you own will be deleted forever"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <Folder color="error" />
                </ListItemIcon>
                <ListItemText 
                  primary="All folders and organization"
                  secondary="Your folder structure will be lost"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <People color="error" />
                </ListItemIcon>
                <ListItemText 
                  primary="All contacts and sharing"
                  secondary="Shared files will be unshared"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <Chat color="error" />
                </ListItemIcon>
                <ListItemText 
                  primary="All conversations and messages"
                  secondary="Your chat history will be deleted"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <Notifications color="error" />
                </ListItemIcon>
                <ListItemText 
                  primary="All notifications and settings"
                  secondary="Your preferences will be removed"
                />
              </ListItem>
            </List>

            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body2">
                <strong>Important:</strong> Files shared with you by others will remain accessible to them, 
                but you will lose access to them permanently.
              </Typography>
            </Alert>

            <FormControlLabel
              control={
                <Checkbox
                  checked={understood}
                  onChange={(e) => setUnderstood(e.target.checked)}
                  disabled={deleting}
                />
              }
              label={
                <Typography variant="body2">
                  I understand this action is permanent and cannot be undone
                </Typography>
              }
            />

            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" gutterBottom>
                To confirm, type <strong>DELETE</strong> in the box below:
              </Typography>
              <TextField
                fullWidth
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder={t('deleteAccount.typeDeleteToConfirm', 'Type DELETE to confirm')}
                disabled={deleting || !understood}
                error={confirmationText.length > 0 && confirmationText !== 'DELETE'}
                helperText={
                  confirmationText.length > 0 && confirmationText !== 'DELETE'
                    ? 'Must type exactly: DELETE'
                    : ''
                }
                sx={{ mt: 1 }}
              />
            </Box>

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button 
          onClick={handleClose} 
          disabled={deleting}
          color="inherit"
        >
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={!isConfirmationValid || deleting}
          variant="contained"
          color="error"
          startIcon={<DeleteForever />}
        >
          {deleting ? 'Deleting...' : 'Delete My Account Forever'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteAccountDialog;
