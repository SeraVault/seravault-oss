import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { validatePassphraseComplexity } from '../utils/passwordStrength';
import PassphraseRequirements from './PassphraseRequirements';
import {
  Box,
  Typography,
  Button,
  Alert,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,

} from '@mui/material';
import {
  VpnKey,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Security,
  Usb as UsbIcon,
  Nfc as NfcIcon,
  Bluetooth as BluetoothIcon,
  CheckCircle,

  Fingerprint,
} from '@mui/icons-material';

import RemovePassphraseKeyDialog from './RemovePassphraseKeyDialog';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import {
  getHardwareKeyCapabilities,
  registerHardwareKey,
  getRegisteredHardwareKeys,
  removeHardwareKey,
  updateHardwareKeyNickname,
  getAuthenticatorName,
  storePrivateKeyInHardware,
  type HardwareKeyCredential,
} from '../utils/hardwareKeyAuth';

interface HardwareKeySetupProps {
  onEncryptedKeyChange?: () => void;
}

const HardwareKeySetup: React.FC<HardwareKeySetupProps> = ({ onEncryptedKeyChange }) => {
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const { t } = useTranslation();
  const [capabilities, setCapabilities] = useState<{
    supported: boolean;
    platformAuthenticator: boolean;
    crossPlatformAuthenticator: boolean;
    conditionalMediation: boolean;
  } | null>(null);
  const [registeredKeys, setRegisteredKeys] = useState<HardwareKeyCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasEncryptedKey, setHasEncryptedKey] = useState(false);
  
  // Dialog states
  const [nicknameDialogOpen, setNicknameDialogOpen] = useState(false);
  const [newKeyNickname, setNewKeyNickname] = useState('');
  const [removePassphraseKeyDialogOpen, setRemovePassphraseKeyDialogOpen] = useState(false);
  const [restorePassphraseKeyDialogOpen, setRestorePassphraseKeyDialogOpen] = useState(false);
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmNewPassphrase, setConfirmNewPassphrase] = useState('');
  const [authenticatorType, setAuthenticatorType] = useState<'cross-platform' | 'platform'>('cross-platform');

  const [editingKey, setEditingKey] = useState<HardwareKeyCredential | null>(null);
  const [editNickname, setEditNickname] = useState('');

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const caps = await getHardwareKeyCapabilities();
        setCapabilities(caps);

        if (user) {
          const keys = await getRegisteredHardwareKeys(user.uid);
          setRegisteredKeys(keys);
          
          // Check if user has encrypted private key
          const { backendService } = await import('../backend/BackendService');
          const userData = await backendService.documents.get('users', user.uid);
          const hasKey = !!(userData?.encryptedPrivateKey?.ciphertext);
          setHasEncryptedKey(hasKey);
        }
      } catch (err) {
        setError('Failed to load hardware key settings');
        console.error('Error loading hardware keys:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, privateKey]);

  const handleRegisterKey = async () => {
    if (!user) return;

    setRegistering(true);
    setError(null);
    setSuccess(null);

    try {
      const nickname = newKeyNickname.trim() || undefined;
      const { keyData: newKey, signature, prfOutput } = await registerHardwareKey(user.uid, user.email || '', nickname, authenticatorType);
      
      // Always store private key in hardware if available
      if (privateKey) {
        try {
          // Pass the signature to avoid double-prompting; isPlatform routes to PRF/Firestore.
          // Also pass prfOutput if the authenticator returned it during creation (Chrome 132+):
          // this lets storeBiometricEncryptedKey skip the second credentials.get() call that
          // would otherwise open Chrome's "Passkeys & Security Keys" dialog a second time.
          const isPlatform = authenticatorType === 'platform';
          await storePrivateKeyInHardware(newKey.id, privateKey, user.uid, signature, isPlatform, prfOutput);
          newKey.storesPrivateKey = true;
          const authTypeLabel = authenticatorType === 'cross-platform' ? 'Hardware key' : 'Passkey';
          
          // Add the new key to the list immediately
          setRegisteredKeys([...registeredKeys, newKey]);
          setNicknameDialogOpen(false);
          setNewKeyNickname('');
          setAuthenticatorType('cross-platform');
          
          setSuccess(`${authTypeLabel} registered and private key stored securely!`);
        } catch (storeError) {
          // Key registered but private key storage failed
          const authTypeLabel = authenticatorType === 'cross-platform' ? 'Hardware key' : 'Passkey';
          setError(`${authTypeLabel} registered, but failed to store private key. You will still need to enter your passphrase.`);
          console.error('Failed to store private key:', storeError);
          setRegisteredKeys([...registeredKeys, newKey]);
          setNicknameDialogOpen(false);
        }
      } else {
        const authTypeLabel = authenticatorType === 'cross-platform' ? 'Hardware security key' : 'Passkey';
        setSuccess(`${authTypeLabel} registered successfully!`);
        setRegisteredKeys([...registeredKeys, newKey]);
        setNicknameDialogOpen(false);
        setNewKeyNickname('');
        setAuthenticatorType('cross-platform');
      }
    } catch (err) {
      let errorMessage = err instanceof Error ? err.message : 'Failed to register authentication method';
      
      // Add helpful context for common WebAuthn errors
      if (errorMessage.includes('NotAllowedError') || errorMessage.includes('cancelled')) {
        errorMessage = 'Registration cancelled. Please try again and touch your security key when prompted.';
      } else if (errorMessage.includes('InvalidStateError') || errorMessage.includes('already registered')) {
        errorMessage = 'This security key is already registered. Use a different key or remove the existing one first.';
      } else if (errorMessage.includes('NotSupportedError')) {
        errorMessage = 'Your browser or device doesn\'t support this type of authentication method.';
      }
      
      // Add environment info for debugging
      import('../utils/hardwareKeyAuth').then(({ getEnvironmentDescription }) => {
        const env = getEnvironmentDescription();
        console.error('[HardwareKey] Registration failed in environment:', env);
        console.error('[HardwareKey] Error:', err);
      });
      
      setError(errorMessage);
    } finally {
      setRegistering(false);
    }
  };

  const handleRemoveKey = async (credentialId: string) => {
    if (!user) return;
    if (!confirm('Are you sure you want to remove this hardware key? You will need another authentication method to access your account.')) {
      return;
    }

    try {
      await removeHardwareKey(user.uid, credentialId);
      setRegisteredKeys(registeredKeys.filter(k => k.id !== credentialId));
      setSuccess('Hardware key removed successfully');
    } catch (error) {
      console.error('Failed to remove hardware key:', error);
      setError('Failed to remove hardware key');
    }
  };

  const handleEditNickname = (key: HardwareKeyCredential) => {
    setEditingKey(key);
    setEditNickname(key.nickname);
  };

  const handleSaveNickname = async () => {
    if (!user || !editingKey) return;

    try {
      await updateHardwareKeyNickname(user.uid, editingKey.id, editNickname);
      setRegisteredKeys(registeredKeys.map(k => 
        k.id === editingKey.id ? { ...k, nickname: editNickname } : k
      ));
      setEditingKey(null);
      setSuccess('Nickname updated successfully');
    } catch (error) {
      console.error('Failed to update nickname:', error);
      setError('Failed to update nickname');
    }
  };

  const handleRemovePassphraseKey = async () => {
    if (!user) return;
    
    try {
      // Import backendService and update user profile
      const { backendService } = await import('../backend/BackendService');
      
      await backendService.documents.update('users', user.uid, {
        encryptedPrivateKey: null,
      });
      
      setHasEncryptedKey(false);
      setSuccess('Passphrase-protected key removed. Your private key now only exists in your hardware keys!');
      onEncryptedKeyChange?.();
    } catch (error) {
      console.error('Failed to remove passphrase key:', error);
      throw new Error('Failed to remove passphrase-protected key from server');
    }
  };

  const handleRestorePassphraseKey = async () => {
    if (!user || !privateKey) {
      setError('You must be logged in and have your private key unlocked');
      return;
    }

    const validationErrors = validatePassphraseComplexity(newPassphrase);
    if (validationErrors.length > 0) {
      setError(validationErrors.join(' '));
      return;
    }

    if (newPassphrase !== confirmNewPassphrase) {
      setError('Passphrases do not match');
      return;
    }

    try {
      // Encrypt the private key with the new passphrase
      const { encryptString } = await import('../crypto/quantumSafeCrypto');
      const encryptedPrivateKey = encryptString(privateKey, newPassphrase);

      // Store in Firestore
      const { backendService } = await import('../backend/BackendService');
      
      await backendService.documents.update('users', user.uid, {
        encryptedPrivateKey: encryptedPrivateKey,
      });

      setHasEncryptedKey(true);
      setSuccess('Passphrase-protected key restored! You can now use both hardware keys and passphrase to unlock.');
      setRestorePassphraseKeyDialogOpen(false);
      setNewPassphrase('');
      setConfirmNewPassphrase('');
      onEncryptedKeyChange?.();
    } catch (error) {
      console.error('Failed to restore passphrase key:', error);
      setError('Failed to restore passphrase-protected key');
    }
  };

  const getKeyTypeIcon = (type: HardwareKeyCredential['type']) => {
    switch (type) {
      case 'usb': return <UsbIcon />;
      case 'nfc': return <NfcIcon />;
      case 'bluetooth': return <BluetoothIcon />;
      default: return <VpnKey />;
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  if (!capabilities?.supported) {
    return (
      <Alert severity="warning">
        Your browser doesn't support device unlock or security keys (WebAuthn/FIDO2). Please use a modern browser like Chrome, Firefox, Edge, or Safari.
      </Alert>
    );
  }

  return (
    <Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        <Box display="flex" gap={1} mb={2} flexWrap="wrap">
          <Chip
            icon={<CheckCircle />}
            label={t('profile.noPassphraseNeeded', 'No Passphrase Needed')}
            color="success"
            size="small"
          />
          {capabilities.platformAuthenticator && (
            <Chip
              icon={<Fingerprint />}
              label={t('profile.deviceBiometrics', 'Device Biometrics / PIN')}
              color="primary"
              size="small"
            />
          )}
          {capabilities.crossPlatformAuthenticator && (
            <Chip
              icon={<UsbIcon />}
              label={t('profile.yubiKeySupported', 'YubiKey Supported')}
              size="small"
            />
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Show info when user has both passphrase and hardware keys */}
        {hasEncryptedKey && registeredKeys.length > 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
              {t('profile.dualAuthenticationMode', '🔐 Dual Authentication Mode')}
            </Typography>
            <Typography variant="body2">
              {t('profile.dualAuthenticationDesc', 'You have both passphrase protection and hardware keys set up. You can unlock using either method. For maximum security, you can remove the passphrase-protected copy from our servers if you have multiple backup hardware keys.')}
            </Typography>
          </Alert>
        )}

        {registeredKeys.length === 0 ? (
          <Box py={1}>
            {/* Device unlock — always show, let WebAuthn handle unsupported devices */}
            <Box
                sx={{
                  p: 2.5,
                  mb: 2,
                  border: '2px solid',
                  borderColor: 'primary.main',
                  borderRadius: 2,
                  bgcolor: 'action.hover',
                }}
              >
                <Box display="flex" alignItems="center" gap={1.5} mb={1}>
                  <Fingerprint color="primary" fontSize="large" />
                  <Box>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {t('profile.unlockWithDevice', 'Unlock with This Device')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('profile.recommended', 'Recommended')}
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ mb: 2 }}>
                  {t('profile.deviceUnlockExplain', 'Use your fingerprint, face scan, or device PIN to unlock SeraVault — whatever your device uses to verify it\'s you. Your encrypted files stay protected without a separate passphrase.')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '0.8rem' }}>
                  {t('profile.deviceUnlockHow', 'How it works: SeraVault stores a copy of your encryption key on this device, locked by your OS login. Only this device can open it.')}
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<Fingerprint />}
                  onClick={() => { setAuthenticatorType('platform'); setNicknameDialogOpen(true); }}
                >
                  {t('profile.setUpDeviceUnlock', 'Set Up Device Unlock')}
                </Button>
              </Box>

            {/* Physical security key option */}
            <Box
              sx={{
                p: 2,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
              }}
            >
              <Box display="flex" alignItems="center" gap={1.5} mb={1}>
                <UsbIcon color="action" />
                <Typography variant="subtitle2">
                  {t('profile.usePhysicalKey', 'Use a Physical Security Key')}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t('profile.physicalKeyExplain', 'Have a YubiKey or similar USB/NFC security key? Plug it in to register it as your unlock method. Best for users who want a dedicated physical device separate from their computer.')}
              </Typography>
              <Button
                variant="outlined"
                startIcon={<VpnKey />}
                onClick={() => { setAuthenticatorType('cross-platform'); setNicknameDialogOpen(true); }}
              >
                {t('profile.registerSecurityKey', 'Register Security Key')}
              </Button>
            </Box>
          </Box>
        ) : (
          <>
            <Typography variant="subtitle2" gutterBottom>
              {t('profile.registeredKeys', 'Registered Keys')} ({registeredKeys.length})
            </Typography>
            <List>
              {registeredKeys.map((key) => (
                <ListItem key={key.id} divider>
                  <Box display="flex" alignItems="center" gap={2} width="100%">
                    {getKeyTypeIcon(key.type)}
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center" gap={1}>
                          <span>{key.nickname}</span>
                          {key.storesPrivateKey && (
                            <Chip 
                              label={t('profile.storesPrivateKey', 'Stores Private Key')} 
                              size="small" 
                              color="success"
                              icon={<Security />}
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        <>
                          {getAuthenticatorName(key.aaguid)}
                          {' • '}
                          Added {key.createdAt.toLocaleDateString()}
                          {' • '}
                          Last used {key.lastUsed.toLocaleDateString()}
                        </>
                      }
                    />
                  </Box>
                  <ListItemSecondaryAction>
                    <IconButton
                      edge="end"
                      aria-label="edit"
                      onClick={() => handleEditNickname(key)}
                      sx={{ mr: 1 }}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      edge="end"
                      aria-label="delete"
                      onClick={() => handleRemoveKey(key.id)}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
            <Box mt={2} display="flex" flexDirection="column" gap={1}>
              <Button
                variant="outlined"
                startIcon={<Fingerprint />}
                onClick={() => { setAuthenticatorType('platform'); setNicknameDialogOpen(true); }}
                fullWidth
              >
                {t('profile.addDeviceUnlock', 'Add Device Unlock (Fingerprint / Face / PIN)')}
              </Button>
              <Button
                variant="outlined"
                startIcon={<VpnKey />}
                onClick={() => { setAuthenticatorType('cross-platform'); setNicknameDialogOpen(true); }}
                fullWidth
              >
                {t('profile.addAnotherSecurityKey', 'Add Security Key (YubiKey etc.)')}
              </Button>
              
              {/* Show restore button when user has privateKey unlocked but no passphrase backup */}
              {!hasEncryptedKey && privateKey && (
                <Button
                  variant="outlined"
                  color="success"
                  startIcon={<Security />}
                  onClick={() => setRestorePassphraseKeyDialogOpen(true)}
                  fullWidth
                >
                  {t('profile.addPassphraseProtection', 'Add Passphrase Protection')}
                </Button>
              )}
              
              {/* Show remove button when user has both passphrase encryption AND hardware keys */}
              {hasEncryptedKey && registeredKeys.length > 0 && (
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<Security />}
                  onClick={() => setRemovePassphraseKeyDialogOpen(true)}
                  fullWidth
                >
                  {t('profile.removePassphraseProtection', 'Remove Passphrase Protection')}
                </Button>
              )}
            </Box>
          </>
        )}

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>{t('profile.howItWorks', 'How it works:')}</strong>
          </Typography>
          <Typography variant="body2" component="ul" sx={{ mt: 1, pl: 2, mb: 0 }}>
            <li>{t('profile.howItWorksStep1New', 'Your encryption key is stored on this device, locked by your device\'s built-in security (fingerprint, face, or PIN)')}</li>
            <li>{t('profile.howItWorksStep2New', 'Each time you open SeraVault, your OS verifies it\'s you — no passphrase to remember or type')}</li>
            <li>{t('profile.howItWorksStep3New', 'Your encrypted files are never at risk — even if someone steals your password, they can\'t unlock without this device')}</li>
            <li><strong>{t('profile.tip', 'Tip:')}</strong> {t('profile.howItWorksStep4New', 'Register on each device you use. Keep your passphrase written down somewhere safe as a recovery backup.')}</li>
          </Typography>
        </Alert>
      {/* Register New Key Dialog — simplified; type is pre-chosen by which button was tapped */}
      <Dialog open={nicknameDialogOpen} onClose={() => !registering && setNicknameDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            {authenticatorType === 'platform' ? <Fingerprint color="primary" /> : <UsbIcon color="action" />}
            {authenticatorType === 'platform'
              ? t('profile.setUpDeviceUnlock', 'Set Up Device Unlock')
              : t('profile.registerSecurityKey', 'Register Security Key')
            }
          </Box>
        </DialogTitle>
        <DialogContent>
          {!privateKey ? (
            <Alert severity="warning">
              <Typography variant="body2" fontWeight="bold" gutterBottom>
                {t('profile.privateKeyNotAvailable', 'Private Key Not Available')}
              </Typography>
              <Typography variant="body2">
                {t('profile.privateKeyNotAvailableDesc', 'Please enter your passphrase first to unlock your private key, then come back here to set up device unlock.')}
              </Typography>
            </Alert>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {authenticatorType === 'platform'
                  ? t('profile.deviceUnlockDialogDesc', 'Your device will prompt you for fingerprint, face scan, or PIN. After that, SeraVault will remember this device — no passphrase needed next time.')
                  : t('profile.hardwareSecurityKeyDesc', 'Insert your security key (YubiKey, etc.) and touch it when prompted.')
                }
              </Typography>
              <TextField
                autoFocus
                fullWidth
                label={t('profile.nicknameOptional', 'Nickname (optional)')}
                placeholder={authenticatorType === 'cross-platform'
                  ? t('profile.securityKeyPlaceholder', 'e.g., YubiKey 5C')
                  : t('profile.passkeyPlaceholder', 'e.g., My iPhone, Work Laptop')
                }
                value={newKeyNickname}
                onChange={(e) => setNewKeyNickname(e.target.value)}
                disabled={registering}
                helperText={t('profile.leaveEmptyAutoNaming', 'Leave empty for automatic naming')}
                sx={{ mb: 2 }}
              />
              {registering && (
                <Box display="flex" alignItems="center" gap={2} mt={1}>
                  <CircularProgress size={20} />
                  <Typography variant="body2" color="text.secondary">
                    {authenticatorType === 'cross-platform'
                      ? t('profile.pleaseTouchSecurityKey', 'Touch your security key when prompted...')
                      : t('profile.pleaseAuthenticateDevice', 'Verify with your device now...')
                    }
                  </Typography>
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setNicknameDialogOpen(false); setNewKeyNickname(''); }} disabled={registering}>
            {t('profile.cancel', 'Cancel')}
          </Button>
          {privateKey && (
            <Button
              onClick={handleRegisterKey}
              variant="contained"
              disabled={registering}
              startIcon={registering ? <CircularProgress size={16} /> : authenticatorType === 'platform' ? <Fingerprint /> : <VpnKey />}
            >
              {registering ? t('profile.registering', 'Registering...') : t('profile.setUpLabel', 'Set Up')}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Edit Nickname Dialog */}
      <Dialog open={!!editingKey} onClose={() => setEditingKey(null)}>
        <DialogTitle>{t('profile.editKeyNickname', 'Edit Key Nickname')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label={t('profile.nickname', 'Nickname')}
            value={editNickname}
            onChange={(e) => setEditNickname(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingKey(null)}>{t('profile.cancel', 'Cancel')}</Button>
          <Button onClick={handleSaveNickname} variant="contained">
            {t('profile.save', 'Save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Remove Passphrase Key Dialog */}
      <RemovePassphraseKeyDialog
        open={removePassphraseKeyDialogOpen}
        onClose={() => setRemovePassphraseKeyDialogOpen(false)}
        onConfirm={handleRemovePassphraseKey}
        hardwareKeyCount={registeredKeys.length}
        authenticatorType={authenticatorType}
      />

      {/* Restore Passphrase Key Dialog */}
      <Dialog 
        open={restorePassphraseKeyDialogOpen} 
        onClose={() => {
          setRestorePassphraseKeyDialogOpen(false);
          setNewPassphrase('');
          setConfirmNewPassphrase('');
          setError(null);
        }}
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle>{t('profile.restorePassphraseProtection', 'Restore Passphrase Protection')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('profile.restorePassphraseDesc', 'Create a passphrase to encrypt your private key. This allows you to unlock your account using either your hardware key or your passphrase.')}
          </Typography>
          
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
              {t('profile.chooseStrongPassphrase', '🔒 Choose a Strong Passphrase')}
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
              {t('profile.passphraseProtectsPrivateKey', 'Your passphrase protects your private key. Use at least 10 characters — the longer the better.')}
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.875rem', mt: 0.5 }}>
              <strong>{t('profile.examples', 'Examples:')}</strong> {t('profile.passphraseExamples', '"Coffee-Mountain-2024!", "MyDog&Spot!Runs"')}
            </Typography>
          </Alert>
          
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <TextField
            label={t('profile.newPassphrase', 'New Passphrase')}
            type="password"
            value={newPassphrase}
            onChange={(e) => setNewPassphrase(e.target.value)}
            fullWidth
            margin="normal"
            helperText={t('profile.atLeast10CharsRecommended', 'At least 10 characters recommended')}
          />
          
          {newPassphrase && <PassphraseRequirements passphrase={newPassphrase} />}
          
          <TextField
            label={t('profile.confirmPassphrase', 'Confirm Passphrase')}
            type="password"
            value={confirmNewPassphrase}
            onChange={(e) => setConfirmNewPassphrase(e.target.value)}
            fullWidth
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              setRestorePassphraseKeyDialogOpen(false);
              setNewPassphrase('');
              setConfirmNewPassphrase('');
              setError(null);
            }}
          >
            {t('profile.cancel', 'Cancel')}
          </Button>
          <Button 
            onClick={handleRestorePassphraseKey}
            variant="contained"
            color="success"
            disabled={!newPassphrase || !confirmNewPassphrase}
          >
            {t('profile.restoreProtection', 'Restore Protection')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default HardwareKeySetup;
