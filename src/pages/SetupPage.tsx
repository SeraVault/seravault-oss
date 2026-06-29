// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { Box, Typography, Container, CircularProgress, Alert, Stack, useTheme, useMediaQuery } from '@mui/material';
import { CheckCircleOutline } from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';
import { useProfileManagement } from '../hooks/useProfileManagement';
import { useKeyGeneration } from '../hooks/useKeyGeneration';
import { useTranslation } from 'react-i18next';
import { type UserProfile } from '../firestore';
import { useNavigate, useSearchParams } from 'react-router-dom';
import KeyGenerationForm from '../components/KeyGenerationForm';
import BiometricPassphraseDialog from '../components/BiometricPassphraseDialog';
import { usePassphrase } from '../auth/PassphraseContext';
import { backendService } from '../backend/BackendService';
import type { User } from '../backend/BackendInterface';
import { STORAGE_KEYS } from '../constants/storage-keys';

const SetupPage: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user } = useAuth();
  const navigate = useNavigate();

  // Temporary diagnostic: log UID to help debug account routing issues
  React.useEffect(() => {
    if (user) {
      console.warn('[SetupPage] Reached /setup for user:', { uid: user.uid, email: user.email });
    }
  }, [user]);
  const { t } = useTranslation();
  let paymentSuccess = false;
  const { unlockWithPassphrase, privateKey } = usePassphrase();
  const [hasExistingKeys, setHasExistingKeys] = useState<boolean | null>(null);
  const [showPassphraseDialog, setShowPassphraseDialog] = useState(false);
  const [passphraseError, setPassphraseError] = useState('');
  
  const {
    userProfile,
    loading,
    displayName,
    error,
    setUserProfile,
    setLoading,
    setDisplayName,
    setError,
    fetchProfile,
  } = useProfileManagement();

  const {
    passphrase,
    confirmPassphrase,
    setPassphrase,
    setConfirmPassphrase,
    handleGenerateKeys,
  } = useKeyGeneration();

  // Success handlers that update profile and refresh private key
  const handleKeyGenerationSuccess = async (profile: UserProfile) => {
    setUserProfile(profile);
    
    // Check for pending invitation in localStorage
    const pendingInvitation = localStorage.getItem(STORAGE_KEYS.PENDING_INVITATION);
    
    console.log('[SetupPage] Key generation success - checking pending actions:', {
      pendingInvitation,
    });


    if (pendingInvitation) {
      console.log('[SetupPage] Redirecting to contacts with invitation:', pendingInvitation);
      localStorage.removeItem(STORAGE_KEYS.PENDING_INVITATION);
      navigate('/contacts?invite=' + pendingInvitation);
    } else {
      console.log('[SetupPage] No pending actions, navigating to home (/)'); 
      // Force a small delay to ensure Firestore writes have propagated locally
      setTimeout(() => {
        console.log('[SetupPage] Executing navigation to /');
        navigate('/');
      }, 500);
    }
  };  useEffect(() => {
    if (user) {
      // Cast to unknown first to avoid type mismatch between firebase user and backend interface user
      fetchProfile(user as unknown as User);
    }
  }, [user, fetchProfile]);

  // Check if user already has encrypted keys in Firestore
  useEffect(() => {
    if (userProfile) {
      console.log('[SetupPage] Checking for existing keys:', {
        hasPublicKey: !!userProfile.publicKey,
        hasEncryptedPrivateKey: !!userProfile.encryptedPrivateKey,
        hasPrivateKeyUnlocked: !!privateKey
      });
      
      // Check if user has keys in Firestore
      const hasKeys = !!(userProfile.publicKey && userProfile.encryptedPrivateKey);
      
      if (hasKeys && !privateKey) {
        // User has keys in Firestore but not unlocked - show passphrase entry
        console.log('[SetupPage] Found existing encrypted keys - showing passphrase entry');
        setHasExistingKeys(true);
        setShowPassphraseDialog(true);
      } else if (hasKeys && privateKey) {
        // User has keys and they're already unlocked - redirect to home
        console.log('[SetupPage] Keys already unlocked - redirecting to home');
        navigate('/');
      } else {
        // User needs to generate keys
        console.log('[SetupPage] No existing keys - showing key generation');
        setHasExistingKeys(false);
      }
    }
  }, [userProfile, privateKey, navigate]);

  // If keys were just generated (no existing keys found, but now profile has keys), redirect
  useEffect(() => {
    if (userProfile?.publicKey && hasExistingKeys === false && privateKey) {
      // Keys just generated and unlocked, redirect
      console.log('[SetupPage] Keys just generated - redirecting to home');
      navigate('/');
    }
  }, [userProfile, navigate, hasExistingKeys, privateKey]);
  
  const handlePassphraseSubmit = async (passphrase: string) => {
    try {
      setPassphraseError('');
      console.log('[SetupPage] Attempting to unlock keys with passphrase');
      await unlockWithPassphrase(passphrase);
      console.log('[SetupPage] Keys unlocked successfully');
      
      // Check for pending invitation or subscription plan
      const pendingInvitation = localStorage.getItem(STORAGE_KEYS.PENDING_INVITATION);

      if (pendingInvitation) {
        console.log('[SetupPage] Redirecting to contacts with invitation:', pendingInvitation);
        localStorage.removeItem(STORAGE_KEYS.PENDING_INVITATION);
        navigate('/contacts?invite=' + pendingInvitation);
      } else {
        console.log('[SetupPage] No pending actions, navigating to home');
        navigate('/');
      }
    } catch (error) {
      console.error('[SetupPage] Failed to unlock keys:', error);
      setPassphraseError(t('setup.incorrectPassphrase', 'Incorrect passphrase. Please try again.'));
    }
  };
  
  const handlePassphraseCancel = () => {
    // User doesn't want to unlock keys right now - log them out
    console.log('[SetupPage] User cancelled passphrase entry - logging out');
    backendService.signOut().then(() => {
      navigate('/login');
    });
  };

  return (
    <Container maxWidth="md" sx={{ mt: isMobile ? 2 : 4, mb: isMobile ? 2 : 4, px: isMobile ? 1 : 3 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>

        {/* Show loading while checking for existing keys */}
        {hasExistingKeys === null ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, mt: 8 }}>
            <CircularProgress />
            <Typography variant="body1" color="text.secondary">
              {t('setup.checking', 'Checking your account...')}
            </Typography>
          </Box>
        ) : hasExistingKeys ? (
          /* User has existing keys - show passphrase entry */
          <>
            <Typography variant={isMobile ? 'h5' : 'h4'} component="h1" gutterBottom>
            </Typography>
            
            <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4 }}>
              {t('setup.enterPassphrase', 'Enter your passphrase to unlock your encryption keys.')}
            </Typography>

            {passphraseError && (
              <Typography variant="body2" color="error" align="center">
                {passphraseError}
              </Typography>
            )}

            <BiometricPassphraseDialog
              open={showPassphraseDialog}
              onClose={handlePassphraseCancel}
              onSubmit={handlePassphraseSubmit}
              title={t('setup.unlockKeys', 'Unlock Your Keys')}
              subtitle={t('setup.unlockSubtitle', 'Enter your passphrase to access your encrypted data')}
            />
          </>
        ) : (
          /* User needs to generate keys */
          <>
            <Typography variant="h4" component="h1" gutterBottom>
              {paymentSuccess 
                ? t('setup.titleAfterPayment', 'Almost Done! Secure Your Account')
                : t('setup.title', 'Welcome to Seravault')
              }
            </Typography>
            
            <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4 }}>
              {paymentSuccess
                ? t('setup.subtitleAfterPayment', 'Create a master passphrase to protect your encryption keys. This passphrase is never stored on our servers.')
                : t('setup.subtitle', 'Let\'s set up your secure encryption keys to protect your data.')
              }
            </Typography>

            <KeyGenerationForm
              userProfile={userProfile}
              displayName={displayName}
              passphrase={passphrase}
              confirmPassphrase={confirmPassphrase}
              error={error}
              loading={loading}
              onDisplayNameChange={setDisplayName}
              onPassphraseChange={setPassphrase}
              onConfirmPassphraseChange={setConfirmPassphrase}
              onGenerateKeys={(authenticatorType) => {
                return handleGenerateKeys(
                  user as unknown as User,
                  displayName,
                  handleKeyGenerationSuccess,
                  setError,
                  setLoading,
                  authenticatorType
                );
              }}
            />
          </>
        )}
      </Box>
    </Container>
  );
};

export default SetupPage;
