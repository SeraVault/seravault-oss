// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress, Button, TextField, Paper, FormControlLabel, Switch, Alert, Snackbar, useTheme, useMediaQuery, Divider, Chip, Card, CardContent, Accordion, AccordionSummary, AccordionDetails, Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText, Tabs, Tab } from '@mui/material';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { useThemeContext } from '../theme/ThemeContext';
import { useProfileManagement } from '../hooks/useProfileManagement';
import { useTranslation } from 'react-i18next';
import { type UserProfile } from '../firestore';
import { backendService } from '../backend/BackendService';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { User } from '../backend/BackendInterface';
import HardwareKeySetup from '../components/HardwareKeySetup';
import BiometricSetup from '../components/BiometricSetup';
import DeviceCapabilityInfo from '../components/DeviceCapabilityInfo';
import DecryptedKeyWarningDialog from '../components/DecryptedKeyWarningDialog';
import DeleteAccountDialog from '../components/DeleteAccountDialog';
import ExportDataDialog from '../components/ExportDataDialog';
import KeyManagementSection from '../components/KeyManagementSection';
import JsonImport from '../components/JsonImport';
import { Email, Phone, Add, Person, Security, Lock, VpnKey, Download, DeleteForever, ExpandMore, CheckCircle, Warning, Fingerprint, Info, Close, Storage, Refresh, Tune } from '@mui/icons-material';
import { NotificationSettings } from '../components/NotificationSettings';
import { PhoneAuth } from '../components/PhoneAuth';
import PasswordStrengthIndicator from '../components/PasswordStrengthIndicator';
import PasswordRequirements from '../components/PasswordRequirements';
import { validatePasswordComplexity } from '../utils/passwordStrength';
import { ENABLED_OAUTH_PROVIDERS } from '../constants/authConfig';
import { STORAGE_KEYS } from '../constants/storage-keys';
import OAuthProviderIcon from '../components/OAuthProviderIcon';

const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const { setMode } = useThemeContext();
  const { privateKey } = usePassphrase();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('sm'));
  const {
    userProfile,
    loading,
    editMode,
    displayName,
    theme,
    error,
    setUserProfile,
    setLoading,
    setEditMode,
    setDisplayName,
    setTheme,
    setError,
    fetchProfile,
    handleProfileUpdate,
  } = useProfileManagement();

  const [showDecryptedKeyWarning, setShowDecryptedKeyWarning] = useState(false);

  const handleDownloadKey = async (profile: UserProfile | null, onError: (error: string) => void) => {
    if (!profile?.encryptedPrivateKey) {
      onError('No private key available for download');
      return;
    }
    try {
      const keyData = {
        version: '1.0',
        keyType: 'ML-KEM-768',
        displayName: profile.displayName,
        email: profile.email,
        publicKey: profile.publicKey,
        encryptedPrivateKey: profile.encryptedPrivateKey,
        exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(keyData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${profile.displayName.replace(/[^a-zA-Z0-9]/g, '_')}_mlkem768_key.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading key:', err);
      onError('Failed to download key file');
    }
  };

  // Delete account state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletionProgress, setDeletionProgress] = useState<{
    step: string;
    current: number;
    total: number;
  } | null>(null);
  const [accountDeletedDialogOpen, setAccountDeletedDialogOpen] = useState(false);

  // Export data state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  // Hardware key state
  const [hasHardwareKeysWithPrivateKey, setHasHardwareKeysWithPrivateKey] = useState(false);
  const [checkingHardwareKeys, setCheckingHardwareKeys] = useState(true);

  // Authentication methods state
  const [linkedProviders, setLinkedProviders] = useState<string[]>([]);
  const [showPhoneUpdate, setShowPhoneUpdate] = useState(false);
  const [showPhoneAdd, setShowPhoneAdd] = useState(false);
  const [showEmailPasswordAdd, setShowEmailPasswordAdd] = useState(false);
  const [showEmailUpdate, setShowEmailUpdate] = useState(false);
  const [showPasswordUpdate, setShowPasswordUpdate] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [authMethodsLoading, setAuthMethodsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [confirmUnlinkProvider, setConfirmUnlinkProvider] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  const handleForceClearCache = async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      setSuccessMessage('Cache cleared! Reloading...');
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      console.error('Error clearing cache:', err);
      setError('Error clearing cache. Please try manually clearing your browser data.');
    }
  };

  // Success handlers that update profile and refresh private key
  const handleKeyGenerationSuccess = (profile: UserProfile) => {
    setUserProfile(profile);
    // Key verification is already done in useKeyGeneration.handleConfirmRegeneration
    // No need to verify again here
    
    // Re-check hardware keys after generation
    const recheckHardwareKeys = async () => {
      if (!user) return;
      try {
        const { getRegisteredHardwareKeys } = await import('../utils/hardwareKeyAuth');
        const hardwareKeys = await getRegisteredHardwareKeys(user.uid);
        setHasHardwareKeysWithPrivateKey(hardwareKeys.length > 0);
      } catch (error) {
        console.error('Error rechecking hardware keys:', error);
      }
    };
    recheckHardwareKeys();
    
    // Check for pending invitation or subscription plan from signup
    const pendingInvitation = localStorage.getItem(STORAGE_KEYS.PENDING_INVITATION);

    console.log('[ProfilePage] Key generation success - checking pending actions:', {
      pendingInvitation,
    });

    if (pendingInvitation) {
      console.log('[ProfilePage] Redirecting to contacts with invitation:', pendingInvitation);
      localStorage.removeItem(STORAGE_KEYS.PENDING_INVITATION);
      navigate('/contacts?invite=' + pendingInvitation);
    } else {
      console.log('[ProfilePage] No pending actions, navigating to home (/)');
      // Force a small delay to ensure Firestore writes have propagated locally
      setTimeout(() => {
        console.log('[ProfilePage] Executing navigation to /');
        navigate('/');
      }, 500);
    }
    // If no pending actions, stay on profile page
  };

  useEffect(() => {
    if (user) {
      fetchProfile(user as User);
    }
  }, [user, fetchProfile]);
  
  // Load linked authentication providers
  useEffect(() => {
    const loadLinkedProviders = async () => {
      if (!user) return;
      
      try {
        const providers = backendService.auth.getLinkedProviders();
        setLinkedProviders(providers);
      } catch (err) {
        console.error('Error loading linked providers:', err);
      }
    };
    
    loadLinkedProviders();
  }, [user]);
  
  // Check for hardware keys with stored private keys
  useEffect(() => {
    const checkHardwareKeys = async () => {
      if (!user) {
        setCheckingHardwareKeys(false);
        return;
      }

      try {
        const { getRegisteredHardwareKeys } = await import('../utils/hardwareKeyAuth');
        const hardwareKeys = await getRegisteredHardwareKeys(user.uid);
        // Check if user has ANY hardware keys registered
        const hasKeysWithPrivateKey = hardwareKeys.length > 0;
        setHasHardwareKeysWithPrivateKey(hasKeysWithPrivateKey);
      } catch (error) {
        console.error('Error checking hardware keys:', error);
        setHasHardwareKeysWithPrivateKey(false);
      } finally {
        setCheckingHardwareKeys(false);
      }
    };

    checkHardwareKeys();
  }, [user]);
  

  // Set active tab from ?tab= query param
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam !== null) {
      const tabIndex = parseInt(tabParam, 10);
      if (!isNaN(tabIndex)) setActiveTab(tabIndex);
    }
  }, [searchParams]);

  // Scroll to #biometric after the Security tab has rendered (reliable regardless of load time)
  useEffect(() => {
    if (window.location.hash !== '#biometric') return;
    // Only scroll when the Security tab (tab 1) is active
    if (activeTab !== 1) return;
    const tryScroll = (attempts = 0) => {
      const element = document.getElementById('biometric');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (attempts < 10) {
        setTimeout(() => tryScroll(attempts + 1), 100);
      }
    };
    tryScroll();
  }, [activeTab]);

  const handleConfirmDecryptedKeyDownload = async () => {
    if (!userProfile || !privateKey) return;
    
    try {
      const keyData = {
        version: "1.0",
        keyType: "ML-KEM-768 (DECRYPTED)",
        displayName: userProfile.displayName,
        email: userProfile.email,
        publicKey: userProfile.publicKey,
        privateKeyHex: privateKey,
        exportedAt: new Date().toISOString(),
        warning: "This file contains your private key in PLAIN TEXT. Store it securely and never share it."
      };

      const blob = new Blob([JSON.stringify(keyData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${userProfile.displayName.replace(/[^a-zA-Z0-9]/g, '_')}_mlkem768_decrypted_key.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setShowDecryptedKeyWarning(false);
    } catch (error) {
      console.error('Error downloading decrypted key:', error);
      setError('Failed to download decrypted key file');
    }
  };

  // Handle data export
  const handleExportData = async (saveToDirectory: boolean) => {
    if (!user || !privateKey) {
      throw new Error(t('profile.unlockKeyRequired', 'Please unlock your private key first'));
    }

    const { exportAllUserData } = await import('../services/dataExport');
    
    await exportAllUserData(user.uid, privateKey, {
      saveToDirectory,
      onProgress: (progress) => {
        console.log('Export progress:', progress);
        // Could add UI progress indicator here if needed
      }
    });
  };

  // Handle account deletion
  const handleDeleteAccount = async () => {
    if (!user) return;

    try {
      // Call the Cloud Function to delete the account
      setDeletionProgress({
        step: t('profile.deletingAccount', 'Deleting your account...'),
        current: 1,
        total: 1
      });
      
      const result = await backendService.functions.call<Record<string, never>, { success: boolean; message: string }>('deleteUserAccount', {});
      
      console.log('Account deletion result:', result.data);
      
      // Sign out on the client to clear Firebase Auth state from IndexedDB.
      // The server already deleted the Auth user, but the local session token
      // remains valid for up to 1 hour without an explicit sign-out.
      try {
        await backendService.auth.signOut();
      } catch (_) {
        // Ignore — the auth user no longer exists server-side, sign-out may fail
      }

      // Clear all local storage including language preference
      localStorage.clear();
      sessionStorage.clear();
      
      // Close deletion dialog and show confirmation before redirecting
      setDeleteDialogOpen(false);
      setDeletionProgress(null);
      setAccountDeletedDialogOpen(true);
    } catch (error) {
      console.error('Failed to delete account:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete account');
      setDeleteDialogOpen(false);
      setDeletionProgress(null);
    }
  };

  // Handle phone number update
  const handlePhoneUpdate = async () => {
    setShowPhoneUpdate(false);
    setError(null);
    
    // Reload linked providers after update
    const providers = backendService.auth.getLinkedProviders();
    setLinkedProviders(providers);
  };

  // Handle phone number add
  const handlePhoneAdd = async () => {
    setShowPhoneAdd(false);
    setError(null);
    
    // Reload linked providers after add
    const providers = backendService.auth.getLinkedProviders();
    setLinkedProviders(providers);
  };

  // Handle linking an OAuth provider (Google, GitHub, Microsoft, Apple, etc.)
  const handleLinkOAuth = async (providerId: string, label: string) => {
    try {
      setAuthMethodsLoading(true);
      setError(null);
      await backendService.auth.linkWithOAuth(providerId);
      const providers = backendService.auth.getLinkedProviders();
      setLinkedProviders(providers);
      setSuccessMessage(`${label} account linked successfully`);
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      if (error.code === 'auth/credential-already-in-use') {
        setError(`This ${label} account is already linked to a different SeraVault account.`);
      } else if (error.code === 'auth/provider-already-linked') {
        setError(`A ${label} account is already linked to this account.`);
      } else if (error.code === 'auth/popup-closed-by-user') {
        // User closed the popup — not an error
      } else {
        setError(error.message || `Failed to link ${label} account.`);
      }
    } finally {
      setAuthMethodsLoading(false);
    }
  };

  // Handle unlinking authentication method
  const handleUnlinkProvider = async (providerId: string) => {
    try {
      setAuthMethodsLoading(true);
      setError(null);
      setConfirmUnlinkProvider(null);

      await backendService.auth.unlinkProvider(providerId);
      
      // Reload linked providers
      const providers = backendService.auth.getLinkedProviders();
      setLinkedProviders(providers);
      
      setSuccessMessage(t('profile.authMethodRemoved', 'Authentication method removed successfully'));
    } catch (err: unknown) {
      console.error('Error unlinking provider:', err);
      const error = err as { code?: string; message?: string };
      setError(error.message || t('profile.failedToRemoveAuth', 'Failed to remove authentication method. Make sure you have at least one other method linked.'));
    } finally {
      setAuthMethodsLoading(false);
    }
  };

  // Handle adding email/password to phone-only account
  const handleAddEmailPassword = async () => {
    if (!newEmail || !newEmail.trim()) {
      setError(t('profile.emailRequired', 'Email is required'));
      return;
    }

    // Better email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      setError(t('profile.validEmailRequired', 'Please enter a valid email address'));
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError(t('profile.passwordsDoNotMatch', 'Passwords do not match'));
      return;
    }

    // Use full password complexity validation like signup
    const validationErrors = validatePasswordComplexity(newPassword);
    if (validationErrors.length > 0) {
      setError(validationErrors.join(' '));
      return;
    }

    try {
      setAuthMethodsLoading(true);
      setError(null);

      await backendService.auth.linkEmailPassword(newEmail, newPassword);
      console.log('Email/password linked successfully');
      
      // Refresh the profile
      if (fetchProfile && user) {
        await fetchProfile(user as User);
      }
      
      // Update linked providers list
      const providers = backendService.auth.getLinkedProviders();
      setLinkedProviders(providers);
      
      setShowEmailPasswordAdd(false);
      setNewEmail('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: unknown) {
      console.error('Error linking email/password:', err);
      const error = err as { code?: string; message?: string };
      if (error.code === 'auth/email-already-in-use') {
        setError(t('profile.emailAlreadyInUse', 'This email is already registered. Please use a different email.'));
      } else if (error.code === 'auth/invalid-email') {
        setError(t('profile.invalidEmail', 'Invalid email address'));
      } else if (error.code === 'auth/weak-password') {
        setError(t('profile.weakPasswordError', 'New password is too weak. Use at least 8 characters with mixed case, numbers, and symbols.'));
      } else if (error.code === 'auth/requires-recent-login') {
        setError(t('profile.requiresRecentLogin', 'For security, please sign out and sign in again before adding email/password.'));
      } else if (error.code === 'auth/provider-already-linked') {
        setError(t('profile.providerAlreadyLinked', 'Email/password authentication is already linked to this account.'));
      } else {
        setError(error.message || t('common.error', 'Failed to add email/password authentication. Please try again.'));
      }
    } finally {
      setAuthMethodsLoading(false);
    }
  };

  // Handle updating email address
  const handleUpdateEmail = async () => {
    if (!newEmail || !newEmail.trim()) {
      setError(t('profile.emailRequired', 'Email is required'));
      return;
    }

    // Better email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      setError(t('profile.validEmailRequired', 'Please enter a valid email address'));
      return;
    }

    if (!currentPassword) {
      setError(t('profile.currentPasswordRequired', 'Current password is required to update email'));
      return;
    }

    try {
      setAuthMethodsLoading(true);
      setError(null);

      await backendService.auth.updateEmail(currentPassword, newEmail);
      
      setSuccessMessage(t('profile.verificationEmailSent', 'Verification email sent! Please check your new email address and click the link to complete the change.'));
      
      setShowEmailUpdate(false);
      setNewEmail('');
      setCurrentPassword('');
    } catch (err: unknown) {
      console.error('Error updating email:', err);
      const error = err as { code?: string; message?: string };
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
        setError(t('profile.currentPasswordIncorrect', 'Current password is incorrect'));
      } else if (error.code === 'auth/email-already-in-use') {
        setError(t('profile.emailAlreadyInUse', 'This email is already registered. Please use a different email.'));
      } else if (error.code === 'auth/invalid-email') {
        setError(t('profile.invalidEmail', 'Invalid email address'));
      } else if (error.code === 'auth/requires-recent-login') {
        setError(t('profile.requiresRecentLogin', 'For security, please sign out and sign in again before updating your email.'));
      } else {
        setError(error.message || t('common.error', 'Failed to update email. Please try again.'));
      }
    } finally {
      setAuthMethodsLoading(false);
    }
  };

  // Handle updating password
  const handleUpdatePassword = async () => {
    if (!currentPassword) {
      setError(t('profile.currentPasswordRequired', 'Current password is required'));
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError(t('profile.newPasswordsDoNotMatch', 'New passwords do not match'));
      return;
    }

    // Use full password complexity validation like signup
    const validationErrors = validatePasswordComplexity(newPassword);
    if (validationErrors.length > 0) {
      setError(validationErrors.join(' '));
      return;
    }

    if (newPassword === currentPassword) {
      setError(t('profile.newPasswordMustDiffer', 'New password must be different from current password'));
      return;
    }

    try {
      setAuthMethodsLoading(true);
      setError(null);

      await backendService.auth.updatePassword(currentPassword, newPassword);
      
      setSuccessMessage(t('profile.passwordUpdatedSuccess', 'Password updated successfully!'));
      
      setShowPasswordUpdate(false);
      setNewPassword('');
      setConfirmNewPassword('');
      setCurrentPassword('');
    } catch (err: unknown) {
      console.error('Error updating password:', err);
      const error = err as { code?: string; message?: string };
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
        setError(t('profile.currentPasswordIncorrect', 'Current password is incorrect'));
      } else if (error.code === 'auth/weak-password') {
        setError(t('profile.weakPasswordError', 'New password is too weak. Use at least 8 characters with mixed case, numbers, and symbols.'));
      } else if (error.code === 'auth/requires-recent-login') {
        setError(t('profile.requiresRecentLoginPassword', 'For security, please sign out and sign in again before updating your password.'));
      } else {
        setError(error.message || t('common.error', 'Failed to update password. Please try again.'));
      }
    } finally {
      setAuthMethodsLoading(false);
    }
  };

  // Account deletion handler

  if (loading || checkingHardwareKeys) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <Box sx={{ maxWidth: 860, mx: 'auto', px: { xs: 0, sm: 1 }, py: isMobile ? 1 : 3 }}>

        {/* Page header */}
        <Box sx={{ mb: 2 }}>
          <Typography variant={isMobile ? 'h5' : 'h4'} fontWeight="700" gutterBottom>
            {userProfile.displayName}
          </Typography>
          <Typography variant="body2" color="text.secondary">{userProfile.email}</Typography>
        </Box>

        {/* Tab bar */}
        <Tabs
          value={activeTab}
          onChange={(_: React.SyntheticEvent, v: number) => setActiveTab(v)}
          sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
          variant={isMobile ? 'scrollable' : 'standard'}
          scrollButtons="auto"
          allowScrollButtonsMobile
        >
          <Tab
            label={t('profile.tabAccount', 'Account')}
            icon={<Person />}
            iconPosition="start"
            aria-label={t('profile.tabAccount', 'Account')}
            sx={{ minHeight: 48 }}
          />
          <Tab
            label={t('profile.tabSecurity', 'Security')}
            icon={<Security />}
            iconPosition="start"
            aria-label={t('profile.tabSecurity', 'Security')}
            sx={{ minHeight: 48 }}
          />
          <Tab
            label={isMobile ? t('profile.tabData', 'Data') : t('profile.tabDataAndBackups', 'Data & Backups')}
            icon={<Storage />}
            iconPosition="start"
            aria-label={t('profile.tabDataAndBackups', 'Data & Backups')}
            sx={{ minHeight: 48 }}
          />
          <Tab
            label={t('profile.tabPreferences', 'Preferences')}
            icon={<Tune />}
            iconPosition="start"
            aria-label={t('profile.tabPreferences', 'Preferences')}
            sx={{ minHeight: 48 }}
          />
        </Tabs>

        {/* ── TAB 0: ACCOUNT ─────────────────────────────────────────── */}
        {activeTab === 0 && (
          <>
            {/* Account info */}
            <Card elevation={2} sx={{ mb: 3 }}>
              <CardContent sx={{ p: isMobile ? 2 : 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                  <Person sx={{ color: 'primary.main' }} />
                  <Typography variant="h6" fontWeight="600">Account</Typography>
                </Box>
                <Divider sx={{ mb: 2 }} />
                {editMode ? (
                  <Box>
                    <TextField
                      label={t('profile.displayName', 'Display Name')}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      fullWidth
                      margin="normal"
                    />
                    <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                      <Button onClick={() => handleProfileUpdate(user, setMode)} variant="contained">
                        {t('common.save', 'Save')}
                      </Button>
                      <Button onClick={() => setEditMode(false)} variant="outlined">
                        {t('common.cancel', 'Cancel')}
                      </Button>
                    </Box>
                  </Box>
                ) : (
                  <Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 2, mb: 2 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary" textTransform="uppercase" fontWeight="600" letterSpacing={0.5}>
                          {t('profile.displayName', 'Display Name')}
                        </Typography>
                        <Typography variant="body1" sx={{ mt: 0.5 }}>{userProfile.displayName}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" textTransform="uppercase" fontWeight="600" letterSpacing={0.5}>
                          Email
                        </Typography>
                        <Typography variant="body1" sx={{ mt: 0.5 }}>{userProfile.email}</Typography>
                      </Box>
                    </Box>
                    <Button onClick={() => setEditMode(true)} variant="outlined" size="small">
                      {t('profile.editProfile', 'Edit')}
                    </Button>
                  </Box>
                )}
              </CardContent>
            </Card>

            {/* Sign-in methods */}
            <Card elevation={2} sx={{ mb: 3 }}>
              <CardContent sx={{ p: isMobile ? 2 : 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
                  <Typography variant="h6" fontWeight="600">Sign-in Methods</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  How you log in to your account. Nothing to do with decrypting your files.
                </Typography>
                <Divider sx={{ mb: 2 }} />

                {/* Email & Password row */}
                <Box sx={{ display: 'flex', alignItems: 'center', py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Email sx={{ mr: 2, color: linkedProviders.includes('password') ? 'text.secondary' : 'text.disabled', fontSize: 22 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight="600" color={linkedProviders.includes('password') ? 'text.primary' : 'text.secondary'}>
                      Email & Password
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {linkedProviders.includes('password')
                        ? (user?.providerData?.find(p => p.providerId === 'password')?.email || user?.email)
                        : 'Not linked'}
                    </Typography>
                  </Box>
                  {linkedProviders.includes('password') ? (
                    <>
                      <Chip label={t('profile.active', 'Active')} color="success" size="small" sx={{ mr: 1, display: isMobile ? 'none' : 'flex' }} />
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Button size="small" onClick={() => setShowEmailUpdate(true)}>
                          {isMobile ? 'Email' : 'Update Email'}
                        </Button>
                        <Button size="small" onClick={() => setShowPasswordUpdate(true)}>
                          {isMobile ? 'Pass' : 'Update Password'}
                        </Button>
                        {linkedProviders.length > 1 && (
                          <Button size="small" color="error" onClick={() => setConfirmUnlinkProvider('password')}>
                            Remove
                          </Button>
                        )}
                      </Box>
                    </>
                  ) : (
                    <Button size="small" startIcon={<Add />} onClick={() => setShowEmailPasswordAdd(true)} disabled={showEmailPasswordAdd}>
                      Add
                    </Button>
                  )}
                </Box>

                {/* Phone row */}
                <Box sx={{ display: 'flex', alignItems: 'center', py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Phone sx={{ mr: 2, color: linkedProviders.includes('phone') ? 'text.secondary' : 'text.disabled', fontSize: 22 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight="600" color={linkedProviders.includes('phone') ? 'text.primary' : 'text.secondary'}>
                      Phone Number
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {linkedProviders.includes('phone') ? user?.phoneNumber : 'Not linked'}
                    </Typography>
                  </Box>
                  {linkedProviders.includes('phone') ? (
                    <>
                      <Chip label={t('profile.active', 'Active')} color="success" size="small" sx={{ mr: 1, display: isMobile ? 'none' : 'flex' }} />
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Button size="small" onClick={() => setShowPhoneUpdate(true)}>Update</Button>
                        {linkedProviders.length > 1 && (
                          <Button size="small" color="error" onClick={() => setConfirmUnlinkProvider('phone')}>
                            Remove
                          </Button>
                        )}
                      </Box>
                    </>
                  ) : (
                    <Button size="small" startIcon={<Add />} onClick={() => setShowPhoneAdd(true)} disabled={showPhoneAdd}>
                      Add
                    </Button>
                  )}
                </Box>

                {/* OAuth provider rows — one per enabled provider */}
                {ENABLED_OAUTH_PROVIDERS.map(({ providerId, label, icon }) => {
                  const isLinked = linkedProviders.includes(providerId);
                  const providerUser = user?.providerData?.find(p => p.providerId === providerId);
                  const subtitle = isLinked
                    ? (providerUser?.email || providerUser?.displayName || user?.email || 'Linked')
                    : 'Not linked';
                  return (
                    <Box key={providerId} sx={{ display: 'flex', alignItems: 'center', py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                      <Box sx={{ mr: 2, display: 'flex', alignItems: 'center' }}>
                        <OAuthProviderIcon icon={icon} fontSize={22} disabled={!isLinked} />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight="600" color={isLinked ? 'text.primary' : 'text.secondary'}>
                          {label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>{subtitle}</Typography>
                      </Box>
                      {isLinked ? (
                        <>
                          <Chip label={t('profile.active', 'Active')} color="success" size="small" sx={{ mr: 1, display: isMobile ? 'none' : 'flex' }} />
                          {linkedProviders.length > 1 && (
                            <Button size="small" color="error" onClick={() => setConfirmUnlinkProvider(providerId)}>
                              Remove
                            </Button>
                          )}
                        </>
                      ) : (
                        <Button size="small" startIcon={<Add />} onClick={() => handleLinkOAuth(providerId, label)} disabled={authMethodsLoading}>
                          Add
                        </Button>
                      )}
                    </Box>
                  );
                })}

                {/* Phone Add Form */}
                {showPhoneAdd && (
                  <Box sx={{ mt: 2, p: 2.5, borderRadius: 1, border: '1px solid', borderColor: 'primary.main', bgcolor: 'action.hover' }}>
                    <Typography variant="subtitle2" fontWeight="600" gutterBottom>Add Phone Number</Typography>
                    <PhoneAuth onSuccess={handlePhoneAdd} onError={(err) => setError(err)} mode="link" />
                    <Button variant="text" size="small" onClick={() => { setShowPhoneAdd(false); setError(null); }} sx={{ mt: 1 }}>
                      {t('common.cancel', 'Cancel')}
                    </Button>
                  </Box>
                )}

                {/* Email/Password Add Form */}
                {showEmailPasswordAdd && (
                  <Box sx={{ mt: 2, p: 2.5, borderRadius: 1, border: '1px solid', borderColor: 'primary.main', bgcolor: 'action.hover' }}>
                    <Typography variant="subtitle2" fontWeight="600" gutterBottom>Add Email & Password</Typography>
                    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
                    <TextField fullWidth label={t('profile.newEmailAddress', 'Email Address')} type="email" value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)} disabled={authMethodsLoading} sx={{ mb: 2 }} />
                    <TextField fullWidth label={t('auth.password', 'Password')} type="password" value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)} disabled={authMethodsLoading} sx={{ mb: 1 }} />
                    {newPassword && <><PasswordStrengthIndicator password={newPassword} /><PasswordRequirements password={newPassword} /></>}
                    <TextField fullWidth label={t('auth.confirmPassword', 'Confirm Password')} type="password" value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)} disabled={authMethodsLoading} sx={{ mb: 2 }} />
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button variant="contained" onClick={handleAddEmailPassword}
                        disabled={authMethodsLoading || !newEmail || !newPassword || !confirmNewPassword}>
                        {authMethodsLoading ? 'Adding...' : 'Add Email & Password'}
                      </Button>
                      <Button variant="outlined" onClick={() => { setShowEmailPasswordAdd(false); setNewEmail(''); setNewPassword(''); setConfirmNewPassword(''); setError(null); }}
                        disabled={authMethodsLoading}>
                        {t('common.cancel', 'Cancel')}
                      </Button>
                    </Box>
                  </Box>
                )}

                {/* Email Update Form */}
                {showEmailUpdate && (
                  <Box sx={{ mt: 2, p: 2.5, borderRadius: 1, border: '1px solid', borderColor: 'primary.main', bgcolor: 'action.hover' }}>
                    <Typography variant="subtitle2" fontWeight="600" gutterBottom>Update Email Address</Typography>
                    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
                    <Alert severity="info" sx={{ mb: 2 }}>
                      A verification link will be sent to your new address. Click it to confirm the change.
                    </Alert>
                    <TextField fullWidth label={t('profile.newEmailAddress', 'New Email Address')} type="email" value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)} disabled={authMethodsLoading} sx={{ mb: 2 }} />
                    <TextField fullWidth label={t('profile.currentPassword', 'Current Password')} type="password" value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)} disabled={authMethodsLoading} sx={{ mb: 2 }}
                      helperText={t('profile.currentPasswordHelper', 'Required to verify your identity')} />
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button variant="contained" onClick={handleUpdateEmail} disabled={authMethodsLoading || !newEmail || !currentPassword}>
                        {authMethodsLoading ? 'Updating...' : 'Update Email'}
                      </Button>
                      <Button variant="outlined" onClick={() => { setShowEmailUpdate(false); setNewEmail(''); setCurrentPassword(''); setError(null); }}
                        disabled={authMethodsLoading}>
                        {t('common.cancel', 'Cancel')}
                      </Button>
                    </Box>
                  </Box>
                )}

                {/* Password Update Form */}
                {showPasswordUpdate && (
                  <Box sx={{ mt: 2, p: 2.5, borderRadius: 1, border: '1px solid', borderColor: 'primary.main', bgcolor: 'action.hover' }}>
                    <Typography variant="subtitle2" fontWeight="600" gutterBottom>Update Password</Typography>
                    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
                    <TextField fullWidth label={t('profile.currentPassword', 'Current Password')} type="password" value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)} disabled={authMethodsLoading} sx={{ mb: 2 }} />
                    <TextField fullWidth label={t('profile.newPassword', 'New Password')} type="password" value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)} disabled={authMethodsLoading} sx={{ mb: 1 }} />
                    {newPassword && <><PasswordStrengthIndicator password={newPassword} /><PasswordRequirements password={newPassword} /></>}
                    <TextField fullWidth label={t('profile.confirmNewPassword', 'Confirm New Password')} type="password" value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)} disabled={authMethodsLoading} sx={{ mb: 2 }} />
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button variant="contained" onClick={handleUpdatePassword}
                        disabled={authMethodsLoading || !currentPassword || !newPassword || !confirmNewPassword}>
                        {authMethodsLoading ? 'Updating...' : 'Update Password'}
                      </Button>
                      <Button variant="outlined" onClick={() => { setShowPasswordUpdate(false); setNewPassword(''); setConfirmNewPassword(''); setCurrentPassword(''); setError(null); }}
                        disabled={authMethodsLoading}>
                        {t('common.cancel', 'Cancel')}
                      </Button>
                    </Box>
                  </Box>
                )}

                {/* Phone Update Form */}
                {showPhoneUpdate && (
                  <Box sx={{ mt: 2, p: 2.5, borderRadius: 1, border: '1px solid', borderColor: 'primary.main', bgcolor: 'action.hover' }}>
                    <Typography variant="subtitle2" fontWeight="600" gutterBottom>Update Phone Number</Typography>
                    <PhoneAuth onSuccess={handlePhoneUpdate} onError={(err) => setError(err)} mode="link" />
                    <Button variant="text" size="small" onClick={() => { setShowPhoneUpdate(false); setError(null); }} sx={{ mt: 1 }}>
                      {t('common.cancel', 'Cancel')}
                    </Button>
                  </Box>
                )}
              </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card elevation={2} sx={{ mb: 3, border: '2px solid', borderColor: 'error.main' }}>
              <CardContent sx={{ p: isMobile ? 2 : 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                  <DeleteForever sx={{ color: 'error.main' }} />
                  <Typography variant="h6" fontWeight="600" color="error">Delete Account</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Permanently and irreversibly deletes all your files, forms, and account data. There is no undo.
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Button variant="contained" color="error" startIcon={<DeleteForever />}
                  onClick={() => setDeleteDialogOpen(true)}>
                  Delete My Account
                </Button>
              </CardContent>
            </Card>
          </>
        )}

        {/* ── TAB 1: SECURITY ──────────────────────────────────────── */}
        {activeTab === 1 && (
          <>
            {/* Biometric setup */}
            <Card elevation={2} sx={{ mb: 3 }} id="biometric">
              <CardContent sx={{ p: isMobile ? 2 : 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                  <Fingerprint sx={{ color: 'primary.main' }} />
                  <Typography variant="h6" fontWeight="600">Biometric Device Unlock</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Use fingerprint, face scan, or device PIN to unlock SeraVault faster on this device.
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <BiometricSetup />
              </CardContent>
            </Card>

            {/* Hardware keys */}
            <Card elevation={2} sx={{ mb: 3 }}>
              <CardContent sx={{ p: isMobile ? 2 : 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                  <VpnKey sx={{ color: 'primary.main' }} />
                  <Typography variant="h6" fontWeight="600">Hardware Security Keys</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Register and manage hardware keys like YubiKey for phishing-resistant unlock. Register on each device you want to use.
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <HardwareKeySetup onEncryptedKeyChange={() => { if (user) fetchProfile(user as User); }} />
              </CardContent>
            </Card>

            {/* Passphrase & Key Management */}
            <Card elevation={2} sx={{ mb: 3 }}>
              <CardContent sx={{ p: isMobile ? 2 : 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                  <VpnKey sx={{ color: 'warning.main' }} />
                  <Typography variant="h6" fontWeight="600">Secret Passphrase</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Your passphrase is what keeps your files private — only you know it and we never store it. Download a recovery key so you can regain access if you forget it.
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <KeyManagementSection
                  userProfile={userProfile}
                  privateKey={privateKey}
                  onDownloadKey={() => handleDownloadKey(userProfile, setError)}
                  onDownloadDecryptedKey={() => setShowDecryptedKeyWarning(true)}
                />
              </CardContent>
            </Card>

            {/* Device capabilities — collapsed by default */}
            <Accordion sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderRadius: 1, '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Info sx={{ color: 'text.secondary', fontSize: 18 }} />
                  <Typography variant="body2" fontWeight="500">
                    {t('profile.deviceCapabilities', 'Device Capabilities')}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <DeviceCapabilityInfo />
              </AccordionDetails>
            </Accordion>
          </>
        )}

        {/* ── TAB 2: DATA & BACKUPS ──────────────────────────────────── */}
        {activeTab === 2 && (
          <>
            {/* Export */}
            <Card elevation={2} sx={{ mb: 3 }}>
              <CardContent sx={{ p: isMobile ? 2 : 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                  <Download sx={{ color: 'primary.main' }} />
                  <Typography variant="h6" fontWeight="600">Export Your Data</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Download all your files and forms as a decrypted ZIP. You can re-import this ZIP later and everything will be re-encrypted with your passphrase.
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Button variant="contained" startIcon={<Download />} onClick={() => setExportDialogOpen(true)}
                  disabled={!privateKey}>
                  Export All Data
                </Button>
                {!privateKey && (
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                    Unlock your private key first to export.
                  </Typography>
                )}
              </CardContent>
            </Card>

            {/* Import */}
            <Card elevation={2} sx={{ mb: 3 }}>
              <CardContent sx={{ p: isMobile ? 2 : 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                  <Download sx={{ color: 'primary.main', transform: 'rotate(180deg)' }} />
                  <Typography variant="h6" fontWeight="600">Import Data</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Restore from a previously exported backup file.
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <JsonImport />
              </CardContent>
            </Card>

          </>
        )}

        {/* ── TAB 3: PREFERENCES ─────────────────────────────────────── */}
        {activeTab === 3 && (
          <>
            {/* Appearance */}
            <Card elevation={2} sx={{ mb: 3 }}>
              <CardContent sx={{ p: isMobile ? 2 : 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                  <Tune sx={{ color: 'primary.main' }} />
                  <Typography variant="h6" fontWeight="600">Appearance</Typography>
                </Box>
                <Divider sx={{ mb: 2 }} />
                <FormControlLabel
                  control={<Switch checked={theme === 'dark'} onChange={async (e) => {
                    const newTheme = e.target.checked ? 'dark' : 'light';
                    setTheme(newTheme);
                    setMode(newTheme);
                    if (user && userProfile) {
                      const { createUserProfile } = await import('../firestore');
                      await createUserProfile(user.uid, { ...userProfile, displayName, theme: newTheme });
                    }
                  }} />}
                  label={t('common.darkTheme', 'Dark Theme')}
                />
              </CardContent>
            </Card>

            <NotificationSettings />

            <Card elevation={2} sx={{ mb: 3, mt: 3 }}>
              <CardContent sx={{ p: isMobile ? 2 : 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                  <Refresh sx={{ color: 'primary.main' }} />
                  <Typography variant="h6" fontWeight="600">App Updates & Cache</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  If the app is not updating or features aren't working correctly, clear the cache and reload the latest version.
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <strong>Warning:</strong> This will sign you out and reload the app. Make sure you have your passphrase saved.
                </Alert>
                <Button variant="contained" color="primary" startIcon={<Refresh />} onClick={handleForceClearCache} size="large">
                  Force Clear Cache & Update
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                  Version {localStorage.getItem('app_version') ?? '—'}
                </Typography>
              </CardContent>
            </Card>
          </>
        )}

      </Box>

      {/* ── DIALOGS ─────────────────────────────────────────────────── */}
      <ExportDataDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        onConfirm={handleExportData}
      />

      <DecryptedKeyWarningDialog
        open={showDecryptedKeyWarning}
        onClose={() => setShowDecryptedKeyWarning(false)}
        onConfirm={handleConfirmDecryptedKeyDownload}
      />

      <DeleteAccountDialog
        open={deleteDialogOpen}
        userEmail={userProfile?.email || ''}
        onClose={() => { setDeleteDialogOpen(false); setDeletionProgress(null); }}
        onConfirm={handleDeleteAccount}
        progress={deletionProgress}
      />

      {/* Account deleted confirmation — shown after successful deletion */}
      <Dialog open={accountDeletedDialogOpen} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircle color="success" />
          Account Deleted
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Your account and all associated data have been permanently deleted.
            Thank you for using SeraVault.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => { window.location.href = 'https://www.seravault.com'; }}
          >
            Go to SeraVault.com
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!successMessage}
        autoHideDuration={6000}
        onClose={() => setSuccessMessage('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSuccessMessage('')} severity="success" sx={{ width: '100%' }}>
          {successMessage}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!error && !showEmailPasswordAdd && !showEmailUpdate && !showPasswordUpdate}
        autoHideDuration={8000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setError(null)} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>

      <Dialog open={!!confirmUnlinkProvider} onClose={() => setConfirmUnlinkProvider(null)}>
        <DialogTitle>Remove Sign-in Method</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmUnlinkProvider === 'password' && 'Are you sure you want to remove email/password sign-in? You will still be able to sign in with your other methods.'}
            {confirmUnlinkProvider === 'phone' && 'Are you sure you want to remove phone sign-in? You will still be able to sign in with your other methods.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmUnlinkProvider(null)}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={() => confirmUnlinkProvider && handleUnlinkProvider(confirmUnlinkProvider)}
            color="error" variant="contained" disabled={authMethodsLoading}>
            {authMethodsLoading ? 'Removing...' : t('common.remove', 'Remove')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ProfilePage;
