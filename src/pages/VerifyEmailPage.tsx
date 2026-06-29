import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Box, Container, Paper, Typography, CircularProgress, Alert, Button } from '@mui/material';
import { CheckCircle, Error as ErrorIcon } from '@mui/icons-material';
import { backendService } from '../backend/BackendService';
import { useTranslation } from 'react-i18next';
import { STORAGE_KEYS } from '../constants/storage-keys';

const VerifyEmailPage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string>('');
  
  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get('token');
      
      if (!token) {
        setStatus('error');
        setErrorMessage(t('verification.noToken', { defaultValue: 'No verification token provided' }));
        return;
      }

      try {
        // Call Cloud Function to verify token
        const verifyToken = backendService.functions.call('verifyEmailToken', { token });
        await verifyToken;
        
        setStatus('success');
        
        // Determine where to redirect after verification.
        // New users who haven't accepted terms yet need to complete onboarding
        // (terms → key generation → subscription).
        let redirectPath = '/';
        const currentUser = backendService.auth.getCurrentUser();
        if (currentUser) {
          try {
            const userProfile = await backendService.documents.get('users', currentUser.uid);
            if (!userProfile?.termsAcceptedAt) {
              // New user: redirect to /signup so the terms dialog is shown.
              // The pending subscription plan (if any) is already in localStorage
              // and will be picked up by SetupPage after key generation.
              redirectPath = '/signup';
            }
          } catch (profileErr) {
            console.error('[VerifyEmailPage] Error checking user profile:', profileErr);
            // Fall through to default redirect
          }
        }

        // Redirect after 3 seconds
        setTimeout(() => {
          navigate(redirectPath);
        }, 3000);
        
      } catch (error: unknown) {
        console.error('Email verification error:', error);
        const err = error as Error & { code?: string };
        setStatus('error');
        
        // Handle specific error messages
        if (err.code === 'not-found') {
          setErrorMessage(t('verification.invalidToken', { 
            defaultValue: 'Invalid or expired verification token' 
          }));
        } else if (err.code === 'already-exists') {
          setErrorMessage(t('verification.alreadyVerified', { 
            defaultValue: 'Email address already verified' 
          }));
        } else if (err.code === 'deadline-exceeded') {
          setErrorMessage(t('verification.tokenExpired', { 
            defaultValue: 'Verification link has expired. Please request a new one.' 
          }));
        } else {
          setErrorMessage(t('verification.generalError', { 
            defaultValue: 'Failed to verify email. Please try again.' 
          }));
        }
      }
    };

    verifyEmail();
  }, [searchParams, navigate, t]);

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={3} sx={{ p: 4, textAlign: 'center' }}>
        {status === 'verifying' && (
          <>
            <CircularProgress size={60} sx={{ mb: 3 }} />
            <Typography variant="h5" gutterBottom>
              {t('verification.verifying', { defaultValue: 'Verifying Email...' })}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('verification.pleaseWait', { defaultValue: 'Please wait while we verify your email address.' })}
            </Typography>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle color="success" sx={{ fontSize: 80, mb: 2 }} />
            <Typography variant="h5" gutterBottom color="success.main">
              {t('verification.successTitle', { defaultValue: 'Email Verified!' })}
            </Typography>
            <Typography variant="body1" sx={{ mb: 3 }}>
              {t('verification.successMessage', { 
                defaultValue: 'Your email has been successfully verified. Redirecting...' 
              })}
            </Typography>
            <Alert severity="success">
              {t('verification.redirecting', { defaultValue: 'You will be redirected in a few seconds' })}
            </Alert>
          </>
        )}

        {status === 'error' && (
          <>
            <ErrorIcon color="error" sx={{ fontSize: 80, mb: 2 }} />
            <Typography variant="h5" gutterBottom color="error.main">
              {t('verification.errorTitle', { defaultValue: 'Verification Failed' })}
            </Typography>
            <Typography variant="body1" sx={{ mb: 3 }}>
              {errorMessage}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Button
                variant="contained"
                onClick={() => navigate('/login')}
              >
                {t('verification.goToLogin', { defaultValue: 'Go to Login' })}
              </Button>
              <Button
                variant="outlined"
                onClick={() => navigate('/')}
              >
                {t('verification.goToDashboard', { defaultValue: 'Go to Dashboard' })}
              </Button>
            </Box>
          </>
        )}
      </Paper>
    </Container>
  );
};

export default VerifyEmailPage;
