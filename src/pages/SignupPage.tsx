// @ts-nocheck
import { AUTH_CONFIG } from '../constants/authConfig';
import { IS_IOS_APP } from '../utils/platform';
import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Button, 
  TextField, 
  Typography, 
  Alert, 
  Container, 
  Paper, 
  Divider,
  IconButton,
  InputAdornment,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  CheckCircleOutline,
  Phone as PhoneIcon,
  Email,
} from '@mui/icons-material';
import { backendService } from '../backend/BackendService';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createUserProfile, getUserProfile } from '../firestore';
import PasswordStrengthIndicator from '../components/PasswordStrengthIndicator';
import PasswordRequirements from '../components/PasswordRequirements';
import TermsAcceptanceDialog from '../components/TermsAcceptanceDialog';
import { PhoneAuth } from '../components/PhoneAuth';
import { STORAGE_KEYS } from '../constants/storage-keys';
import { validatePasswordComplexity } from '../utils/passwordStrength';
import { ENABLED_OAUTH_PROVIDERS } from '../constants/authConfig';
import OAuthProviderIcon from '../components/OAuthProviderIcon';

const SignupPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const invitationId = searchParams.get('invite');
  const selectedPlan = searchParams.get('plan');
  const preferredLanguage = searchParams.get('lang') || 'en';

  // If already logged in, check registration state and redirect appropriately
  useEffect(() => {
    const checkAndRedirect = async () => {
      const currentUser = backendService.auth.getCurrentUser();
      if (!currentUser) return;

      // Check if the user has completed registration (accepted terms).
      // This handles the case where the user clicked the email verification link,
      // was redirected to /signup, and needs to finish onboarding.
      try {
        const userProfile = await getUserProfile(currentUser.uid);
        if (!userProfile?.termsAcceptedAt) {
          // Authenticated but not yet onboarded — show the terms dialog so they
          // can complete setup (key generation → subscription).
          setPendingSignupType('email');
          setShowTermsDialog(true);
          return;
        }
      } catch (e) {
        console.error('[SignupPage] Error checking user profile on mount:', e);
      }

      // User has completed registration — redirect to their intended destination.
      if (invitationId) {
        navigate(`/contacts?invite=${invitationId}`);
      } else {
        navigate('/');
      }
    };
    checkAndRedirect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const [signupMethod, setSignupMethod] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [waitingForVerification, setWaitingForVerification] = useState(false);
  const [verificationCheckCount, setVerificationCheckCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTermsDialog, setShowTermsDialog] = useState(false);
  const [pendingSignupType, setPendingSignupType] = useState<'email' | 'google' | 'phone' | null>(null);
  const [invitationInfo, setInvitationInfo] = useState<{
    fromUserDisplayName: string;
    fromUserEmail: string;
    message?: string;
  } | null>(null);
  const navigate = useNavigate();

  // Set language from URL parameter immediately
  useEffect(() => {
    if (preferredLanguage) {
      i18n.changeLanguage(preferredLanguage);
    }
  }, [preferredLanguage, i18n]);

  // Load invitation info if invitation ID is present
  useEffect(() => {
    const loadInvitation = async () => {
      if (invitationId) {
        try {
          const inviteData = await backendService.documents.get('contactRequests', invitationId);
          if (inviteData) {
            setInvitationInfo({
              fromUserDisplayName: inviteData.fromUserDisplayName || 'Someone',
              fromUserEmail: inviteData.fromUserEmail || '',
              message: inviteData.message
            });
            // Pre-fill email if available
            if (inviteData.toEmail) {
              setEmail(inviteData.toEmail);
            }
          }
        } catch (error) {
          console.error('Error loading invitation:', error);
        }
      }
    };
    
    loadInvitation();
  }, [invitationId]);

  // Poll for email verification
  const startVerificationPolling = (userId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        setVerificationCheckCount(prev => prev + 1);
        
        // Check verification status from Firestore
        const userDoc = await backendService.documents.get('users', userId);
        
        if (userDoc?.emailVerified) {
          clearInterval(pollInterval);
          setWaitingForVerification(false);

          // If profile already has keys/terms, treat as returning user and navigate home
          if (userDoc?.publicKey || userDoc?.termsAcceptedAt) {
            console.log('[SignupPage] Email verified for existing user - skipping terms dialog');
            navigate('/');
            return;
          }

          console.log('[SignupPage] Email verified! Showing terms dialog');
          setShowTermsDialog(true);
        }
        
        // Stop polling after 10 minutes (120 checks at 5-second intervals)
        if (verificationCheckCount > 120) {
          clearInterval(pollInterval);
          console.log('[SignupPage] Verification polling timeout');
        }
      } catch (error) {
        console.error('[SignupPage] Error checking verification status:', error);
      }
    }, 5000); // Check every 5 seconds
    
    // Cleanup on unmount
    return () => clearInterval(pollInterval);
  };

  const handleResendVerification = async () => {
    const user = backendService.auth.getCurrentUser();
    if (!user) return;
    
    setLoading(true);
    setError(null);
    
    try {
      await backendService.auth.sendEmailVerification();
      
      console.log('[SignupPage] Verification email resent');
      setVerificationCheckCount(0); // Reset counter
    } catch (error) {
      console.error('[SignupPage] Failed to resend verification email:', error);
      setError(t('signup.resendFailed', { defaultValue: 'Failed to resend email. Please try again.' }));
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    setError(null);
    if (password !== confirmPassword) {
      setError(t('signup.passwordsDoNotMatch'));
      return;
    }
    
    // Validate password complexity
    const validationErrors = validatePasswordComplexity(password);
    if (validationErrors.length > 0) {
      setError(validationErrors.join(' '));
      return;
    }
    
    setLoading(true);
    try {
      // Sign up/sign in the user first
      const user = await backendService.auth.signUp(email, password);
      
      // For email/password signup, always treat as new user and send verification email
      // (Email/password can't be reused - Firebase will throw auth/email-already-in-use)
      console.log('[SignupPage] New email/password user - sending verification email');
      
      // Send verification email via Cloud Function
      try {
        // Add small delay to ensure auth state is fully propagated
        await new Promise(resolve => setTimeout(resolve, 500));
        
        await backendService.auth.sendEmailVerification(preferredLanguage);
        
        console.log('[SignupPage] Verification email sent successfully');
        setWaitingForVerification(true);
        setPendingSignupType('email');
        setLoading(false);
        

        // Start polling for verification
        startVerificationPolling(user.uid);
      } catch (emailError) {
        console.error('[SignupPage] Failed to send verification email:', emailError);
        setError(t('signup.verificationEmailFailed', { defaultValue: 'Failed to send verification email. Please try again or contact support.' }));
        // Sign out the user since verification failed
        await backendService.auth.signOut();
      }
    } catch (error: any) {
      console.error('[SignupPage] Signup error:', error);
      
      // Handle Firebase auth errors with user-friendly messages
      if (error.code === 'auth/email-already-in-use') {
        setError(t('signup.emailAlreadyInUse', { defaultValue: 'This email is already registered. Please sign in or use a different email.' }));
      } else if (error.code === 'auth/invalid-email') {
        setError(t('signup.invalidEmail', { defaultValue: 'Invalid email address.' }));
      } else if (error.code === 'auth/weak-password') {
        setError(t('signup.weakPassword', { defaultValue: 'Password is too weak. Please use a stronger password.' }));
      } else if (error.code === 'auth/operation-not-allowed') {
        setError(t('signup.operationNotAllowed', { defaultValue: 'Email/password sign-up is not enabled.' }));
      } else {
        setError(error.message || t('signup.genericError', { defaultValue: 'Failed to sign up. Please try again.' }));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSignIn = async (providerId: string, label: string) => {
    setError(null);
    setLoading(true);

    try {
      const user = await backendService.auth.signInWithOAuth(providerId);

      // Check if profile already exists (returning user)
      const existingProfile = await getUserProfile(user.uid);

      if (existingProfile) {
        console.log(`[SignupPage] Existing ${label} user detected - skipping terms`);
        if (invitationId) localStorage.setItem(STORAGE_KEYS.PENDING_INVITATION, invitationId);
        if (existingProfile.publicKey) {
          navigate('/');
        } else {
          navigate('/profile');
        }
      } else {
        console.log(`[SignupPage] New ${label} user detected - showing terms`);
        setPendingSignupType('google');
        setShowTermsDialog(true);
      }
    } catch (error: any) {
      console.error(`[SignupPage] ${label} sign-in error:`, error);
      if (error.code === 'auth/popup-closed-by-user') return;
      if (error.code === 'auth/cancelled-popup-request') return;
      if (error.code === 'auth/popup-blocked') {
        setError(t('signup.popupBlocked', { defaultValue: 'Popup was blocked by your browser. Please allow popups for this site.' }));
      } else if (error.code === 'auth/account-exists-with-different-credential') {
        setError(t('signup.accountExistsWithDifferentCredential', { defaultValue: 'An account already exists with this email using a different sign-in method.' }));
      } else {
        setError(error.message || `Failed to sign in with ${label}. Please try again.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneWithEmailBackup = async () => {
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < AUTH_CONFIG.password.minLength) {
      setError(`Password must be at least ${AUTH_CONFIG.password.minLength} characters`);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get current phone-authenticated user
      const currentUser = backendService.auth.getCurrentUser();
      if (!currentUser) {
        throw new Error('Phone authentication session expired. Please start over.');
      }

      // Link email/password credential to phone account
      await backendService.auth.linkEmailPassword(email, password);
      console.log('Email/password linked successfully to phone account');

      // Now proceed with terms acceptance
      setPendingSignupType('phone');
      setShowTermsDialog(true);
    } catch (err: any) {
      console.error('Error linking email/password:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Please use a different email or sign in.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Invalid email address');
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak. Please use a stronger password.');
      } else {
        setError(err.message || 'Failed to set up backup authentication');
      }
      setLoading(false);
    }
  };

  const handleTermsAccept = async () => {
    setShowTermsDialog(false);
    setLoading(true);
    
    try {
      const user = backendService.auth.getCurrentUser();
      if (!user) {
        throw new Error('No authenticated user found');
      }
      
      // Create profile with terms acceptance (only called for new users)
      if (pendingSignupType === 'email' || pendingSignupType === 'google') {
        await createUserProfile(user.uid, {
          displayName: user.displayName || user.email || 'User',
          email: user.email || '',
          theme: 'dark',
          language: preferredLanguage,
          termsAcceptedAt: new Date().toISOString(),
          emailVerified: true, // Already verified before reaching this point
        });
        
        console.log('[SignupPage] New user profile created with terms acceptance');
        
        // Store invitation ID in localStorage before navigation
        if (invitationId) {
          console.log('[SignupPage] Storing pending invitation in localStorage:', invitationId);
          localStorage.setItem(STORAGE_KEYS.PENDING_INVITATION, invitationId);
        }
        
        navigate('/setup');
      } else if (pendingSignupType === 'phone') {
        // Phone user already authenticated and has email/password linked
        await createUserProfile(user.uid, {
          displayName: user.displayName || user.email || user.phoneNumber || 'User',
          email: user.email || '',
          theme: 'dark',
          language: preferredLanguage,
          termsAcceptedAt: new Date().toISOString(),
        });
        
        // Store invitation ID in localStorage before navigation
        if (invitationId) {
          console.log('[SignupPage] Storing pending invitation in localStorage:', invitationId);
          localStorage.setItem(STORAGE_KEYS.PENDING_INVITATION, invitationId);
        }
        
        navigate('/setup');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      setError(errorMessage);
    } finally {
      setPendingSignupType(null);
      setLoading(false);
    }
  };

  const handleTermsDecline = () => {
    setShowTermsDialog(false);
    setPendingSignupType(null);
    setError(t('signup.mustAcceptTerms', 'You must accept the Terms of Service and Privacy Policy to create an account'));
  };

  return (
    <>
      <TermsAcceptanceDialog
        open={showTermsDialog}
        onAccept={handleTermsAccept}
        onDecline={handleTermsDecline}
      />
      
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          // Landing page background style
          background: '#0a0a0a',
          backgroundImage: `
            radial-gradient(circle at 50% 0%, rgba(66, 165, 245, 0.15) 0%, transparent 50%),
            radial-gradient(circle at 85% 30%, rgba(171, 71, 188, 0.1) 0%, transparent 40%)
          `,
          overflowY: 'auto',
        }}
      >
        <Container component="main" maxWidth="sm" sx={{ my: 'auto', py: 4 }}>
          <Paper 
            elevation={0} 
            sx={{ 
              p: { xs: 3, sm: 5 }, 
              borderRadius: 4,
              // Landing page card style
              background: '#151515',
              border: '1px solid #2a2a2a',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 10px 10px -5px rgba(0, 0, 0, 0.5)',
            }}
          >
            {/* Logo/Brand Section */}
            <Box sx={{ textAlign: 'center', mb: 4 }}>
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 2,
                  maxWidth: '100%',
                  overflow: 'hidden',
                }}
              >
                <img 
                  src="/seravault_logo.svg" 
                  alt="SeraVault" 
                  style={{ height: '60px', width: 'auto', maxWidth: '100%', objectFit: 'contain' }}
                />
              </Box>
              <Typography component="h1" variant="h4" sx={{ fontWeight: 'bold', mb: 1, color: '#e0e0e0' }}>
                {t('signup.title')}
              </Typography>
              <Typography variant="body1" sx={{ color: '#a0a0a0' }}>
                {t('signup.joinSeraVault')}
              </Typography>
            </Box>

            {/* Invitation Banner */}
            {invitationInfo && (
              <Alert 
                severity="info" 
                icon={<CheckCircleOutline />}
                sx={{ mb: 3, borderRadius: 2 }}
              >
                <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                  {t('signup.invitedBy', { name: invitationInfo.fromUserDisplayName })}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {invitationInfo.fromUserEmail}
                </Typography>
                {invitationInfo.message && (
                  <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
                    "{invitationInfo.message}"
                  </Typography>
                )}
              </Alert>
            )}

            {error && (
              <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                {error}
              </Alert>
            )}

            {waitingForVerification && !error && (
              <Alert 
                severity="info" 
                icon={<Email />} 
                sx={{ 
                  mb: 3, 
                  borderRadius: 2,
                  backgroundColor: 'rgba(66, 165, 245, 0.1)',
                  border: '1px solid rgba(66, 165, 245, 0.3)',
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                  {t('signup.verifyYourEmail', { defaultValue: '📧 Please Verify Your Email' })}
                </Typography>
                <Typography variant="body2" sx={{ mb: 1.5 }}>
                  {t('signup.verificationInstructions', { 
                    defaultValue: 'We sent a verification email to {{email}}. Please click the link in the email to continue. The page will automatically proceed once verified.',
                    email
                  })}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleResendVerification}
                    disabled={loading}
                  >
                    {t('signup.resendEmail', { defaultValue: 'Resend Email' })}
                  </Button>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {t('signup.checkingStatus', { defaultValue: 'Checking verification status...' })}
                  </Typography>
                </Box>
              </Alert>
            )}

            {!waitingForVerification && (
            <Box 
              component="form" 
              onSubmit={(e) => { 
                e.preventDefault(); 
                handleSignup(); 
              }}
            >
              <TextField
                margin="normal"
                required
                fullWidth
                id="email"
                label={t('signup.emailAddress')}
                name="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                sx={{ 
                  mb: 2,
                  '& .MuiOutlinedInput-root': {
                    color: '#e0e0e0',
                    '& fieldset': {
                      borderColor: '#2a2a2a',
                    },
                    '&:hover fieldset': {
                      borderColor: '#42a5f5',
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#42a5f5',
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: '#a0a0a0',
                    '&.Mui-focused': {
                      color: '#42a5f5',
                    },
                  },
                }}
                InputProps={{
                  sx: { borderRadius: 2 }
                }}
              />

              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label={t('signup.password')}
                type={showPassword ? 'text' : 'password'}
                id="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                sx={{ 
                  mb: 1,
                  '& .MuiOutlinedInput-root': {
                    color: '#e0e0e0',
                    '& fieldset': {
                      borderColor: '#2a2a2a',
                    },
                    '&:hover fieldset': {
                      borderColor: '#42a5f5',
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#42a5f5',
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: '#a0a0a0',
                    '&.Mui-focused': {
                      color: '#42a5f5',
                    },
                  },
                }}
                InputProps={{
                  sx: { borderRadius: 2 },
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={showPassword ? t('signup.hidePassword') : t('signup.showPassword')}
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <PasswordStrengthIndicator password={password} />
              <PasswordRequirements password={password} />

              <TextField
                margin="normal"
                required
                fullWidth
                name="confirmPassword"
                label={t('signup.confirmPassword')}
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPassword"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                error={confirmPassword.length > 0 && password !== confirmPassword}
                helperText={confirmPassword.length > 0 && password !== confirmPassword ? t('signup.passwordsDoNotMatch') : ''}
                sx={{ 
                  mb: 3,
                  '& .MuiOutlinedInput-root': {
                    color: '#e0e0e0',
                    '& fieldset': {
                      borderColor: '#2a2a2a',
                    },
                    '&:hover fieldset': {
                      borderColor: '#42a5f5',
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#42a5f5',
                    },
                  },
                  '& .MuiInputLabel-root': {
                    color: '#a0a0a0',
                    '&.Mui-focused': {
                      color: '#42a5f5',
                    },
                  },
                }}
                InputProps={{
                  sx: { borderRadius: 2 },
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={showConfirmPassword ? t('signup.hidePassword') : t('signup.showPassword')}
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        edge="end"
                      >
                        {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading || password !== confirmPassword}
                sx={{ 
                  py: 1.5, 
                  mb: 2,
                  borderRadius: 2,
                  textTransform: 'none',
                  fontSize: '1rem',
                  fontWeight: 600,
                  // Landing page gradient
                  background: 'linear-gradient(135deg, #00F078 0%, #42a5f5 50%, #667eea 100%)',
                  boxShadow: '0 4px 15px rgba(66, 165, 245, 0.3)',
                  border: 'none',
                  color: '#fff',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #00F078 0%, #42a5f5 50%, #667eea 100%)',
                    opacity: 0.9,
                    boxShadow: '0 6px 20px rgba(66, 165, 245, 0.4)',
                  },
                  '&:disabled': {
                    background: 'rgba(255, 255, 255, 0.12)',
                    color: 'rgba(255, 255, 255, 0.3)',
                  }
                }}
              >
                {loading ? t('signup.signingUp') : t('signup.createAccountButton')}
              </Button>

              <Divider sx={{ my: 3, borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                <Typography variant="body2" sx={{ color: '#a0a0a0' }}>
                  {t('signup.or')}
                </Typography>
              </Divider>

              {ENABLED_OAUTH_PROVIDERS.map(({ providerId, label, icon }) => (
                <Button
                  key={providerId}
                  fullWidth
                  variant="outlined"
                  size="large"
                  disabled={loading}
                  onClick={() => handleOAuthSignIn(providerId, label)}
                  startIcon={<OAuthProviderIcon icon={icon} fontSize={20} />}
                  sx={{
                    py: 1.5, borderRadius: 2, textTransform: 'none',
                    fontSize: '1rem', fontWeight: 600, mb: 2,
                    borderColor: 'rgba(255, 255, 255, 0.2)', color: '#e0e0e0',
                    '&:hover': { borderColor: '#e0e0e0', background: 'rgba(255, 255, 255, 0.05)' },
                  }}
                >
                  {t('signup.signUpWith', { provider: label })}
                </Button>
              ))}

              <Button
                fullWidth
                variant="outlined"
                size="large"
                disabled={loading}
                onClick={() => setSignupMethod(signupMethod === 'phone' ? 'email' : 'phone')}
                startIcon={<PhoneIcon />}
                sx={{
                  py: 1.5, borderRadius: 2, textTransform: 'none',
                  fontSize: '1rem', fontWeight: 600,
                  borderColor: 'rgba(255, 255, 255, 0.2)', color: '#e0e0e0',
                  '&:hover': { borderColor: '#e0e0e0', background: 'rgba(255, 255, 255, 0.05)' },
                }}
              >
                {signupMethod === 'phone' ? t('signup.backToEmail') : t('signup.signUpWithPhone')}
              </Button>

              {signupMethod === 'phone' && !phoneVerified && (
                <Box sx={{ mt: 3 }}>
                  <Alert severity="info" sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                      {t('profile.secureAccountTitle', 'Secure Your Account')}
                    </Typography>
                    <Typography variant="body2">
                      {t('profile.phoneBackupExplanation', "After verifying your phone number, you'll set up an email and password as a backup authentication method. This ensures you can always access your account even if you lose your phone number.")}
                    </Typography>
                  </Alert>
                  <PhoneAuth 
                    onSuccess={() => {
                      setPhoneVerified(true);
                      setError(null);
                    }}
                    onError={(err) => setError(err)}
                    mode="signup"
                  />
                </Box>
              )}

              {signupMethod === 'phone' && phoneVerified && (
                <Box sx={{ mt: 3 }}>
                  <Alert severity="success" sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {t('profile.phoneVerified', '✓ Phone Verified')}
                    </Typography>
                  </Alert>
                  
                  <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                    {t('profile.setBackupAuth', 'Set Backup Authentication')}
                  </Typography>
                  
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    {t('profile.backupAuthDescription', "Create an email and password to secure your account. You'll be able to sign in with either your phone number or email.")}
                  </Typography>

                  <TextField
                    fullWidth
                    label={t('auth.email', 'Email Address')}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    autoComplete="email"
                    sx={{ mb: 2 }}
                  />

                  <TextField
                    fullWidth
                    label={t('auth.password', 'Password')}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="new-password"
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowPassword(!showPassword)}
                            edge="end"
                          >
                            {showPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                    sx={{ mb: 1 }}
                  />

                  {password && <PasswordStrengthIndicator password={password} />}

                  <TextField
                    fullWidth
                    label={t('auth.confirmPassword', 'Confirm Password')}
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="new-password"
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            edge="end"
                          >
                            {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                    sx={{ mb: 2 }}
                  />

                  <Button
                    fullWidth
                    variant="contained"
                    size="large"
                    onClick={handlePhoneWithEmailBackup}
                    disabled={loading || !email || !password || !confirmPassword}
                    sx={{ 
                      py: 1.5,
                      borderRadius: 2,
                      textTransform: 'none',
                      fontSize: '1rem',
                      fontWeight: 600,
                    }}
                  >
                    {loading ? t('auth.signingUp', 'Setting up...') : t('profile.completeSignup', 'Complete Signup')}
                  </Button>

                  <Button
                    fullWidth
                    variant="text"
                    size="small"
                    onClick={() => {
                      setPhoneVerified(false);
                      setEmail('');
                      setPassword('');
                      setConfirmPassword('');
                    }}
                    disabled={loading}
                    sx={{ mt: 1 }}
                  >
                    {t('signup.startOver')}
                  </Button>
                </Box>
              )}

              <Box sx={{ mt: 3, textAlign: 'center' }}>
                <Typography variant="body2" sx={{ color: '#a0a0a0' }}>
                  {t('signup.alreadyHaveAccount')}{' '}
                  <Link 
                    to="/login" 
                    style={{ 
                      color: '#42a5f5', 
                      textDecoration: 'none',
                      fontWeight: 600
                    }}
                  >
                    {t('signup.signInHere')}
                  </Link>
                </Typography>
              </Box>
            </Box>
            )}

            {/* Security Features */}
            <Box 
              sx={{ 
                mt: 4, 
                pt: 3, 
                borderTop: '1px solid #2a2a2a',
              }}
            >
              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, textAlign: 'center', color: '#e0e0e0' }}>
                {t('signup.whatYouGet')}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <CheckCircleOutline sx={{ fontSize: 20, color: '#66bb6a' }} />
                  <Typography variant="body2" sx={{ color: '#a0a0a0' }}>
                    {t('signup.quantumResistant')}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <CheckCircleOutline sx={{ fontSize: 20, color: '#66bb6a' }} />
                  <Typography variant="body2" sx={{ color: '#a0a0a0' }}>
                    {t('signup.zeroKnowledge')}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <CheckCircleOutline sx={{ fontSize: 20, color: '#66bb6a' }} />
                  <Typography variant="body2" sx={{ color: '#a0a0a0' }}>
                    {t('signup.endToEndEncrypted')}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Paper>
        </Container>
      </Box>
    </>
  );
};

export default SignupPage;
