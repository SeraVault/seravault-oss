import React, { useEffect, useState, useCallback } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  setPersistence,
  indexedDBLocalPersistence,
} from 'firebase/auth';
import { firebaseConfig, VAULT_APP_URL, ENABLED_OAUTH_PROVIDERS } from '../shared/firebaseConfig';
import type { CredentialEntry, ExtMessage } from '../shared/types';

// ─── Firebase init (popup has its own JS context) ────────────────────────────
if (!getApps().length) initializeApp(firebaseConfig);
const auth = getAuth();
setPersistence(auth, indexedDBLocalPersistence).catch(() => {});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sendBg(msg: ExtMessage): Promise<ExtMessage> {
  return chrome.runtime.sendMessage(msg);
}

async function sendToActiveTab(msg: ExtMessage): Promise<ExtMessage | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  return chrome.tabs.sendMessage(tab.id, msg);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const OAUTH_ICONS: Record<string, string> = {
  'google.com': 'G',
  'apple.com': '',
  'microsoft.com': '⊞',
  'github.com': '',
  'facebook.com': 'f',
  'twitter.com': '𝕏',
  'yahoo.com': 'Y!',
};

function UnlockForm({
  onUnlocked,
}: {
  onUnlocked: (uid: string, email: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  const handleOAuth = async (providerId: string) => {
    setError('');
    setOauthLoading(providerId);
    // Background will open app.seravault.com if needed and poll until signed in.
    // This can take a while — keep the popup open and show a waiting state.
    try {
      const res = await sendBg({ type: 'OAUTH_START', providerId });
      if (res.type === 'AUTH_STATE' && res.uid) {
        onUnlocked(res.uid, res.email ?? '');
      } else if (res.type === 'ERROR') {
        setError(res.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'OAuth failed');
    } finally {
      setOauthLoading(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;
      await decryptAndStorePrivateKey(uid, passphrase);
      onUnlocked(uid, cred.user.email ?? email);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.logo}>
        <span style={styles.logoIcon}>🔐</span>
        <span style={styles.logoText}>SeraVault</span>
      </div>
      <p style={styles.subtitle}>Sign in to autofill your credentials</p>

      {/* OAuth buttons */}
      {ENABLED_OAUTH_PROVIDERS.length > 0 && (
        <>
          <div style={styles.oauthGroup}>
            {ENABLED_OAUTH_PROVIDERS.map((p) => (
              <button
                key={p.providerId}
                style={styles.oauthBtn}
                onClick={() => handleOAuth(p.providerId)}
                disabled={!!oauthLoading || loading}
              >
                <span style={styles.oauthIcon}>{OAUTH_ICONS[p.providerId] ?? p.icon}</span>
                {oauthLoading === p.providerId ? 'Waiting for sign-in…' : `Continue with ${p.label}`}
              </button>
            ))}
          </div>
          <div style={styles.divider}>
            <span style={styles.dividerLine} />
            <span style={styles.dividerText}>or</span>
            <span style={styles.dividerLine} />
          </div>
        </>
      )}

      {/* Email/password form */}
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          style={styles.input}
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
        <input
          style={styles.input}
          type="password"
          placeholder="Account password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <input
          style={styles.input}
          type="password"
          placeholder="Encryption passphrase"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          required
        />
        {error && <div style={styles.error}>{error}</div>}
        <button style={styles.button} type="submit" disabled={loading || !!oauthLoading}>
          {loading ? 'Unlocking…' : 'Unlock Vault'}
        </button>
      </form>
      <a href={VAULT_APP_URL} target="_blank" rel="noreferrer" style={styles.link}>
        Open SeraVault →
      </a>
    </div>
  );
}

async function decryptAndStorePrivateKey(uid: string, passphrase: string): Promise<void> {
  // Fetch the user profile from Firestore to get the encrypted private key
  const { getFirestore, doc, getDoc } = await import('firebase/firestore');
  const db = getFirestore();
  const userDoc = await getDoc(doc(db, 'users', uid));
  const profile = userDoc.data();
  if (!profile?.encryptedPrivateKey) throw new Error('Profile not found');

  const { argon2id } = await import('@noble/hashes/argon2');
  const { hex: hexEnc } = await import('@noble/hashes/utils');

  const { ciphertext, salt, nonce } = profile.encryptedPrivateKey as {
    ciphertext: string; salt: string; nonce: string;
  };

  const saltBytes = hexToBytes(salt);
  const derivedKey = argon2id(new TextEncoder().encode(passphrase), saltBytes, {
    t: 3, m: 65536, p: 1, dkLen: 32,
  });

  const aesKey = await crypto.subtle.importKey('raw', derivedKey, 'AES-GCM', false, ['decrypt']);
  const ivBytes = hexToBytes(nonce);
  const ctBytes = hexToBytes(ciphertext);
  const privateKeyBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    aesKey,
    ctBytes
  );
  const pkHex = Array.from(new Uint8Array(privateKeyBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  await chrome.storage.session.set({ [`pk_${uid}`]: pkHex });
  void hexEnc; // silence unused import
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}

// ─── Credential card ──────────────────────────────────────────────────────────

function CredentialCard({
  entry,
  onFill,
}: {
  entry: CredentialEntry;
  onFill: (entry: CredentialEntry) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader} onClick={() => setExpanded((v) => !v)}>
        <div>
          <div style={styles.cardName}>{entry.name}</div>
          {entry.username && (
            <div style={styles.cardSub}>{entry.username}</div>
          )}
        </div>
        <div style={styles.cardActions}>
          <button
            style={styles.fillBtn}
            onClick={(e) => { e.stopPropagation(); onFill(entry); }}
            title="Autofill this credential"
          >
            Fill
          </button>
          <span style={{ color: '#94a3b8', fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={styles.fieldList}>
          {entry.fields
            .filter((f) => f.value)
            .map((f) => (
              <div key={f.id} style={styles.fieldRow}>
                <span style={styles.fieldLabel}>{f.label}</span>
                <span style={styles.fieldValue}>
                  {f.sensitive ? '••••••••' : f.value}
                </span>
                <button
                  style={styles.copyBtn}
                  onClick={() => copy(f.value, f.label)}
                  title={`Copy ${f.label}`}
                >
                  {copied === f.label ? '✓' : 'Copy'}
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ─── Passphrase-only unlock (shown after OAuth re-opens popup) ────────────────

function PassphraseUnlock({
  uid,
  email,
  onUnlocked,
}: {
  uid: string;
  email: string | null;
  onUnlocked: () => void;
}) {
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await decryptAndStorePrivateKey(uid, passphrase);
      onUnlocked();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Wrong passphrase');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.logo}>
        <span style={styles.logoIcon}>🔐</span>
        <span style={styles.logoText}>SeraVault</span>
      </div>
      <p style={styles.subtitle}>Signed in as {email}</p>
      <p style={{ ...styles.subtitle, marginBottom: 16 }}>
        Enter your encryption passphrase to unlock your vault.
      </p>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          style={styles.input}
          type="password"
          placeholder="Encryption passphrase"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          required
          autoFocus
        />
        {error && <div style={styles.error}>{error}</div>}
        <button style={styles.button} type="submit" disabled={loading}>
          {loading ? 'Unlocking…' : 'Unlock Vault'}
        </button>
      </form>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [uid, setUid] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [entries, setEntries] = useState<CredentialEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [fillMessage, setFillMessage] = useState('');
  const [currentDomain, setCurrentDomain] = useState('');
  const [isPinned, setIsPinned] = useState(true);

  // Check auth state on mount
  useEffect(() => {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        try { setCurrentDomain(new URL(tab.url).hostname); } catch {}
      }
      const res = await sendBg({ type: 'GET_AUTH_STATE' });
      if (res.type === 'AUTH_STATE' && res.uid) {
        setUid(res.uid);
        setUserEmail(res.email);
        const stored = await chrome.storage.session.get(`pk_${res.uid}`);
        if (stored[`pk_${res.uid}`]) setVaultUnlocked(true);
      }
      // Check if the extension is pinned to the toolbar
      const settings = await chrome.action.getUserSettings();
      setIsPinned(settings.isOnToolbar);
      setLoading(false);
    })();
  }, []);

  // Load credentials once vault is unlocked
  useEffect(() => {
    if (!uid || !vaultUnlocked) return;
    setLoading(true);
    sendBg({ type: 'GET_CREDENTIALS', domain: currentDomain })
      .then((res) => {
        if (res.type === 'CREDENTIALS_RESULT') setEntries(res.entries);
      })
      .finally(() => setLoading(false));
  }, [uid, vaultUnlocked, currentDomain]);

  const handleFill = useCallback(async (entry: CredentialEntry) => {
    const res = await sendToActiveTab({ type: 'FILL_FORM', entry });
    if (res?.type === 'FIELDS_FILLED') {
      setFillMessage(`Filled ${res.count} field${res.count !== 1 ? 's' : ''}`);
      setTimeout(() => setFillMessage(''), 2000);
    }
  }, []);

  const handleSignOut = async () => {
    await sendBg({ type: 'SIGN_OUT' });
    setUid(null);
    setUserEmail(null);
    setVaultUnlocked(false);
    setEntries([]);
  };

  if (loading) {
    return (
      <div style={{ ...styles.container, justifyContent: 'center', alignItems: 'center' }}>
        <div style={styles.spinner} />
      </div>
    );
  }

  // Not signed in to Firebase at all → full login form
  if (!uid) {
    return (
      <UnlockForm
        onUnlocked={(id, email) => { setUid(id); setUserEmail(email); setVaultUnlocked(true); }}
      />
    );
  }

  // Signed in via OAuth but vault not yet unlocked → passphrase-only prompt
  if (!vaultUnlocked) {
    return (
      <PassphraseUnlock
        uid={uid}
        email={userEmail}
        onUnlocked={() => setVaultUnlocked(true)}
      />
    );
  }

  const filtered = entries.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.username ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (e.url ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={styles.container}>
      {/* Pin prompt — shown once until user pins the extension */}
      {!isPinned && (
        <div style={styles.pinBanner}>
          <span>📌</span>
          <span style={{ flex: 1 }}>
            Pin SeraVault to your toolbar for quick access —
            click the <strong>🧩</strong> puzzle icon then the pin next to SeraVault.
          </span>
          <button style={styles.pinDismiss} onClick={() => setIsPinned(true)}>✕</button>
        </div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logoIcon}>🔐</span>
          <div>
            <div style={styles.logoText}>SeraVault</div>
            {currentDomain && (
              <div style={styles.domainBadge}>{currentDomain}</div>
            )}
          </div>
        </div>
        <button style={styles.signOutBtn} onClick={handleSignOut} title="Sign out">
          ⏏
        </button>
      </div>

      {/* Search */}
      <input
        style={styles.search}
        type="text"
        placeholder="Search credentials…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />

      {/* Fill message */}
      {fillMessage && <div style={styles.fillMsg}>{fillMessage}</div>}

      {/* Credential list */}
      <div style={styles.list}>
        {filtered.length === 0 ? (
          <div style={styles.empty}>
            {entries.length === 0
              ? 'No matching credentials found for this site.'
              : 'No results.'}
          </div>
        ) : (
          filtered.map((entry) => (
            <CredentialCard key={entry.fileId} entry={entry} onFill={handleFill} />
          ))
        )}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <span style={styles.footerEmail}>{userEmail}</span>
        <a href={VAULT_APP_URL} target="_blank" rel="noreferrer" style={styles.link}>
          Open Vault
        </a>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 360,
    minHeight: 400,
    maxHeight: 600,
    display: 'flex',
    flexDirection: 'column',
    background: '#0f0f1a',
    color: '#e2e8f0',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 14,
    overflow: 'hidden',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  logoIcon: { fontSize: 24 },
  logoText: { fontWeight: 700, fontSize: 16, color: '#a5b4fc' },
  subtitle: { color: '#94a3b8', fontSize: 12, margin: '0 0 16px' },
  form: { display: 'flex', flexDirection: 'column', gap: 8 },
  input: {
    padding: '10px 12px',
    background: '#1e1e2e',
    border: '1px solid #3d3d5e',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: 14,
    outline: 'none',
  },
  button: {
    padding: '10px 16px',
    background: '#4f46e5',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
    marginTop: 4,
  },
  error: {
    color: '#f87171',
    fontSize: 12,
    padding: '6px 8px',
    background: '#3f1e1e',
    borderRadius: 6,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #2d2d4e',
    background: '#13131f',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  domainBadge: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  signOutBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: 18,
    padding: 4,
  },
  search: {
    margin: '10px 12px',
    padding: '8px 12px',
    background: '#1e1e2e',
    border: '1px solid #3d3d5e',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: 13,
    outline: 'none',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 12px',
  },
  empty: {
    color: '#64748b',
    textAlign: 'center',
    padding: '32px 16px',
    fontSize: 13,
  },
  card: {
    background: '#1a1a2e',
    border: '1px solid #2d2d4e',
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    cursor: 'pointer',
  },
  cardName: { fontWeight: 600, color: '#c7d2fe' },
  cardSub: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  cardActions: { display: 'flex', alignItems: 'center', gap: 8 },
  fillBtn: {
    padding: '4px 10px',
    background: '#4f46e5',
    color: 'white',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  },
  fieldList: {
    borderTop: '1px solid #2d2d4e',
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  fieldRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
  },
  fieldLabel: { color: '#94a3b8', minWidth: 80, flexShrink: 0 },
  fieldValue: { flex: 1, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  copyBtn: {
    padding: '2px 8px',
    background: '#2d2d4e',
    color: '#a5b4fc',
    border: '1px solid #3d3d5e',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 11,
    flexShrink: 0,
  },
  fillMsg: {
    margin: '0 12px 8px',
    padding: '6px 10px',
    background: '#14532d',
    color: '#86efac',
    borderRadius: 6,
    fontSize: 12,
    textAlign: 'center',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    borderTop: '1px solid #2d2d4e',
    background: '#13131f',
  },
  footerEmail: { fontSize: 11, color: '#64748b' },
  link: { color: '#818cf8', fontSize: 12, textDecoration: 'none' },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid #2d2d4e',
    borderTop: '3px solid #4f46e5',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  pinBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '10px 12px',
    background: '#1e2a1e',
    borderBottom: '1px solid #2d4a2d',
    color: '#86efac',
    fontSize: 12,
    lineHeight: 1.4,
  },
  pinDismiss: {
    background: 'none',
    border: 'none',
    color: '#86efac',
    cursor: 'pointer',
    fontSize: 14,
    padding: 0,
    flexShrink: 0,
    opacity: 0.7,
  },
  oauthGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    marginBottom: 4,
  },
  oauthBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    background: '#1e1e2e',
    border: '1px solid #3d3d5e',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    width: '100%',
    transition: 'background 0.15s',
  },
  oauthIcon: {
    fontSize: 15,
    width: 20,
    textAlign: 'center' as const,
    flexShrink: 0,
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    margin: '12px 0',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: '#2d2d4e',
    display: 'block',
  },
  dividerText: {
    color: '#64748b',
    fontSize: 11,
    flexShrink: 0,
  },
};
