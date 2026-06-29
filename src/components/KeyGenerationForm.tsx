import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  Box,
  CircularProgress,
  Divider,
  Collapse,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import { Fingerprint, VpnKey, ExpandMore, ExpandLess, Usb as UsbIcon, Lock } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { type UserProfile } from '../firestore';
import PasswordStrengthIndicator from './PasswordStrengthIndicator';
import PassphraseRequirements from './PassphraseRequirements';
import { getHardwareKeyCapabilities } from '../utils/hardwareKeyAuth';

interface KeyGenerationFormProps {
  userProfile: UserProfile | null;
  displayName: string;
  passphrase: string;
  confirmPassphrase: string;
  error: string | null;
  loading?: boolean;
  onDisplayNameChange: (name: string) => void;
  onPassphraseChange: (passphrase: string) => void;
  onConfirmPassphraseChange: (confirmPassphrase: string) => void;
  // authenticatorType: false = passphrase only, 'platform' = device biometrics, 'cross-platform' = YubiKey etc.
  onGenerateKeys: (authenticatorType: false | 'platform' | 'cross-platform') => void;
}

const KeyGenerationForm: React.FC<KeyGenerationFormProps> = ({
  userProfile,
  displayName,
  passphrase,
  confirmPassphrase,
  error,
  loading = false,
  onDisplayNameChange,
  onPassphraseChange,
  onConfirmPassphraseChange,
  onGenerateKeys,
}) => {
  const { t } = useTranslation();
  const [platformAvailable, setPlatformAvailable] = useState<boolean | null>(null);
  const [crossPlatformAvailable, setCrossPlatformAvailable] = useState(false);
  const [setupDeviceUnlock, setSetupDeviceUnlock] = useState(false);
  const [deviceUnlockType, setDeviceUnlockType] = useState<'platform' | 'cross-platform'>('platform');
  const [showDeviceOptions, setShowDeviceOptions] = useState(false);

  const isRegeneration = !!(userProfile?.publicKey || userProfile?.encryptedPrivateKey);
  const hasAnyHardwareOption = !!(platformAvailable || crossPlatformAvailable);

  useEffect(() => {
    getHardwareKeyCapabilities().then(caps => {
      setPlatformAvailable(caps.platformAuthenticator);
      setCrossPlatformAvailable(caps.crossPlatformAuthenticator);
      // Default device unlock type to platform if available, otherwise cross-platform
      if (!caps.platformAuthenticator && caps.crossPlatformAuthenticator) {
        setDeviceUnlockType('cross-platform');
      }
    }).catch(() => {
      setPlatformAvailable(false);
      setCrossPlatformAvailable(false);
    });
  }, []);

  const handleGenerate = () => {
    if (setupDeviceUnlock) {
      onGenerateKeys(deviceUnlockType);
    } else {
      onGenerateKeys(false);
    }
  };

  // Still detecting capabilities
  if (platformAvailable === null) {
    return (
      <Container component="main" maxWidth="sm">
        <Paper elevation={3} sx={{ p: { xs: 2, sm: 4 }, mt: { xs: 4, sm: 8 }, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <CircularProgress size={32} />
          <Typography variant="body2" color="text.secondary">Checking your device…</Typography>
        </Paper>
      </Container>
    );
  }

  return (
    <Container component="main" maxWidth="sm">
      <Paper elevation={3} sx={{ p: { xs: 2, sm: 4 }, mt: { xs: 4, sm: 8 }, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        <Typography component="h1" variant="h5" gutterBottom>
          {isRegeneration
            ? t('profile.regenerateKeyPair', 'Regenerate Your Secure Key Pair')
            : t('profile.secureYourAccount', 'Secure Your Account')}
        </Typography>

        <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
          {t('profile.setupIntro', 'Your files are end-to-end encrypted. Only you can access them.')}
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2, width: '100%' }}>{error}</Alert>}

        {/* ── Step 1: Name ── */}
        <Box sx={{ width: '100%', mb: 2 }}>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            {t('profile.step1Name', 'Step 1 — Your Name')}
          </Typography>
          <TextField
            required
            fullWidth
            id="displayName"
            label={t('profile.displayName', 'Your Name')}
            name="displayName"
            autoFocus
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
          />
        </Box>

        <Divider sx={{ width: '100%', mb: 3 }} />

        {/* ── Step 2: Passphrase ── */}
        <Box sx={{ width: '100%', mb: 2 }}>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            {t('profile.step2Passphrase', 'Step 2 — Create a Recovery Passphrase')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('profile.passphraseExplain', 'This passphrase protects your files. It\'s your master key — the only way to recover access if you get a new device or lose your other unlock methods. Write it down and keep it somewhere safe.')}
          </Typography>

          <TextField
            required
            fullWidth
            margin="dense"
            name="passphrase"
            label={t('profile.passphrase', 'Recovery Passphrase')}
            type="password"
            id="passphrase"
            value={passphrase}
            onChange={(e) => onPassphraseChange(e.target.value)}
            helperText={t('profile.passphraseHelperText', 'At least 10 characters — e.g. "myfamilyvacation2024"')}
          />
          {passphrase && <PasswordStrengthIndicator password={passphrase} label={t('profile.passphraseStrength', 'Passphrase Strength')} />}
          {passphrase && <PassphraseRequirements passphrase={passphrase} />}
          <TextField
            required
            fullWidth
            margin="dense"
            name="confirmPassphrase"
            label={t('profile.confirmPassphrase', 'Confirm Passphrase')}
            type="password"
            id="confirmPassphrase"
            value={confirmPassphrase}
            onChange={(e) => onConfirmPassphraseChange(e.target.value)}
          />
        </Box>

        {/* ── Step 3: Convenient unlock (optional, only if hardware available) ── */}
        {hasAnyHardwareOption && (
          <>
            <Divider sx={{ width: '100%', mb: 3 }} />

            <Box sx={{ width: '100%' }}>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                {t('profile.step3Unlock', 'Step 3 — Convenient Unlock (Optional)')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t('profile.deviceUnlockExplain', 'Instead of typing your passphrase every time, you can unlock with your fingerprint, face scan, or device PIN. You can also set this up later in Profile → Security.')}
              </Typography>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={setupDeviceUnlock}
                    onChange={(e) => setSetupDeviceUnlock(e.target.checked)}
                  />
                }
                label={
                  <Typography variant="body2">
                    {t('profile.setUpDeviceUnlockNow', 'Set up convenient unlock on this device now')}
                  </Typography>
                }
              />

              <Collapse in={setupDeviceUnlock}>
                <Box sx={{ mt: 1.5, ml: 4 }}>
                  {/* Only show type choice if both options are available */}
                  {platformAvailable && crossPlatformAvailable && (
                    <>
                      <Box
                        onClick={() => setDeviceUnlockType('platform')}
                        sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1.5, mb: 1, border: '1px solid', borderColor: deviceUnlockType === 'platform' ? 'primary.main' : 'divider', borderRadius: 1, cursor: 'pointer', bgcolor: deviceUnlockType === 'platform' ? 'action.selected' : 'transparent' }}
                      >
                        <Fingerprint color={deviceUnlockType === 'platform' ? 'primary' : 'action'} sx={{ mt: 0.25 }} />
                        <Box>
                          <Typography variant="body2" fontWeight="medium">
                            {t('profile.fingerprintFacePin', 'Fingerprint, Face, or Device PIN')}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {t('profile.builtInDesc', 'Uses your device\'s built-in security — no extra hardware needed')}
                          </Typography>
                        </Box>
                      </Box>
                      <Box
                        onClick={() => setDeviceUnlockType('cross-platform')}
                        sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1.5, border: '1px solid', borderColor: deviceUnlockType === 'cross-platform' ? 'primary.main' : 'divider', borderRadius: 1, cursor: 'pointer', bgcolor: deviceUnlockType === 'cross-platform' ? 'action.selected' : 'transparent' }}
                      >
                        <UsbIcon color={deviceUnlockType === 'cross-platform' ? 'primary' : 'action'} sx={{ mt: 0.25 }} />
                        <Box>
                          <Typography variant="body2" fontWeight="medium">
                            {t('profile.physicalSecurityKey', 'Physical Security Key (YubiKey, etc.)')}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {t('profile.yubiKeyDesc', 'Plug in your security key and touch it to unlock')}
                          </Typography>
                        </Box>
                      </Box>
                    </>
                  )}

                  {/* Only platform available */}
                  {platformAvailable && !crossPlatformAvailable && (
                    <Alert severity="info" icon={<Fingerprint />}>
                      <Typography variant="body2">
                        {t('profile.willUseDeviceBiometrics', 'Your browser will prompt you to verify with your fingerprint, face, or device PIN.')}
                      </Typography>
                    </Alert>
                  )}

                  {/* Only cross-platform available */}
                  {!platformAvailable && crossPlatformAvailable && (
                    <Alert severity="info" icon={<UsbIcon />}>
                      <Typography variant="body2">
                        {t('profile.willUseSecurityKey', 'Make sure your security key is plugged in. Your browser will ask you to touch it.')}
                      </Typography>
                    </Alert>
                  )}
                </Box>
              </Collapse>
            </Box>
          </>
        )}

        <Divider sx={{ width: '100%', my: 3 }} />

        <Button
          type="submit"
          fullWidth
          variant="contained"
          size="large"
          onClick={handleGenerate}
          disabled={loading || !displayName.trim()}
          startIcon={loading
            ? <CircularProgress size={20} color="inherit" />
            : setupDeviceUnlock
              ? deviceUnlockType === 'platform' ? <Fingerprint /> : <UsbIcon />
              : <Lock />}
        >
          {loading
            ? t('profile.settingUp', 'Setting up…')
            : t('profile.createMyAccount', 'Create My Account')}
        </Button>

      </Paper>
    </Container>
  );
};

export default KeyGenerationForm;
