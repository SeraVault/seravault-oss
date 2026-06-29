import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  CircularProgress,
} from '@mui/material';
import { Phone, Sms } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { backendService } from '../backend/BackendService';

interface PhoneAuthProps {
  onSuccess: (phoneUser?: any) => void;
  onError?: (error: string) => void;
  mode?: 'login' | 'signup' | 'link';
}

export const PhoneAuth: React.FC<PhoneAuthProps> = ({ onSuccess, onError, mode = 'login' }) => {
  const { t } = useTranslation();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const recaptchaVerifier = useRef<any>(null);

  useEffect(() => {
    // Initialize reCAPTCHA when component mounts
    if (recaptchaRef.current && !recaptchaVerifier.current) {
      recaptchaVerifier.current = backendService.auth.createRecaptchaVerifier(recaptchaRef.current, {
        size: 'invisible',
        callback: () => {
          // reCAPTCHA solved, allow signInWithPhoneNumber
        },
        'expired-callback': () => {
          setError('reCAPTCHA expired. Please try again.');
        }
      });
    }

    // Cleanup
    return () => {
      if (recaptchaVerifier.current) {
        recaptchaVerifier.current.clear();
        recaptchaVerifier.current = null;
      }
    };
  }, []);

  const formatPhoneNumber = (value: string): string => {
    // Remove all non-digit characters
    const digits = value.replace(/\D/g, '');
    
    // Add + if not present and ensure it starts with country code
    if (!digits.startsWith('1') && digits.length > 0) {
      return `+1${digits}`;
    }
    return `+${digits}`;
  };

  const handleSendCode = async () => {
    if (!phoneNumber) {
      setError('Please enter a phone number');
      return;
    }

    if (!recaptchaVerifier.current) {
      setError('reCAPTCHA not initialized. Please refresh the page.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formattedPhone = formatPhoneNumber(phoneNumber);
      let result;
      
      if (mode === 'link') {
        result = await backendService.auth.linkWithPhoneNumber(
          formattedPhone,
          recaptchaVerifier.current
        );
      } else {
        result = await backendService.auth.signInWithPhoneNumber(
          formattedPhone,
          recaptchaVerifier.current
        );
      }
      
      setConfirmationResult(result);
      setStep('code');
    } catch (err: any) {
      console.error('Error sending verification code:', err);
      let errorMessage = 'Failed to send verification code. ';
      
      if (err.code === 'auth/invalid-phone-number') {
        errorMessage += 'Invalid phone number format. Please use format: +1234567890';
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage += 'Too many requests. Please try again later.';
      } else {
        errorMessage += err.message || 'Please try again.';
      }
      
      setError(errorMessage);
      if (onError) onError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError('Please enter the 6-digit verification code');
      return;
    }

    if (!confirmationResult) {
      setError('No confirmation result. Please request a new code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const user = await backendService.auth.verifyPhoneCode(confirmationResult, verificationCode);
      console.log('Phone verification successful:', user);
      setLoading(false);
      // For signup mode, pass the confirmation result so parent can link additional auth
      if (mode === 'signup') {
        onSuccess(confirmationResult);
      } else {
        onSuccess();
      }
    } catch (err: any) {
      console.error('Error verifying code:', err);
      let errorMessage = 'Invalid verification code. ';
      
      if (err.code === 'auth/invalid-verification-code') {
        errorMessage = 'Invalid verification code. Please check and try again.';
      } else if (err.code === 'auth/code-expired') {
        errorMessage = 'Verification code expired. Please request a new code.';
      } else {
        errorMessage += err.message || 'Please try again.';
      }
      
      setError(errorMessage);
      if (onError) onError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = () => {
    setStep('phone');
    setVerificationCode('');
    setConfirmationResult(null);
    setError('');
  };

  return (
    <Box>
      {step === 'phone' ? (
        <>
          <TextField
            fullWidth
            label={t('phone.phoneNumber', 'Phone Number')}
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+1234567890"
            disabled={loading}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Phone />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 2 }}
          />
          
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
            Enter your phone number with country code (e.g., +1 for US)
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={handleSendCode}
            disabled={loading || !phoneNumber}
            sx={{ py: 1.5 }}
          >
            {loading ? (
              <CircularProgress size={24} />
            ) : (
              `Send Verification Code`
            )}
          </Button>
        </>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            We sent a verification code to {phoneNumber}
          </Typography>

          <TextField
            fullWidth
            label={t('phone.verificationCode', 'Verification Code')}
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            disabled={loading}
            inputProps={{
              maxLength: 6,
              inputMode: 'numeric',
              pattern: '[0-9]*'
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Sms />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 2 }}
          />

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={handleVerifyCode}
            disabled={loading || verificationCode.length !== 6}
            sx={{ py: 1.5, mb: 1 }}
          >
            {loading ? (
              <CircularProgress size={24} />
            ) : (
              'Verify Code'
            )}
          </Button>

          <Button
            fullWidth
            variant="text"
            onClick={handleResendCode}
            disabled={loading}
          >
            Resend Code
          </Button>
        </>
      )}

      {/* Invisible reCAPTCHA container */}
      <div ref={recaptchaRef} />
    </Box>
  );
};
