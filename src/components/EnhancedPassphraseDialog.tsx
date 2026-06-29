import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControlLabel,
  Checkbox,
  Alert,
  Typography,
  Box,
} from '@mui/material';
import { Security, Timer } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface EnhancedPassphraseDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (passphrase: string, rememberChoice: boolean) => Promise<void>;
}

const EnhancedPassphraseDialog: React.FC<EnhancedPassphraseDialogProps> = ({
  open,
  onClose,
  onSubmit,
}) => {
  const navigate = useNavigate();
  const [passphrase, setPassphrase] = useState('');
  const [rememberChoice, setRememberChoice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsKeyRegeneration, setNeedsKeyRegeneration] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!passphrase.trim()) {
      setError('Please enter your passphrase');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onSubmit(passphrase, rememberChoice);
      setPassphrase('');
      setRememberChoice(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Incorrect passphrase. Please try again.';
      if (errorMessage.includes('No encrypted private key found')) {
        setError('Your account needs key regeneration. Please visit your Profile page to create new secure keys.');
        setNeedsKeyRegeneration(true);
      } else {
        setError('Incorrect passphrase. Please try again.');
        setNeedsKeyRegeneration(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !loading) {
      handleSubmit();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Security />
          Enter Your Passphrase
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Your passphrase is required to decrypt your private key and access your encrypted files.
        </Typography>
        
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        <TextField
          autoFocus
          margin="dense"
          label="Passphrase"
          type="password"
          fullWidth
          variant="outlined"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={loading}
        />
        
        <FormControlLabel
          control={
            <Checkbox
              checked={rememberChoice}
              onChange={(e) => setRememberChoice(e.target.checked)}
              disabled={loading}
            />
          }
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Timer fontSize="small" />
              <Typography variant="body2">
                Keep unlocked longer (1 hour vs 15 minutes)
              </Typography>
            </Box>
          }
          sx={{ mt: 2 }}
        />
        
        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Security Note:</strong> Your decrypted private key will be stored securely in memory only. 
            It will be automatically cleared when you close the browser, switch tabs for extended periods, 
            or after the timeout expires.
          </Typography>
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        {needsKeyRegeneration ? (
          <Button 
            onClick={() => {
              onClose();
              navigate('/profile');
            }}
            variant="contained"
            color="warning"
            disabled={loading}
          >
            Go to Profile
          </Button>
        ) : (
          <Button 
            onClick={handleSubmit} 
            variant="contained" 
            disabled={loading || !passphrase.trim()}
          >
            {loading ? 'Decrypting...' : 'Unlock'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default EnhancedPassphraseDialog;