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
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
  FormControlLabel,
  CircularProgress,
} from '@mui/material';
import {
  Warning,
  Security,
  Error as ErrorIcon,
  CheckCircle,
} from '@mui/icons-material';

interface RemovePassphraseKeyDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  hardwareKeyCount: number;
  authenticatorType: 'cross-platform' | 'platform';
}

const RemovePassphraseKeyDialog: React.FC<RemovePassphraseKeyDialogProps> = ({
  open,
  onClose,
  onConfirm,
  hardwareKeyCount,
  authenticatorType,
}) => {
  const [understand1, setUnderstand1] = useState(false);
  const [understand2, setUnderstand2] = useState(false);
  const [understand3, setUnderstand3] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keyTypeName = authenticatorType === 'cross-platform' ? 'hardware key' : 'passkey';
  const allChecked = understand1 && understand2 && understand3;

  const handleConfirm = async () => {
    setProcessing(true);
    setError(null);
    try {
      await onConfirm();
      // Reset state
      setUnderstand1(false);
      setUnderstand2(false);
      setUnderstand3(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove passphrase-protected key');
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = () => {
    if (!processing) {
      setUnderstand1(false);
      setUnderstand2(false);
      setUnderstand3(false);
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <Warning color="warning" />
          <span>Remove Passphrase-Protected Private Key?</span>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2" fontWeight="bold" gutterBottom>
            You are about to remove the passphrase-protected copy of your private key from our servers.
          </Typography>
          <Typography variant="body2">
            Your private key will ONLY exist in your {keyTypeName}. This is the most secure option, but comes with significant risks.
          </Typography>
        </Alert>

        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ErrorIcon color="error" />
          Critical Warnings
        </Typography>

        <List dense>
          <ListItem>
            <ListItemIcon>
              <ErrorIcon color="error" />
            </ListItemIcon>
            <ListItemText
              primary={`If your ${keyTypeName} is lost or damaged, you CANNOT recover your data`}
              secondary="There will be no way to decrypt your files without the hardware key"
            />
          </ListItem>

          <ListItem>
            <ListItemIcon>
              <ErrorIcon color="error" />
            </ListItemIcon>
            <ListItemText
              primary={`If your ${keyTypeName} stops working, all your encrypted data becomes inaccessible`}
              secondary="Hardware failures, water damage, or physical loss means permanent data loss"
            />
          </ListItem>

          <ListItem>
            <ListItemIcon>
              <ErrorIcon color="error" />
            </ListItemIcon>
            <ListItemText
              primary="No customer support can help you recover access"
              secondary="Even we cannot decrypt your files without your private key"
            />
          </ListItem>
        </List>

        <Alert severity="info" sx={{ my: 3 }}>
          <Typography variant="body2" fontWeight="bold" gutterBottom>
            <Security sx={{ fontSize: 16, verticalAlign: 'middle', mr: 0.5 }} />
            Strongly Recommended: Register Multiple Hardware Keys
          </Typography>
          <Typography variant="body2" component="ul" sx={{ mt: 1, pl: 2, mb: 0 }}>
            <li><strong>Register at least 2-3 hardware keys</strong> before removing the passphrase-protected key</li>
            <li>Keep backup keys in separate secure locations (home safe, bank deposit box, trusted family member)</li>
            <li>Test each key before removing the passphrase protection</li>
            <li>Consider keeping one key as a daily driver and others as backups</li>
          </Typography>
        </Alert>

        {hardwareKeyCount < 2 && (
          <Alert severity="error" sx={{ mb: 3 }}>
            <Typography variant="body2" fontWeight="bold">
              ⚠️ You currently have only {hardwareKeyCount} {keyTypeName} registered!
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              We <strong>strongly recommend</strong> registering at least one more backup key before removing passphrase protection.
              A single key creates a single point of failure.
            </Typography>
          </Alert>
        )}

        <Box sx={{ my: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Please confirm you understand the risks:
          </Typography>
          
          <FormControlLabel
            control={
              <Checkbox
                checked={understand1}
                onChange={(e) => setUnderstand1(e.target.checked)}
                disabled={processing}
              />
            }
            label={
              <Typography variant="body2">
                I understand that losing my {keyTypeName} means <strong>permanent loss of all my encrypted data</strong>
              </Typography>
            }
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={understand2}
                onChange={(e) => setUnderstand2(e.target.checked)}
                disabled={processing}
              />
            }
            label={
              <Typography variant="body2">
                I have registered <strong>multiple backup hardware keys</strong> OR I accept the risk of using a single key
              </Typography>
            }
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={understand3}
                onChange={(e) => setUnderstand3(e.target.checked)}
                disabled={processing}
              />
            }
            label={
              <Typography variant="body2">
                I understand that <strong>no one can help me recover my data</strong> if I lose access to my {keyTypeName}
              </Typography>
            }
          />
        </Box>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        <Alert severity="success" icon={<CheckCircle />} sx={{ mt: 2 }}>
          <Typography variant="body2" fontWeight="bold" gutterBottom>
            Alternative: Keep Both Options
          </Typography>
          <Typography variant="body2">
            You can keep the passphrase-protected key on the server AND use your {keyTypeName} for convenience.
            This gives you both security and a recovery option.
          </Typography>
        </Alert>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button 
          onClick={handleClose}
          disabled={processing}
          variant="outlined"
        >
          Keep Passphrase Protection
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          color="error"
          onClick={handleConfirm}
          disabled={!allChecked || processing}
          startIcon={processing ? <CircularProgress size={16} /> : <Warning />}
        >
          {processing ? 'Removing...' : 'Remove Passphrase Protection'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RemovePassphraseKeyDialog;
