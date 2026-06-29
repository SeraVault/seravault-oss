import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  Chip,
  Divider,
} from '@mui/material';
import {
  Fingerprint,
  Security,
  PhoneAndroid,
  Warning,
  CheckCircle,
} from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import {
  getBiometricCapabilities,
  registerBiometric,
  storeBiometricEncryptedKey,
  hasBiometricSetup,
  removeBiometricSetup,
  storeBiometricCredential,
  probePrfSupport,
} from '../utils/biometricAuth';
import { unlockWithBiometric } from '../services/unlockOrchestrator';

const BiometricSetup: React.FC = () => {
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const { t } = useTranslation();
  const [available, setAvailable] = useState(false);
  const [capabilities, setCapabilities] = useState<{
    available: boolean;
    type: string;
    supportsResidentKeys: boolean;
  }>({ available: false, type: 'none', supportsResidentKeys: false });
  const [isSetup, setIsSetup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [prfSupport, setPrfSupport] = useState<'supported' | 'unsupported' | 'unknown'>('unknown');

  useEffect(() => {
    const checkBiometricSupport = async () => {
      try {
        const caps = await getBiometricCapabilities();
        setCapabilities(caps);
        setAvailable(caps.available);
        setPrfSupport(await probePrfSupport());

        if (user) {
          setIsSetup(await hasBiometricSetup(user.uid));
        }
      } catch (err) {
        console.error('Error checking biometric support:', err);
        setAvailable(false);
      }
    };

    checkBiometricSupport();
  }, [user]);

  const handleSetupBiometric = async () => {
    if (!user || !privateKey) {
      setError('User must be logged in with private key unlocked');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Register biometric credential. On modern browsers (Chrome 132+,
      // Safari 18+, Firefox 135+) the PRF output is returned from create()
      // directly, allowing setup to complete in a single biometric prompt.
      const { credentialId, prfOutput } = await registerBiometric(
        user.uid,
        // WebAuthn `user.name` — canonical account identifier (email preferred).
        user.email || user.uid,
        // WebAuthn `user.displayName` — human-friendly label.
        user.displayName || user.email || 'SeraVault user'
      );

      // Store credential ID (public identifier, not a secret)
      storeBiometricCredential(user.uid, credentialId);

      // Encrypt the private key with the PRF output. If the browser didn't
      // return one at registration, storeBiometricEncryptedKey will fall
      // back to a second WebAuthn prompt.
      await storeBiometricEncryptedKey(privateKey, credentialId, user.uid, prfOutput);

      setIsSetup(true);
      setSuccess('Biometric authentication set up! Your key is now bound to this device\'s secure enclave.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set up biometric authentication');
      console.error('Biometric setup error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveBiometric = async () => {
    if (!user) return;

    try {
      await removeBiometricSetup(user.uid);
      setIsSetup(false);
      setSuccess('Biometric authentication removed successfully');
      setError('');
    } catch (err) {
      setError('Failed to remove biometric authentication');
    }
  };

  const handleTestBiometric = async () => {
    if (!user) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const unlockedPrivateKey = await unlockWithBiometric(user.uid, { interactive: true });
      if (privateKey && unlockedPrivateKey !== privateKey) {
        throw new Error('Biometric authentication succeeded, but key verification failed. Please re-register biometric unlock.');
      }
      setSuccess('Biometric authentication test successful!');
    } catch (err) {
      setError(`Biometric test failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Don't show the component at all if biometrics aren't available
  if (!available) {
    return null;
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Fingerprint color={isSetup ? 'success' : 'primary'} />
          <Typography variant="h6">
            {t('profile.biometricAuthenticationTitle', 'Biometric Authentication')}
          </Typography>
          {isSetup && <Chip icon={<CheckCircle />} label={t('profile.biometricEnabled', 'Enabled')} color="success" size="small" />}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <PhoneAndroid fontSize="small" />
          <Typography variant="body2" color="text.secondary">
            {capabilities.type} • {t('profile.platformAuthenticatorAvailable', 'Platform authenticator available')}
          </Typography>
        </Box>

        <Typography variant="body2" sx={{ mb: 2 }}>
          {t('profile.biometricDescription', 'Use your device\'s biometric authentication (fingerprint, Face ID, Windows Hello, etc.) to quickly unlock your private key instead of entering your passphrase every time.')}
        </Typography>

        <Alert severity="info" sx={{ mb: 3 }}>
          {t('profile.biometricHardwareNote', 'Note: Requires actual biometric hardware (fingerprint reader, face recognition camera, etc.). If your device only has PIN/password authentication, this feature won\'t work.')}
        </Alert>

        {prfSupport === 'unsupported' && !isSetup && (
          <Alert severity="warning" sx={{ mb: 2 }} icon={<Warning />}>
            <Typography variant="body2" component="div">
              <strong>This browser can&rsquo;t securely store an encryption key behind your fingerprint.</strong>
              <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2.5 }}>
                <li><strong>Android:</strong> update Chrome and Android System WebView (both must be 132+) from the Play Store, then reinstall this app from your home screen.</li>
                <li><strong>iOS / iPadOS:</strong> update to iOS 17.4 or newer.</li>
                <li><strong>Hardware key (YubiKey 5, etc.):</strong> works today on every browser &mdash; set one up under &ldquo;Hardware Keys&rdquo;.</li>
                <li><strong>Passphrase</strong> always works as a fallback.</li>
              </Box>
            </Typography>
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}

        {!privateKey && !isSetup && (
          <Alert severity="warning" sx={{ mb: 2 }} icon={<Warning />}>
            Your private key must be unlocked (enter your passphrase first) before setting up biometric authentication.
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {!isSetup ? (
            <Button
              variant="contained"
              startIcon={<Security />}
              onClick={handleSetupBiometric}
              disabled={loading || !privateKey || prfSupport === 'unsupported'}
              sx={{ minWidth: '160px' }}
            >
              {loading ? t('biometric.settingUp', 'Setting up...') : t('biometric.setupAuth', 'Setup Biometric Auth')}
            </Button>
          ) : (
            <>
              <Button
                variant="outlined"
                startIcon={<Fingerprint />}
                onClick={handleTestBiometric}
                disabled={loading}
              >
                {loading ? t('biometric.testing', 'Testing...') : t('biometric.testAuth', 'Test Biometric')}
              </Button>
              <Button
                variant="outlined"
                color="error"
                onClick={handleRemoveBiometric}
                disabled={loading}
              >
                {t('biometric.removeAuth', 'Remove Biometric')}
              </Button>
            </>
          )}
        </Box>

        {isSetup && (
          <>
            <Divider sx={{ my: 2 }} />
            <Alert severity="info">
              <Typography variant="body2">
                <strong>{t('profile.securityNote', 'Security Note:')}</strong> {t('profile.biometricSecurityNote', 'Your private key is encrypted with your biometric data and stored locally. Biometric authentication only works on this device and cannot be transferred to other devices.')}
              </Typography>
            </Alert>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default BiometricSetup;