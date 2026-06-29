import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert,
  Box,
  Typography,
  IconButton,
  InputAdornment,
} from '@mui/material';
import { Visibility, VisibilityOff, Key } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import PasswordStrengthIndicator from './PasswordStrengthIndicator';
import PassphraseRequirements from './PassphraseRequirements';
import { AUTH_CONFIG } from '../constants/authConfig';
import { reencryptPrivateKey } from '../services/keyManagement';
import { usePassphrase } from '../auth/PassphraseContext';
import { backendService } from '../backend/BackendService';

interface ChangePassphraseDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const ChangePassphraseDialog: React.FC<ChangePassphraseDialogProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const user = backendService.auth.getCurrentUser();
  const { setPrivateKey } = usePassphrase();

  const [currentPassphrase, setCurrentPassphrase] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmNewPassphrase, setConfirmNewPassphrase] = useState('');

  const [showCurrentPassphrase, setShowCurrentPassphrase] = useState(false);
  const [showNewPassphrase, setShowNewPassphrase] = useState(false);
  const [showConfirmPassphrase, setShowConfirmPassphrase] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    if (loading) return;
    setCurrentPassphrase('');
    setNewPassphrase('');
    setConfirmNewPassphrase('');
    setError(null);
    setShowCurrentPassphrase(false);
    setShowNewPassphrase(false);
    setShowConfirmPassphrase(false);
    onClose();
  };

  const handleChangePassphrase = async () => {
    if (!user) {
      setError('No user logged in');
      return;
    }

    if (!currentPassphrase) {
      setError(t('passphrase.errorEnterCurrent', 'Please enter your current passphrase'));
      return;
    }

    if (!newPassphrase) {
      setError(t('passphrase.errorEnterNew', 'Please enter a new passphrase'));
      return;
    }

    if (newPassphrase.length < AUTH_CONFIG.passphrase.minLength) {
      setError(t('passphrase.errorTooShort', 'New passphrase must be at least {{min}} characters long', { min: AUTH_CONFIG.passphrase.minLength }));
      return;
    }

    if (newPassphrase !== confirmNewPassphrase) {
      setError(t('passphrase.errorMismatch', 'New passphrases do not match'));
      return;
    }

    if (currentPassphrase === newPassphrase) {
      setError(t('passphrase.errorSameAsOld', 'New passphrase must be different from current passphrase'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Decrypt with current passphrase (Argon2id off-thread), re-encrypt with new,
      // verify round-trip, then persist — all centralized in reencryptPrivateKey.
      const privateKeyHex = await reencryptPrivateKey(user.uid, currentPassphrase, newPassphrase);

      // Keep the in-memory session valid with the already-decrypted key
      setPrivateKey(privateKeyHex);

      handleClose();
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('passphrase.errorChangeFailed', 'Failed to change passphrase. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleChangePassphrase();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Key />
          <Typography variant="h6">{t('passphrase.changeTitle', 'Change Passphrase')}</Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        {loading && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {t('passphrase.processing', 'Processing — this may take a few seconds...')}
            </Typography>
          </Box>
        )}

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {t('passphrase.changeDescription', 'Change the passphrase used to encrypt your private key. You will need the new passphrase the next time you unlock your vault.')}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          fullWidth
          label={t('passphrase.currentPassphrase', 'Current Passphrase')}
          type={showCurrentPassphrase ? 'text' : 'password'}
          value={currentPassphrase}
          onChange={(e) => setCurrentPassphrase(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          autoFocus
          sx={{ mb: 2 }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={() => setShowCurrentPassphrase(!showCurrentPassphrase)} edge="end" disabled={loading}>
                  {showCurrentPassphrase ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        <TextField
          fullWidth
          label={t('passphrase.newPassphrase', 'New Passphrase')}
          type={showNewPassphrase ? 'text' : 'password'}
          value={newPassphrase}
          onChange={(e) => setNewPassphrase(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          helperText={t('passphrase.newPassphraseHelper', 'At least {{min}} characters', { min: AUTH_CONFIG.passphrase.minLength })}
          sx={{ mb: 2 }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={() => setShowNewPassphrase(!showNewPassphrase)} edge="end" disabled={loading}>
                  {showNewPassphrase ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        <PasswordStrengthIndicator password={newPassphrase} label={t('passphrase.newPassphraseStrength', 'New Passphrase Strength')} />
        <PassphraseRequirements passphrase={newPassphrase} />

        <TextField
          fullWidth
          label={t('passphrase.confirmNewPassphrase', 'Confirm New Passphrase')}
          type={showConfirmPassphrase ? 'text' : 'password'}
          value={confirmNewPassphrase}
          onChange={(e) => setConfirmNewPassphrase(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={() => setShowConfirmPassphrase(!showConfirmPassphrase)} edge="end" disabled={loading}>
                  {showConfirmPassphrase ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button
          onClick={handleChangePassphrase}
          variant="contained"
          disabled={loading || !currentPassphrase || !newPassphrase || !confirmNewPassphrase}
        >
          {loading
            ? t('passphrase.changing', 'Changing...')
            : t('passphrase.changeAction', 'Change Passphrase')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ChangePassphraseDialog;
