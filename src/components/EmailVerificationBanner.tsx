import React, { useState, useEffect } from 'react';
import { Alert, Button, Box, Snackbar } from '@mui/material';
import { CheckCircle, Email } from '@mui/icons-material';
import { backendService } from '../backend/BackendService';
import { useTranslation } from 'react-i18next';

interface EmailVerificationBannerProps {
  onVerified?: () => void;
}

export const EmailVerificationBanner: React.FC<EmailVerificationBannerProps> = ({ onVerified }) => {
  const { t } = useTranslation();
  const [user, setUser] = useState(backendService.auth.getCurrentUser());
  const [sending, setSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSentTime, setLastSentTime] = useState<number>(0);

  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribe = backendService.auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      if (currentUser?.emailVerified && onVerified) {
        onVerified();
      }
    });

    return () => unsubscribe();
  }, [onVerified]);

  // Don't show banner if no user or email already verified
  if (!user || user.emailVerified || !user.email) {
    return null;
  }

  const handleResendEmail = async () => {
    // Rate limiting: only allow resending every 60 seconds
    const now = Date.now();
    if (now - lastSentTime < 60000) {
      const remainingSeconds = Math.ceil((60000 - (now - lastSentTime)) / 1000);
      setError(t('verification.rateLimitError', { 
        defaultValue: `Please wait ${remainingSeconds} seconds before resending`,
        seconds: remainingSeconds 
      }));
      return;
    }

    setSending(true);
    setError(null);

    try {
      await backendService.auth.sendEmailVerification();
      setShowSuccess(true);
      setLastSentTime(now);
    } catch (err) {
      console.error('Failed to send verification email:', err);
      const error = err as Error;
      setError(error.message || t('verification.sendError', { 
        defaultValue: 'Failed to send verification email. Please try again.' 
      }));
    } finally {
      setSending(false);
    }
  };

  const handleCheckVerification = async () => {
    try {
      await backendService.auth.reloadUser();
      const updatedUser = backendService.auth.getCurrentUser();
      setUser(updatedUser);
      
      if (updatedUser?.emailVerified) {
        if (onVerified) {
          onVerified();
        }
      } else {
        setError(t('verification.notVerifiedYet', { 
          defaultValue: 'Email not verified yet. Please check your inbox and click the verification link.' 
        }));
      }
    } catch (err) {
      console.error('Failed to check verification:', err);
      const error = err as Error;
      setError(error.message || t('verification.checkError', { 
        defaultValue: 'Failed to check verification status.' 
      }));
    }
  };

  return (
    <>
      <Alert 
        severity="warning" 
        icon={<Email />}
        sx={{ 
          mb: 2,
          '& .MuiAlert-message': {
            width: '100%'
          }
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 1 }}>
          <Box>
            <strong>{t('verification.title', { defaultValue: 'Email Verification Required' })}</strong>
            <br />
            {t('verification.message', { 
              defaultValue: 'Please verify your email address to access all features. Check your inbox for the verification link.',
              email: user.email 
            })}
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={handleCheckVerification}
              startIcon={<CheckCircle />}
            >
              {t('verification.checkButton', { defaultValue: 'I Verified' })}
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleResendEmail}
              disabled={sending}
              startIcon={<Email />}
            >
              {sending 
                ? t('verification.sendingButton', { defaultValue: 'Sending...' })
                : t('verification.resendButton', { defaultValue: 'Resend Email' })
              }
            </Button>
          </Box>
        </Box>
        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
      </Alert>

      <Snackbar
        open={showSuccess}
        autoHideDuration={6000}
        onClose={() => setShowSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setShowSuccess(false)} severity="success" sx={{ width: '100%' }}>
          {t('verification.emailSent', { 
            defaultValue: 'Verification email sent! Please check your inbox.',
            email: user.email 
          })}
        </Alert>
      </Snackbar>
    </>
  );
};

export default EmailVerificationBanner;
