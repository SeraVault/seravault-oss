import React, { useEffect, useState } from 'react';
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
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  LockOutlined,
  Phone as PhoneIcon,
  Close
} from '@mui/icons-material';
import { backendService } from '../backend/BackendService';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PhoneAuth } from '../components/PhoneAuth';
import { useAuth } from '../auth/AuthContext';
import { ENABLED_OAUTH_PROVIDERS } from '../constants/authConfig';
import OAuthProviderIcon from '../components/OAuthProviderIcon';

const LoginPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [loginMethod, setLoginMethod] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const navigate = useNavigate();

  // Apply language from URL parameter (set by landing page links)
  useEffect(() => {
    const lang = searchParams.get('lang');
    if (lang) {
      i18n.changeLanguage(lang);
    }
  }, [searchParams, i18n]);

  // If the user is already authenticated (e.g., phone login completes but stays on /login), redirect home
  useEffect(() => {
    if (!authLoading && user) {
      navigate('/', { replace: true });
    }
  }, [authLoading, user, navigate]);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await backendService.auth.signIn(email, password);
      navigate('/');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSignIn = async (providerId: string) => {
    setError(null);
    setLoading(true);
    try {
      await backendService.auth.signInWithOAuth(providerId);
      navigate('/');
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!resetEmail) {
      setError(t('auth.emailRequired', 'Email is required'));
      return;
    }
    
    try {
      setLoading(true);
      await backendService.auth.sendPasswordResetEmail(resetEmail);
      setResetEmailSent(true);
      setError(null);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseForgotPassword = () => {
    setShowForgotPassword(false);
    setResetEmailSent(false);
    setResetEmail('');
    setError(null);
  };

  return (
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
              {t('login.welcomeBack')}
            </Typography>
            <Typography variant="body1" sx={{ color: '#a0a0a0' }}>
              {t('login.signInToAccount')}
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          <Box 
            component="form" 
            onSubmit={(e) => { 
              e.preventDefault(); 
              handleLogin(); 
            }}
          >
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label={t('login.emailAddress')}
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
              label={t('login.password')}
              type={showPassword ? 'text' : 'password'}
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
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
                      aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
              <Button 
                variant="text" 
                size="small" 
                onClick={() => setShowForgotPassword(true)}
                sx={{ 
                  color: '#42a5f5',
                  textTransform: 'none',
                  '&:hover': {
                    background: 'rgba(66, 165, 245, 0.1)',
                  }
                }}
              >
                {t('auth.forgotPassword', 'Forgot Password?')}
              </Button>
            </Box>

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
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
              {loading ? t('auth.signingIn', 'Signing in...') : t('login.signIn')}
            </Button>

            <Divider sx={{ my: 3, borderColor: 'rgba(255, 255, 255, 0.1)' }}>
              <Typography variant="body2" sx={{ color: '#a0a0a0' }}>
                {t('login.or')}
              </Typography>
            </Divider>

            {ENABLED_OAUTH_PROVIDERS.map(({ providerId, label, icon }) => (
              <Button
                key={providerId}
                fullWidth
                variant="outlined"
                size="large"
                disabled={loading}
                onClick={() => handleOAuthSignIn(providerId)}
                startIcon={<OAuthProviderIcon icon={icon} fontSize={20} />}
                sx={{
                  py: 1.5, borderRadius: 2, textTransform: 'none',
                  fontSize: '1rem', fontWeight: 600, mb: 2,
                  borderColor: 'rgba(255, 255, 255, 0.2)', color: '#e0e0e0',
                  '&:hover': { borderColor: '#e0e0e0', background: 'rgba(255, 255, 255, 0.05)' },
                }}
              >
                {t('login.signInWith', { provider: label })}
              </Button>
            ))}

            <Button
              fullWidth
              variant="outlined"
              size="large"
              disabled={loading}
              onClick={() => setLoginMethod(loginMethod === 'phone' ? 'email' : 'phone')}
              startIcon={<PhoneIcon />}
              sx={{
                py: 1.5, borderRadius: 2, textTransform: 'none',
                fontSize: '1rem', fontWeight: 600,
                borderColor: 'rgba(255, 255, 255, 0.2)', color: '#e0e0e0',
                '&:hover': { borderColor: '#e0e0e0', background: 'rgba(255, 255, 255, 0.05)' },
              }}
            >
              {loginMethod === 'phone' ? t('profile.backToEmailLogin', 'Back to Email Login') : t('profile.signInWithPhone', 'Sign In with Phone')}
            </Button>

            {loginMethod === 'phone' && (
              <Box sx={{ mt: 3 }}>
                <PhoneAuth 
                  onSuccess={() => navigate('/')}
                  onError={(err) => setError(err)}
                  mode="login"
                />
              </Box>
            )}

            <Box sx={{ mt: 3, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: '#a0a0a0' }}>
                {t('login.dontHaveAccount')}{' '}
                <Link 
                  to="/signup" 
                  style={{ 
                    color: '#42a5f5', 
                    textDecoration: 'none',
                    fontWeight: 600
                  }}
                >
                  {t('login.signUpHere')}
                </Link>
              </Typography>
            </Box>
          </Box>

          {/* Security Badge */}
          <Box 
            sx={{ 
              mt: 4, 
              pt: 3, 
              borderTop: '1px solid #2a2a2a',
              textAlign: 'center'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
              <LockOutlined sx={{ fontSize: 18, color: '#a0a0a0' }} />
              <Typography variant="caption" sx={{ color: '#a0a0a0' }}>
                {t('login.poweredBy')}
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Container>

      {/* Forgot Password Dialog */}
      <Dialog
        open={showForgotPassword}
        onClose={handleCloseForgotPassword}
        PaperProps={{
          sx: {
            background: '#151515',
            border: '1px solid #2a2a2a',
            borderRadius: 4,
            // Custom styles for the dialog
            backdropFilter: 'blur(10px)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 10px 10px -5px rgba(0, 0, 0, 0.5)',
          },
        }}
      >
        <DialogTitle sx={{ 
          color: '#e0e0e0', 
          borderBottom: '1px solid #2a2a2a',
          pb: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {t('auth.forgotPassword')}
          </Typography>
          <IconButton
            onClick={handleCloseForgotPassword}
            sx={{ color: '#a0a0a0', '&:hover': { color: '#fff' } }}
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <DialogContentText sx={{ color: '#a0a0a0', mb: 2 }}>
            {t('auth.enterEmailForReset')}
          </DialogContentText>
          <TextField
            margin="normal"
            required
            fullWidth
            id="resetEmail"
            label={t('login.emailAddress')}
            name="resetEmail"
            autoComplete="email"
            autoFocus
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
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
          {resetEmailSent && (
            <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
              {t('auth.resetEmailSent')}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button 
            onClick={handleCloseForgotPassword} 
            color="inherit" 
            disabled={loading}
            sx={{ 
              borderRadius: 2,
              textTransform: 'none',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#e0e0e0',
              '&:hover': {
                background: 'rgba(255, 255, 255, 0.1)',
              }
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleForgotPassword}
            disabled={loading}
            sx={{ 
              py: 1.5,
              borderRadius: 2,
              textTransform: 'none',
              fontSize: '0.875rem',
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
            {loading ? t('auth.sending', 'Sending...') : t('auth.sendResetLink')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LoginPage;
