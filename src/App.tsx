import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './i18n'; // Initialize i18n
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ProtectedRoute from './auth/ProtectedRoute';
import ProfileCheck from './auth/ProfileCheck';
import TermsEnforcement from './components/TermsEnforcement';
import PersistentLayout from './components/PersistentLayout';
import { useAuth } from './auth/AuthContext';
import { usePassphrase } from './auth/PassphraseContext';
import { CircularProgress, Typography, useTheme, Dialog, DialogContent, Box } from '@mui/material';
import { ClipboardProvider } from './context/ClipboardContext';
import { ContentActionsProvider } from './context/ContentActionsContext';
import { LoadingProvider } from './context/LoadingContext';
import { RecentsProvider } from './context/RecentsContext';
import { MetadataProvider } from './context/MetadataContext';
import { ImportProgressProvider } from './context/ImportProgressContext';
import ImportProgressIndicator from './components/ImportProgressIndicator';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import { UpdatePrompt } from './components/UpdatePrompt';
import ForegroundNotificationToast from './components/ForegroundNotificationToast';
import NotificationPromptBanner from './components/NotificationPromptBanner';
// Import migration utility to make it available in console
import './utils/migrateFormTags';

// Lazy load pages that aren't immediately needed
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SetupPage = lazy(() => import('./pages/SetupPage'));
const CleanupPage = lazy(() => import('./pages/CleanupPage'));
const ContactsPage = lazy(() => import('./pages/ContactsPage'));
const FormTemplatesPage = lazy(() => import('./pages/FormTemplatesPage'));
const HelpPage = lazy(() => import('./pages/HelpPage'));
const SupportPage = lazy(() => import('./pages/SupportPage'));

// Preload the most-visited lazy pages in the background after initial render
// so navigating to them is instant rather than showing the loading fallback
const preloadLazyPages = () => {
  import('./pages/ContactsPage');
  import('./pages/HelpPage');
  import('./pages/ProfilePage');
};

// Suspense fallback component for page transitions
const PageLoadingFallback: React.FC = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 2,
      }}
    >
      <CircularProgress
        sx={{ color: theme.palette.primary.main }}
        size={40}
      />
      <Typography variant="body2" color="text.secondary">
        {t('common.loading', 'Loading...')}
      </Typography>
    </Box>
  );
};

// Global Loading Component
const GlobalLoadingSpinner: React.FC = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { loading: authLoading } = useAuth();
  const { loading: passphraseLoading, privateKey } = usePassphrase();

  // Only show loading for auth and passphrase stages (not data loading)
  const isLoading = authLoading || passphraseLoading;

  // Debug the loading states (temporarily)
  if (isLoading) {
    console.log('Loading states:', { authLoading, passphraseLoading, privateKey: !!privateKey });
  }

  if (!isLoading) return null;

  let loadingMessage = t('common.loading', 'Loading...');

  if (authLoading) {
    loadingMessage = t('common.authenticating', 'Authenticating...');
  } else if (passphraseLoading) {
    loadingMessage = t('common.decryptingVault', 'Decrypting your vault...');
  }
  
  return (
    <Dialog
      open={isLoading}
      disableEscapeKeyDown
      PaperProps={{
        sx: {
          borderRadius: 2,
          minWidth: 300,
        }
      }}
    >
      <DialogContent sx={{ 
        textAlign: 'center',
        p: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
      }}>
        <CircularProgress 
          sx={{ 
            color: theme.palette.primary.main,
          }} 
          size={60} 
          thickness={4} 
        />
        <Typography 
          variant="h6" 
          sx={{ 
            color: theme.palette.text.primary,
            fontWeight: theme.typography.fontWeightMedium 
          }}
        >
          {loadingMessage}
        </Typography>
      </DialogContent>
    </Dialog>
  );
};

const App: React.FC = () => {
  React.useEffect(() => {
    // Preload common lazy pages after initial render so navigation to them is instant
    const id = setTimeout(preloadLazyPages, 3000);
    return () => clearTimeout(id);
  }, []);

  return (
    <ContentActionsProvider>
    <ClipboardProvider>
      <LoadingProvider>
        <RecentsProvider>
          <MetadataProvider>
            <ImportProgressProvider>
              <TermsEnforcement>
                <PWAInstallPrompt />
                <UpdatePrompt />
                <ForegroundNotificationToast />
                <NotificationPromptBanner />
                <GlobalLoadingSpinner />
                <ImportProgressIndicator />
                <Suspense fallback={<PageLoadingFallback />}>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/signup" element={<SignupPage />} />
                  <Route path="/verify-email" element={<VerifyEmailPage />} />
                  
                  {/* All authenticated routes use PersistentLayout */}
                  <Route element={<ProtectedRoute />}>
                    <Route element={<PersistentLayout />}>
                      <Route element={<ProfileCheck />}>
                          <Route path="/" element={<HomePage />} />
                      </Route>
                      <Route path="/setup" element={<SetupPage />} />
                      <Route path="/profile" element={<ProfilePage />} />
                      <Route path="/contacts" element={<ContactsPage />} />
                      <Route path="/templates" element={<FormTemplatesPage />} />
                      <Route path="/cleanup" element={<CleanupPage />} />
                      <Route path="/help" element={<HelpPage />} />
                      <Route path="/support" element={<SupportPage />} />
                    </Route>
                  </Route>
                </Routes>
              </Suspense>
            </TermsEnforcement>
          </ImportProgressProvider>
        </MetadataProvider>
      </RecentsProvider>
    </LoadingProvider>
  </ClipboardProvider>
  </ContentActionsProvider>
  );
};

export default App;
