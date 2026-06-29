import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { unlockWithPassphrase, trySilentDeviceUnlock } from '../services/unlockOrchestrator';
import { usePrivateKeyStorage } from '../utils/secureStorage';
import BiometricPassphraseDialog from '../components/BiometricPassphraseDialog';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, CircularProgress, Alert } from '@mui/material';
import { Fingerprint, CheckCircle } from '@mui/icons-material';
import { useLocation } from 'react-router-dom';
import {
  hasBiometricSetup,
  isBiometricAvailable,
  probePrfSupport,
  registerBiometric,
  storeBiometricEncryptedKey,
  storeBiometricCredential,
} from '../utils/biometricAuth';
import { getUserProfile, updateUserProfile, clearUserProfileCache } from '../firestore';
import { clearFileKeyCache } from '../services/fileKeyCache';
import { getDeviceId } from '../utils/deviceId';

interface PassphraseContextType {
  privateKey: string | null;
  setPrivateKey: (key: string | null) => void;
  clearPrivateKey: () => void;
  hasStoredKey: boolean;
  loading: boolean;
  requestUnlock: () => void;
  refreshPrivateKey: () => void;
  unlockWithPassphrase: (passphrase: string) => Promise<void>;
}

const PassphraseContext = createContext<PassphraseContextType>({
  privateKey: null,
  setPrivateKey: () => {},
  clearPrivateKey: () => {},
  hasStoredKey: false,
  loading: false,
  requestUnlock: () => {},
  refreshPrivateKey: () => {},
  unlockWithPassphrase: async () => {},
});

const PassphraseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();

  // Pages where decryption is not needed — don't auto-prompt the unlock dialog
  const DECRYPTION_NOT_REQUIRED = ['/subscription', '/help', '/support', '/profile', '/setup'];
  const requiresDecryption = !DECRYPTION_NOT_REQUIRED.some(p => location.pathname.startsWith(p));
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [passphraseDialogOpen, setPassphraseDialogOpen] = useState(false);
  const [userRequestedUnlock, setUserRequestedUnlock] = useState(false);
  const [userDismissed, setUserDismissed] = useState(false);
  const [biometricPromptOpen, setBiometricPromptOpen] = useState(false);
  const [biometricSetupBusy, setBiometricSetupBusy] = useState(false);
  const [biometricSetupError, setBiometricSetupError] = useState<string | null>(null);
  const [biometricSetupDone, setBiometricSetupDone] = useState(false);
  // In-memory flag: once the user dismisses the biometric prompt in this
  // browser session, don't show it again until they reload the app.
  const [biometricPromptSessionDismissed, setBiometricPromptSessionDismissed] = useState(false);

  // Ref so the checkPrivateKey effect doesn't re-run every time the dialog
  // opens/closes (which would re-fire Firestore reads unnecessarily).
  const passphraseDialogOpenRef = useRef(passphraseDialogOpen);
  useEffect(() => { passphraseDialogOpenRef.current = passphraseDialogOpen; }, [passphraseDialogOpen]);
  const {
    storePrivateKey,
    getStoredPrivateKey,
    clearStoredPrivateKey,
    hasStoredPrivateKey,
    onPrivateKeyTimeout,
    removePrivateKeyTimeoutCallback,
    clearAllUserKeys,
  } = usePrivateKeyStorage(user?.uid);

  useEffect(() => {
    const checkPrivateKey = async () => {
      if (!user) {
        setPrivateKey(null);
        // Don't clear keys here - only clear on explicit logout
        // This prevents clearing keys during auth initialization when user is temporarily null
        setLoading(false);
        setUserDismissed(false);
        return;
      }
      
      // If user dismissed the dialog, don't re-check or re-open
      if (userDismissed) {
        setLoading(false);
        return;
      }
      
      if (user && !privateKey) {
        // Try to get from secure storage first - check this BEFORE setting loading
        const storedKey = getStoredPrivateKey();
        if (storedKey) {
          setPrivateKey(storedKey);
          setLoading(false);
          return;
        }
        
        setLoading(true);

        // Check if user has a profile with keys before showing unlock dialog
        try {
          const profile = await getUserProfile(user.uid);
          if (!profile || !profile.publicKey) {
            // User doesn't have a public key yet (likely on profile creation page)
            setLoading(false);
            return;
          }

          // Check if user has passphrase-protected keys OR hardware keys with stored private keys
          const hasPassphraseProtectedKey = profile.encryptedPrivateKey;
          let hasHardwareKeys = false;

          // Always check for hardware keys
          try {
            const { getRegisteredHardwareKeys } = await import('../utils/hardwareKeyAuth');
            const hardwareKeys = await getRegisteredHardwareKeys(user.uid);
            hasHardwareKeys = hardwareKeys.length > 0;
          } catch {
            // Silent error handling
          }

          // If user has neither passphrase-protected key nor hardware keys, they have no way to unlock
          if (!hasPassphraseProtectedKey && !hasHardwareKeys) {
            setLoading(false);
            return;
          }
        } catch {
          setLoading(false);
          return;
        }

        // ── Silent PRF auto-unlock ──────────────────────────────────────────
        // If this device has a PRF credential, attempt to decrypt the private
        // key without showing any UI. On most platforms (iOS Face ID, Android
        // fingerprint, Windows Hello) the OS resolves the WebAuthn challenge
        // silently when the device is already unlocked — the user just opens
        // the app and everything works, 1Password-style.
        //
        // If the authenticator requires a gesture (some configurations) the
        // browser will show its native prompt. Either way, no passphrase dialog.
        // Fall through to the dialog only if PRF is unavailable or fails.
        try {
          const decryptedKey = await trySilentDeviceUnlock(user.uid);
          if (decryptedKey) {
            setPrivateKey(decryptedKey);
            storePrivateKey(decryptedKey, true);
            setLoading(false);
            return;
          }
        } catch {
          // PRF not available or authenticator rejected — fall through to dialog
        }

        // If no stored key and user has keys, show passphrase dialog
        // Only open if not already dismissed and no private key
        if (!privateKey && !passphraseDialogOpenRef.current) {
          setLoading(false);
          setPassphraseDialogOpen(true);
        } else {
          setLoading(false);
        }
      } else if (privateKey) {
        // We have a private key - ensure dialog is closed and loading is off
        setLoading(false);
        setPassphraseDialogOpen(false);
      }
    };
    checkPrivateKey();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, privateKey, userDismissed]);

  // Simple refresh function that can be called directly
  const refreshPrivateKey = () => {
    if (user) {
      const storedKey = getStoredPrivateKey();
      if (storedKey) {
        setPrivateKey(storedKey);
        setUserDismissed(false);
      } else {
        setPrivateKey(null);
        setPassphraseDialogOpen(true);
      }
    }
  };

  // Handle session timeout - clear decrypted data and show auth dialog
  useEffect(() => {
    if (!user || !privateKey) return;

    const handleTimeout = () => {
      // Clear the private key from state
      setPrivateKey(null);
      // Reset dismissal state and show passphrase dialog again
      setUserDismissed(false);
      setPassphraseDialogOpen(true);
      // Broadcast timeout event for other components to clean up
      window.dispatchEvent(new CustomEvent('sessionTimeout', {
        detail: { reason: 'privateKeyTimeout' }
      }));
    };

    // Register timeout callback
    onPrivateKeyTimeout(handleTimeout);

    // Cleanup on unmount or dependency change
    return () => {
      removePrivateKeyTimeoutCallback(handleTimeout);
    };
  }, [user, privateKey, onPrivateKeyTimeout, removePrivateKeyTimeoutCallback]);

  const clearPrivateKey = () => {
    setPrivateKey(null);
    clearStoredPrivateKey();
    clearFileKeyCache();
    setUserDismissed(false);
    setPassphraseDialogOpen(true);
  };

  const handlePassphraseSubmit = async (passphraseOrPrivateKey: string, rememberChoice = false, method: 'passphrase' | 'biometric' | 'keyfile' | 'hardware' = 'passphrase') => {
    setLoading(true);
    
    if (!user) {
      setLoading(false);
      throw new Error('User not authenticated');
    }
    
    try {
      let decryptedPrivateKey: string;
      
      if (method === 'biometric' || method === 'keyfile' || method === 'hardware') {
        // Private key is already decrypted
        decryptedPrivateKey = passphraseOrPrivateKey;
      } else {
        decryptedPrivateKey = await unlockWithPassphrase(user.uid, passphraseOrPrivateKey);
      }
      
      setPrivateKey(decryptedPrivateKey);
      storePrivateKey(decryptedPrivateKey, rememberChoice);
      setLoading(false);
      setPassphraseDialogOpen(false);
      setUserRequestedUnlock(false);
      setUserDismissed(true); // Mark as dismissed to prevent reopening
      
      // Check if we should prompt for biometric setup (any method except biometric itself)
      if (method !== 'biometric') {
        try {
          // Respect session dismissal first — the user already said "Not Now"
          // since the app loaded; don't pester them again this session.
          if (biometricPromptSessionDismissed) return;

          const deviceId = getDeviceId();
          // Local fast-path cache (may be wiped by PWA storage policies).
          const dismissedLocal = localStorage.getItem(`biometric_prompt_dismissed_${user.uid}`) === 'true';
          const snoozedLocalUntil = parseInt(localStorage.getItem(`biometric_prompt_snoozed_until_${user.uid}`) || '0', 10);

          // Firestore: per-device authoritative source. Survives storage clears
          // on this device (e.g. iOS 7-day eviction) but does NOT leak the
          // dismissal to other devices the user owns.
          let dismissedRemote = false;
          let snoozedRemoteUntil = 0;
          try {
            const profile = await getUserProfile(user.uid);
            const entry = profile?.biometricPromptDismissedDevices?.[deviceId];
            dismissedRemote = entry?.dismissed === true;
            snoozedRemoteUntil = entry?.snoozedUntil || 0;
          } catch { /* offline — fall back to local only */ }

          // Self-heal: if Firestore says dismissed for this device but local
          // cache was wiped, restore the local cache.
          if (dismissedRemote && !dismissedLocal) {
            try { localStorage.setItem(`biometric_prompt_dismissed_${user.uid}`, 'true'); } catch { /* quota */ }
          }
          if (snoozedRemoteUntil > snoozedLocalUntil) {
            try { localStorage.setItem(`biometric_prompt_snoozed_until_${user.uid}`, String(snoozedRemoteUntil)); } catch { /* quota */ }
          }

          if (dismissedLocal || dismissedRemote) return;

          const snoozedUntil = Math.max(snoozedLocalUntil, snoozedRemoteUntil);
          if (snoozedUntil && Date.now() < snoozedUntil) return;

          // Only prompt if the device actually has a platform authenticator (Face ID, Touch ID, Windows Hello, etc.)
          const bioAvailable = await isBiometricAvailable();
          if (!bioAvailable) return;

          // And only prompt if the browser can actually complete PRF setup.
          // 'unsupported' means we KNOW it will fail; skip silently so we
          // don't waste a fingerprint touch on a guaranteed dead end.
          // 'unknown' (older browsers without getClientCapabilities) still
          // gets the prompt — we'll only learn the truth by trying.
          if (await probePrfSupport() === 'unsupported') return;

          if (!(await hasBiometricSetup(user.uid))) {
            setBiometricPromptOpen(true);
          }
        } catch {
          // Silent error handling
        }
      }
      
      // Metadata preloading is now handled by MetadataContext
    } catch (error) {
      setLoading(false);
      throw error; // Re-throw so dialog can handle the error
    }
  };

  const handleDialogClose = () => {
    setPassphraseDialogOpen(false);
    setUserRequestedUnlock(false);
    setUserDismissed(true);
  };

  const requestUnlock = () => {
    setUserDismissed(false);
    setUserRequestedUnlock(true);
    setPassphraseDialogOpen(true);
  };

  const unlockWithPassphraseContext = async (passphrase: string) => {
    await handlePassphraseSubmit(passphrase, false, 'passphrase');
  };

  // Inline one-tap biometric setup — runs from the post-unlock prompt so the
  // user never has to navigate to Profile > Privacy. Uses the just-unlocked
  // private key in memory and a single WebAuthn create() call (PRF-at-create).
  const handleInlineBiometricSetup = async () => {
    if (!user || !privateKey) {
      setBiometricSetupError('Your private key is no longer unlocked. Please reopen the app and try again.');
      return;
    }
    setBiometricSetupBusy(true);
    setBiometricSetupError(null);
    try {
      const { credentialId, prfOutput } = await registerBiometric(
        user.uid,
        // WebAuthn `user.name` — canonical account identifier (email preferred).
        user.email || user.uid,
        // WebAuthn `user.displayName` — human-friendly label.
        user.displayName || user.email || 'SeraVault user'
      );
      storeBiometricCredential(user.uid, credentialId);
      await storeBiometricEncryptedKey(privateKey, credentialId, user.uid, prfOutput);
      setBiometricSetupDone(true);
      // Auto-close after a brief confirmation
      setTimeout(() => {
        setBiometricPromptOpen(false);
        setBiometricSetupDone(false);
      }, 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Biometric setup failed';
      // User-cancelled the system prompt — quietly close without an error.
      if (/NotAllowed|cancel|aborted/i.test(msg)) {
        setBiometricPromptOpen(false);
      } else {
        setBiometricSetupError(msg);
      }
    } finally {
      setBiometricSetupBusy(false);
    }
  };

  const setPrivateKeyAndDismiss = (key: string | null) => {
    setPrivateKey(key);
    if (key) setUserDismissed(true);
  };

  return (
    <PassphraseContext.Provider value={{
      privateKey,
      setPrivateKey: setPrivateKeyAndDismiss,
      clearPrivateKey,
      hasStoredKey: hasStoredPrivateKey(),
      loading,
      requestUnlock,
      refreshPrivateKey,
      unlockWithPassphrase: unlockWithPassphraseContext,
    }}>
      {children}
      <BiometricPassphraseDialog
        open={passphraseDialogOpen && (requiresDecryption || userRequestedUnlock)}
        onClose={handleDialogClose}
        onSubmit={handlePassphraseSubmit}
      />
      
      {/* Device Unlock Setup Prompt Dialog — one-tap inline setup */}
      <Dialog
        open={biometricPromptOpen}
        onClose={() => {
          if (biometricSetupBusy) return; // don't dismiss while a system prompt is open
          // Closing via backdrop / Escape == "Not Now" (snooze for this session)
          setBiometricPromptOpen(false);
          setBiometricPromptSessionDismissed(true);
          setBiometricSetupError(null);
          setBiometricSetupDone(false);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Fingerprint color="primary" />
            Skip the passphrase next time?
          </Box>
        </DialogTitle>
        <DialogContent>
          {biometricSetupDone ? (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <CheckCircle color="success" sx={{ fontSize: 56, mb: 1 }} />
              <Typography variant="h6">You're all set</Typography>
              <Typography variant="body2" color="text.secondary">
                Next time, just use your fingerprint, face, or device PIN.
              </Typography>
            </Box>
          ) : (
            <>
              <Typography variant="body1" gutterBottom>
                Unlock SeraVault with your fingerprint, face scan, or device PIN —
                the same way you unlock your phone.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Your passphrase still works as a backup. Your files stay just as secure.
              </Typography>
              {biometricSetupError && (
                <Alert severity="error" sx={{ mt: 2 }}>{biometricSetupError}</Alert>
              )}
            </>
          )}
        </DialogContent>
        {!biometricSetupDone && (
          <DialogActions sx={{ flexWrap: 'wrap', justifyContent: 'space-between', px: 3, pb: 2 }}>
            <Button
              size="small"
              onClick={() => {
                if (user) {
                  const deviceId = getDeviceId();
                  // Local cache (fast subsequent reads on this device)
                  try { localStorage.setItem(`biometric_prompt_dismissed_${user.uid}`, 'true'); } catch { /* ignore */ }
                  // Durable per-device persistence — fire-and-forget.
                  // Use dotted-path field write so we don't overwrite other devices' entries.
                  updateUserProfile(user.uid, {
                    [`biometricPromptDismissedDevices.${deviceId}`]: {
                      dismissed: true,
                      updatedAt: Date.now(),
                    },
                  } as any)
                    .then(() => clearUserProfileCache())
                    .catch(err => console.warn('[PassphraseContext] Failed to persist dismissal to Firestore:', err));
                }
                setBiometricPromptOpen(false);
                setBiometricPromptSessionDismissed(true);
                setBiometricSetupError(null);
              }}
              disabled={biometricSetupBusy}
              sx={{ color: 'text.secondary' }}
            >
              Don't ask again
            </Button>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                onClick={() => {
                  // "Not Now" = snooze for 3 days + don't reopen this session
                  if (user) {
                    const deviceId = getDeviceId();
                    const snoozedUntil = Date.now() + 3 * 24 * 60 * 60 * 1000;
                    try {
                      localStorage.setItem(
                        `biometric_prompt_snoozed_until_${user.uid}`,
                        String(snoozedUntil)
                      );
                    } catch { /* ignore */ }
                    updateUserProfile(user.uid, {
                      [`biometricPromptDismissedDevices.${deviceId}`]: {
                        snoozedUntil,
                        updatedAt: Date.now(),
                      },
                    } as any)
                      .then(() => clearUserProfileCache())
                      .catch(err => console.warn('[PassphraseContext] Failed to persist snooze to Firestore:', err));
                  }
                  setBiometricPromptOpen(false);
                  setBiometricPromptSessionDismissed(true);
                  setBiometricSetupError(null);
                }}
                disabled={biometricSetupBusy}
              >
                Not Now
              </Button>
              <Button
                variant="contained"
                size="large"
                onClick={handleInlineBiometricSetup}
                disabled={biometricSetupBusy}
                startIcon={biometricSetupBusy
                  ? <CircularProgress size={18} color="inherit" />
                  : <Fingerprint />}
              >
                {biometricSetupBusy ? 'Setting up…' : 'Enable'}
              </Button>
            </Box>
          </DialogActions>
        )}
      </Dialog>
    </PassphraseContext.Provider>
  );
};

export const usePassphrase = () => useContext(PassphraseContext);
export { PassphraseProvider, PassphraseContext };
