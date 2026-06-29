import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  setPersistence,
  indexedDBLocalPersistence,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from 'firebase/firestore';
import { getStorage, ref, getBytes } from 'firebase/storage';
import { firebaseConfig } from '../shared/firebaseConfig';
import type { CredentialEntry, ExtMessage } from '../shared/types';

// ─── Vault tab token bridge ───────────────────────────────────────────────────
// Finds or opens app.seravault.com, waits for the user to be signed in,
// then requests a Firebase ID token via postMessage bridge.

const VAULT_ORIGIN = 'https://app.seravault.com';
const VAULT_URL = 'https://app.seravault.com';

interface VaultSession {
  idToken: string;
  uid: string;
  email: string | null;
}

async function requestTokenFromTab(tabId: number): Promise<VaultSession | null> {
  // First try the content script message channel (works in regular tabs)
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'REQUEST_PAGE_TOKEN' }) as any;
    if (res?.idToken && res?.uid) return { idToken: res.idToken, uid: res.uid, email: res.email ?? null };
  } catch {
    // Content script not injected (e.g. PWA window) — fall through to scripting API
  }

  // Fallback: inject a one-shot script directly via scripting.executeScript.
  // This works in PWA windows where the content script may not be present.
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        return new Promise<{ idToken: string; uid: string; email: string | null } | null>((resolve) => {
          const nonce = crypto.randomUUID();
          const timeout = setTimeout(() => resolve(null), 3000);
          const handler = (event: MessageEvent) => {
            if (event.data?.type !== 'SERAVAULT_EXT_TOKEN_RESPONSE') return;
            if (event.data?.nonce !== nonce) return;
            window.removeEventListener('message', handler);
            clearTimeout(timeout);
            if (event.data?.idToken && event.data?.uid) {
              resolve({ idToken: event.data.idToken, uid: event.data.uid, email: event.data.email ?? null });
            } else {
              resolve(null);
            }
          };
          window.addEventListener('message', handler);
          window.postMessage({ type: 'SERAVAULT_EXT_TOKEN_REQUEST', nonce }, window.location.origin);
        });
      },
    });
    const session = results?.[0]?.result as VaultSession | null;
    if (session) return session;
  } catch {
    // scripting.executeScript failed (e.g. tab not ready yet)
  }

  return null;
}

async function findVaultTab(): Promise<chrome.tabs.Tab | null> {
  // chrome.tabs.query searches all windows including PWA windows
  const tabs = await chrome.tabs.query({ url: `${VAULT_ORIGIN}/*` });
  if (tabs.length) return tabs[0];

  // Also search across all window types explicitly in case the PWA
  // window type isn't covered by the default query
  const allWindows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal', 'app', 'popup'] });
  for (const win of allWindows) {
    for (const tab of win.tabs ?? []) {
      if (tab.url?.startsWith(VAULT_ORIGIN)) return tab;
    }
  }
  return null;
}

async function getTokenFromVaultTab(): Promise<VaultSession> {
  // 1. Look for an already-open vault tab or PWA window
  const existingTab = await findVaultTab();
  let tabId: number;
  let didOpenTab = false;

  if (existingTab?.id) {
    tabId = existingTab.id;
    // Focus it so the user can see it if they need to sign in
    await chrome.tabs.update(tabId, { active: true }).catch(() => {});
    const win = existingTab.windowId;
    if (win) await chrome.windows.update(win, { focused: true }).catch(() => {});
  } else {
    // 2. Open a new vault tab
    const tab = await chrome.tabs.create({ url: VAULT_URL, active: true });
    if (!tab.id) throw new Error('Could not open vault tab');
    tabId = tab.id;
    didOpenTab = true;
  }

  // 3. Poll until the page responds with a token (user signs in)
  //    Give up after 3 minutes.
  const deadline = Date.now() + 3 * 60 * 1000;
  const POLL_MS = 1500;

  // Wait for the page to load before first attempt
  if (didOpenTab) await delay(3000);

  while (Date.now() < deadline) {
    // Make sure the tab still exists
    const stillOpen = await chrome.tabs.get(tabId).catch(() => null);
    if (!stillOpen) throw new Error('Vault tab was closed before sign-in completed');

    const session = await requestTokenFromTab(tabId);
    if (session) {
      // If we opened the tab just to grab a token, close it silently
      if (didOpenTab) chrome.tabs.remove(tabId).catch(() => {});
      return session;
    }

    await delay(POLL_MS);
  }

  throw new Error('Timed out waiting for sign-in. Please sign in at app.seravault.com and try again.');
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Keep auth state persistent across service worker restarts
setPersistence(auth, indexedDBLocalPersistence).catch(() => {});

// currentUser tracks the active session — either from Firebase Auth (email/password)
// or from a vault session token bridge (OAuth via the PWA/web app).
let currentUser: User | null = null;
let vaultSession: VaultSession | null = null; // set when signed in via token bridge

onAuthStateChanged(auth, (user) => {
  currentUser = user;
});

function activeUid(): string | null {
  return currentUser?.uid ?? vaultSession?.uid ?? null;
}

function activeEmail(): string | null {
  return currentUser?.email ?? vaultSession?.email ?? null;
}

// Restore vault session from session storage on service worker startup
chrome.storage.session.get(['vault_uid', 'vault_email', 'vault_idtoken']).then((stored) => {
  if (stored.vault_uid && stored.vault_idtoken) {
    vaultSession = { uid: stored.vault_uid, email: stored.vault_email ?? null, idToken: stored.vault_idtoken };
  }
});

// ─── Crypto helpers (same algorithm as the main app) ─────────────────────────

async function decryptAesGcm(
  encryptedBytes: Uint8Array,
  keyBytes: Uint8Array
): Promise<Uint8Array> {
  const iv = encryptedBytes.slice(0, 12);
  const ciphertext = encryptedBytes.slice(12);
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Uint8Array(plain);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// ─── Private key retrieval ────────────────────────────────────────────────────

async function getStoredPrivateKey(uid: string): Promise<Uint8Array | null> {
  // The extension stores the decrypted private key in session storage after
  // the user unlocks via the popup (passphrase entry or biometric).
  const result = await chrome.storage.session.get(`pk_${uid}`);
  const hex = result[`pk_${uid}`] as string | undefined;
  if (!hex) return null;
  return hexToBytes(hex);
}

// ─── ML-KEM-768 decapsulation ─────────────────────────────────────────────────
// We load the noble/post-quantum library dynamically so the service worker
// doesn't pay the parse cost on every activation.

async function decapsulateFileKey(
  encryptedKeyHex: string,
  privateKeyBytes: Uint8Array
): Promise<Uint8Array> {
  // Format: 12-byte IV || 1088-byte encapsulated key || AES ciphertext
  const keyData = hexToBytes(encryptedKeyHex);
  const iv = keyData.slice(0, 12);
  const encapsulatedKey = keyData.slice(12, 12 + 1088);
  const ciphertext = keyData.slice(12 + 1088);

  const { ml_kem768 } = await import('@noble/post-quantum/ml-kem');
  const sharedSecret = ml_kem768.decapsulate(encapsulatedKey, privateKeyBytes);

  const aesKey = await crypto.subtle.importKey('raw', sharedSecret, 'AES-GCM', false, ['decrypt']);
  const fileKey = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
  return new Uint8Array(fileKey);
}

// ─── Form file decryption ─────────────────────────────────────────────────────

async function decryptFormFile(
  storagePath: string,
  fileKey: Uint8Array
): Promise<Record<string, string> | null> {
  try {
    const fileRef = ref(storage, storagePath);
    const encryptedBytes = new Uint8Array(await getBytes(fileRef));
    const decrypted = await decryptAesGcm(encryptedBytes, fileKey);
    const json = new TextDecoder().decode(decrypted);
    const formData = JSON.parse(json);
    return formData?.data ?? null;
  } catch {
    return null;
  }
}

// ─── Credential loading ───────────────────────────────────────────────────────

async function loadCredentials(uid: string, domain: string): Promise<CredentialEntry[]> {
  const privateKeyBytes = await getStoredPrivateKey(uid);
  if (!privateKeyBytes) return [];

  // Query all form files owned or shared with this user
  const filesRef = collection(db, 'files');
  const owned = query(filesRef, where('owner', '==', uid));
  const shared = query(filesRef, where('sharedWith', 'array-contains', uid));

  const [ownedSnap, sharedSnap] = await Promise.all([getDocs(owned), getDocs(shared)]);
  const allDocs = [...ownedSnap.docs, ...sharedSnap.docs];

  // Filter to .form files only (name field is encrypted, so we check storagePath extension heuristic
  // and then confirm after decryption)
  const entries: CredentialEntry[] = [];

  await Promise.all(
    allDocs.map(async (fileDoc) => {
      const data = fileDoc.data();
      // Only process form files (fileType is unset for forms, or name ends in .form after decrypt)
      if (data.fileType === 'chat' || data.fileType === 'attachment') return;

      const encryptedKeyHex = data.encryptedKeys?.[uid];
      if (!encryptedKeyHex) return;

      try {
        const fileKey = await decapsulateFileKey(encryptedKeyHex, privateKeyBytes);
        const formData = await decryptFormFile(data.storagePath, fileKey);
        if (!formData) return;

        // Re-parse full form structure to get schema
        const fileRef = ref(storage, data.storagePath);
        const encryptedBytes = new Uint8Array(await getBytes(fileRef));
        const decryptedBytes = await decryptAesGcm(encryptedBytes, fileKey);
        const fullForm = JSON.parse(new TextDecoder().decode(decryptedBytes));

        if (!fullForm?.schema?.fields) return;

        // Decrypt file name metadata
        let fileName = 'Unnamed';
        if (data.name?.ciphertext && data.name?.nonce) {
          try {
            const nameIv = hexToBytes(data.name.nonce);
            const nameCiphertext = hexToBytes(data.name.ciphertext);
            const combined = new Uint8Array(nameIv.length + nameCiphertext.length);
            combined.set(nameIv, 0);
            combined.set(nameCiphertext, nameIv.length);
            const decryptedName = await decryptAesGcm(combined, fileKey);
            fileName = new TextDecoder().decode(decryptedName);
          } catch {
            fileName = fullForm.metadata?.name ?? 'Unnamed';
          }
        } else if (typeof data.name === 'string') {
          fileName = data.name;
        }

        // Extract field values
        const fields = (fullForm.schema.fields as Array<{
          id: string;
          label: string;
          type: string;
          sensitive?: boolean;
        }>).map((f) => ({
          id: f.id,
          label: f.label,
          type: f.type,
          value: (formData[f.id] as string) ?? '',
          sensitive: f.sensitive ?? f.type === 'password',
        }));

        // Try to find a URL field to score domain relevance
        const urlField = fields.find((f) => f.type === 'url' || f.label.toLowerCase().includes('url') || f.label.toLowerCase().includes('website'));
        const storedUrl = urlField?.value ?? '';
        if (domain && storedUrl) {
          try {
            const storedDomain = new URL(storedUrl.startsWith('http') ? storedUrl : `https://${storedUrl}`).hostname.replace(/^www\./, '');
            const currentDomain = domain.replace(/^www\./, '');
            if (!storedDomain.includes(currentDomain) && !currentDomain.includes(storedDomain)) return;
          } catch {
            // URL parse failed — include anyway if no domain filter
          }
        }

        const category = fullForm.template?.category ?? fullForm.metadata?.category ?? 'custom';
        const usernameField = fields.find((f) =>
          f.type === 'email' || f.label.toLowerCase().includes('username') || f.label.toLowerCase().includes('email')
        );
        const passwordField = fields.find((f) => f.type === 'password' || f.sensitive);

        entries.push({
          fileId: fileDoc.id,
          name: fileName.replace(/\.(password|identity|custom|credit_card|bank_account|wifi|secure_note)\.form$/, ''),
          category,
          fields,
          url: storedUrl,
          username: usernameField?.value,
          password: passwordField?.value,
        });
      } catch {
        // Silently skip files we can't decrypt
      }
    })
  );

  return entries;
}


// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ExtMessage, _sender, sendResponse) => {
    (async () => {
      switch (message.type) {
        case 'GET_AUTH_STATE': {
          sendResponse({
            type: 'AUTH_STATE',
            uid: activeUid(),
            email: activeEmail(),
          });
          break;
        }

        case 'SIGN_OUT': {
          await signOut(auth).catch(() => {});
          vaultSession = null;
          await chrome.storage.session.clear();
          sendResponse({ type: 'AUTH_STATE', uid: null, email: null });
          break;
        }

        case 'OAUTH_START': {
          try {
            const session = await getTokenFromVaultTab();
            // Store the session — no Firebase re-auth needed, we use the
            // ID token directly for Firestore REST calls.
            vaultSession = session;
            // Also persist uid/email in session storage so it survives
            // service worker restarts within the same browser session.
            await chrome.storage.session.set({
              vault_uid: session.uid,
              vault_email: session.email,
              vault_idtoken: session.idToken,
            });
            sendResponse({ type: 'AUTH_STATE', uid: session.uid, email: session.email });
          } catch (err) {
            sendResponse({ type: 'ERROR', message: String(err) });
          }
          break;
        }

        case 'GET_CREDENTIALS': {
          const uid = activeUid();
          if (!uid) {
            sendResponse({ type: 'ERROR', message: 'Not authenticated' });
            break;
          }
          try {
            const entries = await loadCredentials(uid, message.domain);
            sendResponse({ type: 'CREDENTIALS_RESULT', entries });
          } catch (err) {
            sendResponse({ type: 'ERROR', message: String(err) });
          }
          break;
        }

        default:
          break;
      }
    })();
    // Return true to keep the channel open for the async response
    return true;
  }
);

// Keep service worker alive during long crypto operations
chrome.runtime.onConnect.addListener(() => {});
