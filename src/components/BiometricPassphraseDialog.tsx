import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControlLabel,
  Checkbox,
  Alert,
  Typography,
  Box,
  CircularProgress,
  Divider,
  Collapse,
  IconButton,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Lock,
  Timer,
  Fingerprint,
  VpnKey,
  Logout,
  Upload,
  Key,
  ExpandMore,
  ExpandLess,
  ContentCopy,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import {
  getAvailableUnlockMethods,
  unlockWithBiometric,
  unlockWithHardware,
  type UnlockMethod,
} from '../services/unlockOrchestrator';

interface BiometricPassphraseDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (privateKey: string, rememberChoice: boolean, method: 'passphrase' | 'biometric' | 'keyfile' | 'hardware') => Promise<void>;
}

// ─── Primary method panels ────────────────────────────────────────────────────

const HardwareKeyPanel: React.FC<{ loading: boolean; onAuth: () => void; isPlatform?: boolean }> = ({ loading, onAuth, isPlatform }) => (
  <Box sx={{ textAlign: 'center', py: 2 }}>
    {isPlatform
      ? <Fingerprint sx={{ fontSize: 56, color: 'primary.main', mb: 1.5 }} />
      : <Key sx={{ fontSize: 56, color: 'primary.main', mb: 1.5 }} />
    }
    <Typography variant="h6" gutterBottom>
      {isPlatform ? 'Unlock with your device' : 'Insert your security key'}
    </Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
      {isPlatform
        ? 'Use your fingerprint, face scan, or device PIN to unlock your encrypted files.'
        : 'Insert your hardware key (YubiKey, etc.) and touch it when prompted.'}
    </Typography>
    <Button
      variant="contained"
      size="large"
      startIcon={loading ? <CircularProgress size={16} color="inherit" /> : isPlatform ? <Fingerprint /> : <Key />}
      onClick={onAuth}
      disabled={loading}
      sx={{ minWidth: 180 }}
    >
      {loading ? (isPlatform ? 'Verifying…' : 'Waiting for key…') : isPlatform ? 'Unlock with Device' : 'Use Hardware Key'}
    </Button>
  </Box>
);

const BiometricPanel: React.FC<{ loading: boolean; onAuth: () => void }> = ({ loading, onAuth }) => (
  <Box sx={{ textAlign: 'center', py: 2 }}>
    <Fingerprint sx={{ fontSize: 56, color: 'primary.main', mb: 1.5 }} />
    <Typography variant="h6" gutterBottom>Verify with biometrics</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
      Use Face ID, fingerprint, or your device PIN to unlock.
    </Typography>
    <Button
      variant="contained"
      size="large"
      startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Fingerprint />}
      onClick={onAuth}
      disabled={loading}
      sx={{ minWidth: 180 }}
    >
      {loading ? 'Authenticating…' : 'Unlock with Biometrics'}
    </Button>
  </Box>
);

const PassphrasePanel: React.FC<{
  passphrase: string;
  rememberChoice: boolean;
  loading: boolean;
  showBiometricHint?: boolean;
  onChange: (v: string) => void;
  onRememberChange: (v: boolean) => void;
  onSubmit: () => void;
}> = ({ passphrase, rememberChoice, loading, showBiometricHint, onChange, onRememberChange, onSubmit }) => {
  const { t } = useTranslation();
  return (
  <Box>
    <Box sx={{ textAlign: 'center', mb: 2 }}>
      <VpnKey sx={{ fontSize: 48, color: 'primary.main' }} />
    </Box>
    <TextField
      autoFocus
      margin="dense"
      label={t('passphrase.yourPassword', 'Your password')}
      type="password"
      fullWidth
      variant="outlined"
      value={passphrase}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && !loading && passphrase.trim() && onSubmit()}
      disabled={loading}
      helperText={t('passphrase.passphraseHelper', 'This is the passphrase you set when you created your account.')}
      sx={{ mb: 2 }}
    />
    {showBiometricHint && (
      <Alert severity="info" icon={<Fingerprint />} sx={{ mb: 2 }}>
        Tip: After unlocking, you can enable fingerprint, Face ID, or device PIN
        so you don't have to type this every time.
      </Alert>
    )}
    <FormControlLabel
      control={
        <Checkbox
          checked={rememberChoice}
          onChange={(e) => onRememberChange(e.target.checked)}
          disabled={loading}
        />
      }
      label={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Timer fontSize="small" />
          <Typography variant="body2">Keep unlocked longer (1 hour vs 15 minutes)</Typography>
        </Box>
      }
    />
  </Box>
  );
};

const KeyFilePanel: React.FC<{
  selectedFile: File | null;
  filePassphrase: string;
  rememberChoice: boolean;
  loading: boolean;
  onFileChange: (f: File | null) => void;
  onPassphraseChange: (v: string) => void;
  onRememberChange: (v: boolean) => void;
}> = ({ selectedFile, filePassphrase, rememberChoice, loading, onFileChange, onPassphraseChange, onRememberChange }) => {
  const { t } = useTranslation();
  return (
  <Box>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
      Upload an encrypted or decrypted key backup file (.json) or a plain-text private key (64 hex chars).
    </Typography>
    <input
      accept=".json,.txt,.key,application/json,text/plain"
      style={{ display: 'none' }}
      id="key-file-input"
      type="file"
      onChange={(e) => onFileChange(e.target.files?.[0] || null)}
    />
    <label htmlFor="key-file-input">
      <Button variant="outlined" component="span" startIcon={<Upload />} disabled={loading} sx={{ mb: 2 }}>
        {selectedFile ? `Selected: ${selectedFile.name}` : 'Choose Key File'}
      </Button>
    </label>
    {selectedFile && (
      <>
        <TextField
          margin="dense"
          label={t('passphrase.passphraseIfEncrypted', 'Passphrase (if encrypted)')}
          type="password"
          fullWidth
          variant="outlined"
          value={filePassphrase}
          onChange={(e) => onPassphraseChange(e.target.value)}
          disabled={loading}
          sx={{ mb: 2 }}
          helperText={t('passphrase.onlyForEncryptedKeys', 'Only required for encrypted key files.')}
        />
        <FormControlLabel
          control={
            <Checkbox checked={rememberChoice} onChange={(e) => onRememberChange(e.target.checked)} disabled={loading} />
          }
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Timer fontSize="small" />
              <Typography variant="body2">Keep unlocked longer (1 hour vs 15 minutes)</Typography>
            </Box>
          }
        />
      </>
    )}
  </Box>
  );
};

// ─── Main dialog ──────────────────────────────────────────────────────────────

const BiometricPassphraseDialog: React.FC<BiometricPassphraseDialogProps> = ({
  open,
  onClose,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const webauthnDebugEnabled = typeof window !== 'undefined' &&
    ['1', 'true', 'yes'].includes((new URLSearchParams(window.location.search).get('webauthnDebug') || '').toLowerCase());

  // Detected capabilities
  const [primaryMethod, setPrimaryMethod] = useState<UnlockMethod>('passphrase');
  const [availableMethods, setAvailableMethods] = useState<UnlockMethod[]>(['passphrase']);
  const [registeredKeyIsPlatform, setRegisteredKeyIsPlatform] = useState(false);

  // Form state
  const [passphrase, setPassphrase] = useState('');
  const [rememberChoice, setRememberChoice] = useState(false);
  const [selectedKeyFile, setSelectedKeyFile] = useState<File | null>(null);
  const [keyFilePassphrase, setKeyFilePassphrase] = useState('');

  // UI state
  const [activeMethod, setActiveMethod] = useState<UnlockMethod>('passphrase');
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoBiometricTrigger, setAutoBiometricTrigger] = useState(false);
  const [canTryPasskeyChooser, setCanTryPasskeyChooser] = useState(false);
  const [copiedDebug, setCopiedDebug] = useState(false);
  const [webauthnDebug, setWebauthnDebug] = useState<{
    hostname: string;
    isSecureContext: boolean;
    userAgent: string;
    localCredentialIds: string[];
    lastError: {
      stage: string;
      name: string;
      message: string;
      hostname: string;
      isSecureContext: boolean;
      timestamp: number;
    } | null;
    syncError?: string;
    activeMethod?: string;
    availableMethods?: string[];
  } | null>(null);

  // Tracks whether the dialog is still open when an async unlock operation
  // completes — prevents stale callbacks from submitting after the user cancels.
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);

  // Detect available methods on open
  useEffect(() => {
    if (!open || !user) return;

    setError(null);
    setPassphrase('');
    setRememberChoice(false);
    setSelectedKeyFile(null);
    setKeyFilePassphrase('');
    setShowAlternatives(false);
    setAutoBiometricTrigger(false);
    setCanTryPasskeyChooser(false);

    const detect = async () => {
      try {
        const availability = await getAvailableUnlockMethods(user.uid, { isMobile });
        setRegisteredKeyIsPlatform(availability.registeredKeyIsPlatform);
        setAvailableMethods(availability.methods);
        setPrimaryMethod(availability.primaryMethod);
        setActiveMethod(availability.primaryMethod);
        if (availability.primaryMethod === 'hardware' || availability.primaryMethod === 'biometric') {
          setAutoBiometricTrigger(true);
        }
      } catch {
        const fallback: UnlockMethod[] = ['passphrase', 'keyfile'];
        setRegisteredKeyIsPlatform(false);
        setAvailableMethods(fallback);
        setPrimaryMethod('passphrase');
        setActiveMethod('passphrase');
      }
    };

    detect();
  }, [open, user]);

  // Auto-trigger the primary method once detect() has chosen hardware or biometric
  useEffect(() => {
    if (!autoBiometricTrigger || !open) return;
    setAutoBiometricTrigger(false);
    const fn = primaryMethod === 'hardware' ? handleHardwareKeyAuth : handleBiometricAuth;
    const timer = setTimeout(() => fn(), 300);
    return () => clearTimeout(timer);
    // handlers are stable for the lifetime of this dialog open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBiometricTrigger, open]);

  // ── Auth handlers ────────────────────────────────────────────────────────

  const handlePassphraseSubmit = async () => {
    if (!passphrase.trim()) { setError('Please enter your passphrase'); return; }
    try {
      setLoading(true); setError(null);
      await onSubmit(passphrase, rememberChoice, 'passphrase');
      setPassphrase(''); setRememberChoice(false);
    } catch {
      setError('Incorrect passphrase. Please try again.');
    } finally { setLoading(false); }
  };

  const handleBiometricAuth = async () => {
    if (!user) return;
    try {
      setLoading(true); setError(null);
      setCanTryPasskeyChooser(false);
      const privateKey = await unlockWithBiometric(user.uid, { interactive: true });
      if (!openRef.current) return; // user cancelled while WebAuthn was in flight
      await onSubmit(privateKey, true, 'biometric');
    } catch (err) {
      if (!openRef.current) return;
      const msg = err instanceof Error ? err.message : 'Biometric authentication failed';
      if (/NotAllowed|passkey|credential/i.test(msg)) {
        setCanTryPasskeyChooser(true);
      }
      setError(msg.includes('set up') || msg.includes('re-done') || msg.includes('Profile')
        ? msg
        : 'Biometric authentication failed. Try again or use a different method.');
    } finally { if (openRef.current) setLoading(false); }
  };

  const handlePasskeyChooserAuth = async () => {
    if (!user) return;
    try {
      setLoading(true); setError(null);
      const privateKey = await unlockWithBiometric(user.uid, {
        interactive: true,
        preferDiscoverable: true,
      });
      if (!openRef.current) return;
      await onSubmit(privateKey, true, 'biometric');
    } catch (err) {
      if (!openRef.current) return;
      const msg = err instanceof Error ? err.message : 'Passkey authentication failed';
      setError(msg);
    } finally {
      if (openRef.current) setLoading(false);
    }
  };

  const handleHardwareKeyAuth = async () => {
    if (!user) return;
    try {
      setLoading(true); setError(null);
      const privateKey = await unlockWithHardware(user.uid);
      if (!openRef.current) return; // user cancelled while waiting for hardware key touch
      await onSubmit(privateKey, true, 'hardware');
    } catch (err) {
      if (!openRef.current) return;
      const msg = err instanceof Error ? err.message : 'Hardware key authentication failed';
      // Old-format IndexedDB data can't be decrypted — automatically fall back to
      // passphrase so the user isn't stuck. They can re-register the hardware key
      // from Profile > Privacy after unlocking.
      if (msg.includes('old format')) {
        setActiveMethod('passphrase');
        setError('Your device unlock data needs to be re-registered. Please unlock with your passphrase, then re-register your key in Profile > Privacy.');
      } else {
        setError(msg);
      }
    } finally { if (openRef.current) setLoading(false); }
  };

  const handleKeyFileUpload = async () => {
    if (!selectedKeyFile) { setError('Please select a key file'); return; }
    try {
      setLoading(true); setError(null);
      const fileContent = await selectedKeyFile.text();
      let privateKeyHex: string;
      try {
        const keyData = JSON.parse(fileContent);
        if (keyData.encryptedPrivateKey && keyData.keyType) {
          if (!keyData.keyType.includes('ML-KEM-768')) throw new Error('Unsupported key file format.');
          if (!keyFilePassphrase.trim()) { setError('This file is encrypted — enter its passphrase.'); setLoading(false); return; }
          const { decryptString } = await import('../crypto/quantumSafeCrypto');
          privateKeyHex = await decryptString(keyData.encryptedPrivateKey, keyFilePassphrase);
        } else if (keyData.privateKeyHex) {
          privateKeyHex = keyData.privateKeyHex;
          if (!/^[a-fA-F0-9]+$/.test(privateKeyHex) || privateKeyHex.length % 2 !== 0) throw new Error('Invalid private key format.');
        } else {
          throw new Error('Invalid key file structure.');
        }
      } catch {
        const trimmed = fileContent.trim();
        if (/^[a-fA-F0-9]+$/.test(trimmed) && trimmed.length % 2 === 0) { privateKeyHex = trimmed; }
        else throw new Error('Unrecognised file format. Expected a .json key backup or a hex-encoded key.');
      }
      await onSubmit(privateKeyHex!, rememberChoice, 'keyfile');
      setSelectedKeyFile(null); setKeyFilePassphrase(''); setRememberChoice(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Key file error';
      setError(keyFilePassphrase.trim() && msg.includes('decrypt') ? 'Wrong passphrase for this key file.' : msg);
    } finally { setLoading(false); }
  };

  const handleLogout = async () => {
    try { setLoading(true); onClose(); await logout(); }
    catch { setError('Failed to log out.'); }
    finally { setLoading(false); }
  };

  const getDebugJson = () => JSON.stringify({
    hostname: webauthnDebug?.hostname || window.location.hostname,
    isSecureContext: webauthnDebug?.isSecureContext ?? isSecureContext,
    activeMethod: webauthnDebug?.activeMethod || activeMethod,
    availableMethods: webauthnDebug?.availableMethods || availableMethods,
    localCredentialIdsCount: webauthnDebug?.localCredentialIds?.length || 0,
    localCredentialIds: webauthnDebug?.localCredentialIds || [],
    lastError: webauthnDebug?.lastError || null,
    syncError: webauthnDebug?.syncError || null,
    userAgent: webauthnDebug?.userAgent || navigator.userAgent,
  }, null, 2);

  const copyDebugJson = async () => {
    const json = getDebugJson();
    try {
      await navigator.clipboard.writeText(json);
      setCopiedDebug(true);
      setTimeout(() => setCopiedDebug(false), 1500);
      return;
    } catch {
      // Fallback for environments where Clipboard API is unavailable/blocked.
      try {
        const ta = document.createElement('textarea');
        ta.value = json;
        ta.setAttribute('readonly', 'true');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopiedDebug(true);
        setTimeout(() => setCopiedDebug(false), 1500);
      } catch {
        // no-op: user can manually long-press select from the text field
      }
    }
  };

  const refreshWebauthnDebug = async () => {
    if (!webauthnDebugEnabled || !user) return;
    try {
      const { getWebAuthnDebugState, syncLocalCredentialsFromFirestore } = await import('../utils/biometricAuth');
      let syncError: string | undefined;
      try {
        await syncLocalCredentialsFromFirestore(user.uid);
      } catch (err) {
        syncError = err instanceof Error ? err.message : 'syncLocalCredentialsFromFirestore failed';
      }
      const snapshot = getWebAuthnDebugState(user.uid);
      setWebauthnDebug({
        ...snapshot,
        syncError,
        activeMethod,
        availableMethods,
      });
    } catch (err) {
      setWebauthnDebug({
        hostname: window.location.hostname,
        isSecureContext,
        userAgent: navigator.userAgent,
        localCredentialIds: [],
        lastError: null,
        syncError: err instanceof Error ? err.message : 'Failed to load debug snapshot',
        activeMethod,
        availableMethods,
      });
    }
  };

  useEffect(() => {
    if (!open || !webauthnDebugEnabled || !user) return;
    refreshWebauthnDebug();
    // Refresh on state changes relevant for debugging this dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, webauthnDebugEnabled, user, error, activeMethod, availableMethods.length]);

  // ── Labels ───────────────────────────────────────────────────────────────

  const methodLabel: Record<UnlockMethod, string> = {
    hardware: registeredKeyIsPlatform ? 'Fingerprint / Face / PIN' : 'Hardware Key',
    biometric: 'Fingerprint / Face / PIN',
    passphrase: 'Password',
    keyfile: 'Backup file',
  };

  const methodIcon: Record<UnlockMethod, React.ReactNode> = {
    hardware: <Key fontSize="small" />,
    biometric: <Fingerprint fontSize="small" />,
    passphrase: <VpnKey fontSize="small" />,
    keyfile: <Upload fontSize="small" />,
  };

  const alternativeMethods = availableMethods.filter(m => m !== primaryMethod);

  // ── Primary action button (footer) ──────────────────────────────────────

  const primaryActionButton = () => {
    if (activeMethod === 'passphrase') {
      return (
        <Button onClick={handlePassphraseSubmit} variant="contained" disabled={loading || !passphrase.trim()}>
          {loading ? 'Decrypting…' : 'Unlock'}
        </Button>
      );
    }
    if (activeMethod === 'keyfile') {
      return (
        <Button onClick={handleKeyFileUpload} variant="contained" disabled={loading || !selectedKeyFile}>
          {loading ? 'Processing…' : 'Unlock with Key File'}
        </Button>
      );
    }
    return null; // biometric/hardware have inline buttons
  };

  const subtitle: Record<UnlockMethod, string> = {
    hardware: registeredKeyIsPlatform
      ? 'Use your fingerprint, face scan, or device PIN to decrypt your files.'
      : 'Insert your security key and touch it when prompted to decrypt your files.',
    biometric: 'Verify with Face ID, fingerprint, or your device PIN to decrypt your files.',
    passphrase: 'Enter the passphrase you set up for your account. It never leaves this device.',
    keyfile: 'Use a backup key file to regain access to your encrypted files.',
  };

  return (
    <Dialog
      open={open}
      onClose={(_e, reason) => { if (reason === 'backdropClick' || reason === 'escapeKeyDown') return; onClose(); }}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Lock />
          Access your files
        </Box>
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {subtitle[activeMethod]}
        </Typography>

        {error && (
          <Alert
            severity="error"
            sx={{ mb: 2 }}
            action={
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {canTryPasskeyChooser && (
                  <Button color="inherit" size="small" onClick={handlePasskeyChooserAuth} disabled={loading}>
                    Try Passkey Chooser
                  </Button>
                )}
                {error.includes('Profile') && (
                  <Button color="inherit" size="small" onClick={() => { onClose(); navigate('/profile'); }}>
                    Go to Profile
                  </Button>
                )}
              </Box>
            }
          >
            {error}
          </Alert>
        )}

        {webauthnDebugEnabled && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              WebAuthn Debug (temporary)
            </Typography>
            <TextField
              fullWidth
              multiline
              minRows={8}
              maxRows={16}
              value={getDebugJson()}
              InputProps={{ readOnly: true }}
              onFocus={(e) => e.target.select()}
              sx={{ mb: 1, '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: 12 } }}
            />
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                size="small"
                variant="contained"
                startIcon={<ContentCopy fontSize="small" />}
                onClick={copyDebugJson}
                disabled={loading}
              >
                {copiedDebug ? 'Copied' : 'Copy Debug JSON'}
              </Button>
              <Button size="small" variant="outlined" onClick={refreshWebauthnDebug} disabled={loading}>
                Refresh Debug Snapshot
              </Button>
            </Box>
          </Alert>
        )}

        {/* Primary method panel */}
        {activeMethod === 'hardware' && <HardwareKeyPanel loading={loading} onAuth={handleHardwareKeyAuth} isPlatform={registeredKeyIsPlatform} />}
        {activeMethod === 'biometric' && <BiometricPanel loading={loading} onAuth={handleBiometricAuth} />}
        {activeMethod === 'passphrase' && (
          <PassphrasePanel
            passphrase={passphrase}
            rememberChoice={rememberChoice}
            loading={loading}
            showBiometricHint={availableMethods.length === 1 /* only passphrase — biometrics not yet set up */}
            onChange={setPassphrase}
            onRememberChange={setRememberChoice}
            onSubmit={handlePassphraseSubmit}
          />
        )}
        {activeMethod === 'keyfile' && (
          <KeyFilePanel
            selectedFile={selectedKeyFile}
            filePassphrase={keyFilePassphrase}
            rememberChoice={rememberChoice}
            loading={loading}
            onFileChange={setSelectedKeyFile}
            onPassphraseChange={setKeyFilePassphrase}
            onRememberChange={setRememberChoice}
          />
        )}

        {/* Alternative methods */}
        {alternativeMethods.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Divider />
            <Box
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mt: 1, cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setShowAlternatives(v => !v)}
            >
              <Typography variant="body2" color="text.secondary">
                Use a different method
              </Typography>
              <IconButton size="small">
                {showAlternatives ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
              </IconButton>
            </Box>
            <Collapse in={showAlternatives}>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center', mt: 1.5 }}>
                {alternativeMethods.map(method => (
                  <Button
                    key={method}
                    size="small"
                    variant={activeMethod === method ? 'contained' : 'outlined'}
                    startIcon={methodIcon[method]}
                    onClick={() => { setActiveMethod(method); setError(null); }}
                    disabled={loading}
                  >
                    {methodLabel[method]}
                    {method === 'keyfile' && (
                      <Typography component="span" variant="caption" sx={{ ml: 0.5, opacity: 0.7 }}>
                        (recovery)
                      </Typography>
                    )}
                  </Button>
                ))}
              </Box>
            </Collapse>
          </Box>
        )}

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            Your decrypted key is never written to disk unencrypted. If you use device unlock (fingerprint, Face ID, or PIN), SeraVault will restore access automatically on your next visit.
          </Typography>
        </Alert>
      </DialogContent>

      <DialogActions sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={handleLogout} disabled={loading} startIcon={<Logout />} color="error" variant="outlined">
          Log out
        </Button>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onClose}>Cancel</Button>
          {primaryActionButton()}
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default BiometricPassphraseDialog;
