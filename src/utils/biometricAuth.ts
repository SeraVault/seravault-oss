/**
 * Biometric Authentication utilities for mobile devices
 * 
 * This module provides fingerprint/face ID authentication on supported devices
 * using the Web Authentication API (WebAuthn) which works on modern mobile browsers
 */

// PRF input label — changing this would invalidate all existing biometric keys
const PRF_EVAL_INPUT = new TextEncoder().encode('seravault-vault-key-v1');
const WEBAUTHN_DEBUG_KEY = 'sv_webauthn_last_error';

// Lazily-imported Firestore helpers to avoid circular dependencies at module load time
async function getFirestoreFns() {
  const { updateUserProfile, getUserProfile, clearUserProfileCache } = await import('../firestore');
  return { updateUserProfile, getUserProfile, clearUserProfileCache };
}

/**
 * Trigger a WebAuthn assertion with the PRF extension and return the PRF output.
 * The PRF output is a deterministic secret that is only released by the authenticator
 * after the user successfully verifies (biometric/PIN). It is NOT derivable from
 * the credential ID or any other public value.
 */
function credentialIdToBytes(credentialId: string): Uint8Array {
  // Credential IDs may be hex-encoded (legacy registerBiometric() path, always lowercase)
  // or base64-encoded (registerHardwareKey() path). Use lowercase-only hex detection to
  // avoid misidentifying base64url IDs that happen to contain only [0-9A-F] chars.
  if (/^[0-9a-f]+$/.test(credentialId) && credentialId.length % 2 === 0) {
    return new Uint8Array(credentialId.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  }
  // Accept standard base64 and base64url encodings.
  const normalized = credentialId
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

type AssertionResult = {
  prfOutput: ArrayBuffer | undefined;
  signature: Uint8Array;
  credentialId: string;
  rawId: Uint8Array;
};

function logWebAuthnError(stage: string, error: unknown): void {
  const err = error as { name?: string; message?: string };
  const payload = {
    stage,
    name: err?.name || 'UnknownError',
    message: err?.message || String(error),
    hostname: window.location.hostname,
    isSecureContext,
    timestamp: Date.now(),
  };
  console.warn('[WebAuthn]', stage, {
    name: payload.name,
    message: payload.message,
    hostname: payload.hostname,
    isSecureContext: payload.isSecureContext,
  });
  try {
    sessionStorage.setItem(WEBAUTHN_DEBUG_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota or storage policy issues
  }
}

export function getWebAuthnDebugState(userId?: string): {
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
} {
  let lastError: {
    stage: string;
    name: string;
    message: string;
    hostname: string;
    isSecureContext: boolean;
    timestamp: number;
  } | null = null;

  try {
    const raw = sessionStorage.getItem(WEBAUTHN_DEBUG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        lastError = {
          stage: String((parsed as Record<string, unknown>).stage || ''),
          name: String((parsed as Record<string, unknown>).name || ''),
          message: String((parsed as Record<string, unknown>).message || ''),
          hostname: String((parsed as Record<string, unknown>).hostname || ''),
          isSecureContext: Boolean((parsed as Record<string, unknown>).isSecureContext),
          timestamp: Number((parsed as Record<string, unknown>).timestamp || 0),
        };
      }
    }
  } catch {
    // Ignore malformed session storage payloads.
  }

  return {
    hostname: window.location.hostname,
    isSecureContext,
    userAgent: navigator.userAgent,
    localCredentialIds: userId ? getLocalCredentialIds(userId) : [],
    lastError,
  };
}

async function runPrfAssertion(
  opts: { allowCredentials?: PublicKeyCredentialDescriptor[]; rpId?: string }
): Promise<AssertionResult> {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      ...(opts.rpId ? { rpId: opts.rpId } : {}),
      ...(opts.allowCredentials ? { allowCredentials: opts.allowCredentials } : {}),
      userVerification: 'required',
      timeout: 60000,
      extensions: { prf: { eval: { first: PRF_EVAL_INPUT } } } as unknown as AuthenticationExtensionsClientInputs,
    },
  }) as PublicKeyCredential;

  type PrfExt = AuthenticationExtensionsClientOutputs & { prf?: { results?: { first?: ArrayBuffer } } };
  const prfOutput = (assertion.getClientExtensionResults() as PrfExt)?.prf?.results?.first;
  const signature = new Uint8Array((assertion.response as AuthenticatorAssertionResponse).signature);
  const rawId = new Uint8Array(assertion.rawId);
  const credentialId = bytesToHex(rawId);

  return { prfOutput, signature, credentialId, rawId };
}

/**
 * Perform a single WebAuthn assertion that simultaneously requests the PRF
 * extension and captures the assertion signature. Returns both so callers can
 * route to the PRF path (Firestore) or the IndexedDB path without a second
 * biometric prompt.
 *
 * `prfOutput` is undefined when the authenticator completed verification
 * successfully but doesn't support the PRF extension. In that case the caller
 * should fall through to the IndexedDB path using `signature`.
 */
export async function getAssertionWithOptionalPrf(credentialId: string): Promise<{
  prfOutput: ArrayBuffer | undefined;
  signature: Uint8Array;
}> {
  const allowCredentials = [{ id: credentialIdToBytes(credentialId), type: 'public-key' as const }];
  try {
    const result = await runPrfAssertion({
      rpId: window.location.hostname,
      allowCredentials,
    });
    return { prfOutput: result.prfOutput, signature: result.signature };
  } catch (firstError) {
    logWebAuthnError('getAssertionWithOptionalPrf/rpId', firstError);
    // Do not immediately issue a second assertion after a NotAllowedError.
    // On mobile browsers this often indicates user-activation constraints,
    // and a chained retry can fail even if the first request was valid.
    if ((firstError as { name?: string })?.name === 'NotAllowedError') {
      throw firstError;
    }
    // Compatibility fallback: some user agents incorrectly reject assertions
    // when rpId is explicitly provided, even though the current origin matches.
    // Retrying without rpId lets the browser infer it from origin.
    try {
      const result = await runPrfAssertion({ allowCredentials });
      return { prfOutput: result.prfOutput, signature: result.signature };
    } catch (fallbackError) {
      logWebAuthnError('getAssertionWithOptionalPrf/no-rpId', fallbackError);
      throw firstError;
    }
  }
}

async function getPrfOutput(credentialId: string): Promise<ArrayBuffer> {
  const { prfOutput } = await getAssertionWithOptionalPrf(credentialId);

  if (!prfOutput) {
    throw new Error(
      'Your browser or authenticator does not support secure biometric key storage (PRF extension). ' +
      'Please use Chrome 116+, Edge 116+, or Safari 17.4+ with a compatible authenticator, ' +
      'then remove and re-set up biometrics in Profile settings.'
    );
  }

  return prfOutput;
}

/**
 * Probe whether the current browser/authenticator combo can perform PRF —
 * SeraVault's only secure mode for binding the private key to a fingerprint.
 *
 * Uses `PublicKeyCredential.getClientCapabilities()` (Chrome 133+, Safari 18+,
 * Firefox 135+) which reports extension support WITHOUT prompting the user.
 *
 * Returns:
 *   'supported'   — capability API confirms PRF is available
 *   'unsupported' — capability API explicitly says no
 *   'unknown'     — capability API not present (older browser); registration
 *                   will surface the real answer when the user tries.
 */
export async function probePrfSupport(): Promise<'supported' | 'unsupported' | 'unknown'> {
  try {
    if (!window.PublicKeyCredential) return 'unsupported';
    type CapsFn = () => Promise<Record<string, boolean>>;
    const getCaps = (PublicKeyCredential as unknown as { getClientCapabilities?: CapsFn }).getClientCapabilities;
    if (typeof getCaps !== 'function') return 'unknown';
    const caps = await getCaps.call(PublicKeyCredential);
    // The spec key is "extension:prf" (boolean).
    const prf = caps?.['extension:prf'];
    if (prf === true) return 'supported';
    if (prf === false) return 'unsupported';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Check if biometric authentication is available
 */
export async function isBiometricAvailable(): Promise<boolean> {
  // Check if WebAuthn is supported
  if (!window.PublicKeyCredential) {
    return false;
  }

  try {
    // Check if platform authenticator is available
    // Note: This returns true if the browser/OS supports it, but actual biometric
    // hardware (fingerprint/face) may not be present. The hardware check happens
    // during actual registration/authentication.
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return available;
  } catch (error) {
    console.error('Error checking biometric availability:', error);
    return false;
  }
}

/**
 * Get device capabilities for biometric authentication
 */
export async function getBiometricCapabilities(): Promise<{
  available: boolean;
  type: string;
  supportsResidentKeys: boolean;
}> {
  const available = await isBiometricAvailable();
  
  if (!available) {
    return {
      available: false,
      type: 'none',
      supportsResidentKeys: false,
    };
  }

  // Detect likely biometric type based on user agent
  const userAgent = navigator.userAgent.toLowerCase();
  let type = 'biometric';
  
  if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
    type = 'Face ID / Touch ID';
  } else if (userAgent.includes('android')) {
    type = 'Fingerprint / Face Unlock';
  }

  return {
    available: true,
    type,
    supportsResidentKeys: true,
  };
}

/**
 * Register biometric authentication for a user.
 *
 * Requests the PRF extension during create() so that — on browsers that
 * support PRF-at-registration (Chrome 132+, Safari 18+, Firefox 135+) — the
 * caller can encrypt the private key without triggering a second biometric
 * prompt. Older browsers will return `prfOutput: undefined`, in which case
 * the caller should fall back to a separate get() call.
 */
export async function registerBiometric(
  userId: string,
  accountName: string,
  displayName?: string
): Promise<{
  credentialId: string;
  publicKey: ArrayBuffer;
  prfOutput?: ArrayBuffer;
}> {
  if (!await isBiometricAvailable()) {
    throw new Error('Biometric authentication not available on this device');
  }

  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: {
          name: 'SeraVault',
          id: window.location.hostname,
        },
        user: {
          id: new TextEncoder().encode(userId),
          // `name` is the canonical account identifier per the WebAuthn spec
          // (typically the user's email). Google Password Manager uses this as
          // the default label in its "Save passkey for …?" prompt and as the
          // duplicate-detection key, so it MUST identify the SeraVault account
          // — not the device.
          name: accountName,
          // `displayName` is the human-friendly label shown in account pickers.
          displayName: displayName || accountName,
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          // 'preferred' is required on Android: Google's Credential Manager only
          // reliably plumbs the CTAP `hmac-secret` extension (which backs WebAuthn
          // PRF) through credentials created via the passkey path. With
          // 'discouraged', Android often routes to a legacy non-discoverable
          // keystore credential where hmac-secret is dropped, causing
          // registration to fail with "PRF extension not supported" even on
          // modern devices. SeraVault still stores and supplies credentialId
          // explicitly, so allowing a discoverable credential is harmless.
          residentKey: 'preferred',
        },
        timeout: 60000,
        // 'none' avoids the extra identity-confirmation step Chrome requires for
        // 'direct' or 'indirect' attestation (which can prompt for a password on
        // accounts that have no local password, e.g. Google sign-in users).
        attestation: 'none',
        // PRF at create() — when supported, the authenticator returns the PRF
        // output immediately, so we can encrypt the private key without a
        // second biometric prompt.
        extensions: { prf: { eval: { first: PRF_EVAL_INPUT } } } as unknown as AuthenticationExtensionsClientInputs,
      },
    }) as PublicKeyCredential;

    if (!credential || !credential.response) {
      throw new Error('Failed to create biometric credential');
    }

    const response = credential.response as AuthenticatorAttestationResponse;

    type PrfExt = AuthenticationExtensionsClientOutputs & {
      prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
    };
    const prfExt = (credential.getClientExtensionResults() as PrfExt)?.prf;
    const prfOutput = prfExt?.results?.first;

    // PRF is mandatory for SeraVault: the AES key that wraps the user's
    // private key is derived from the PRF output. If the authenticator
    // doesn't expose PRF, we MUST refuse setup — otherwise we'd write a
    // half-broken record to Firestore and surface the failure later, after
    // a confusing second biometric prompt.
    //
    // On Android, PRF support depends on:
    //   • Chrome 132+ (Jan 2025) for the platform authenticator
    //   • The device exposing the hmac-secret CTAP extension
    //     (most modern phones do; some lower-end / older devices don't)
    // If support is missing, the user can fall back to passphrase unlock.
    if (!prfOutput) {
      const supported = prfExt?.enabled === true;
      throw new Error(
        supported
          ? 'Your authenticator accepted the fingerprint but did not return a secure key (PRF extension). ' +
            'Please update your browser to the latest version and try again, or use your passphrase to unlock.'
          : 'This device or browser does not support secure biometric key storage (PRF extension). ' +
            'On Android, please use Chrome 132+ (or Edge 132+) on a device with secure biometric hardware. ' +
            'You can continue using your passphrase to unlock SeraVault.'
      );
    }

    return {
      credentialId: Array.from(new Uint8Array(credential.rawId))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join(''),
      publicKey: response.getPublicKey()!,
      prfOutput,
    };
  } catch (error) {
    console.error('Biometric registration failed:', error);
    throw new Error(`Biometric registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Authenticate using biometrics
 */
export async function authenticateWithBiometric(credentialId: string): Promise<{
  success: boolean;
  signature: ArrayBuffer;
  authenticatorData: ArrayBuffer;
}> {
  if (!await isBiometricAvailable()) {
    throw new Error('Biometric authentication not available');
  }

  try {
    // Credential IDs are hex-encoded — decode correctly.
    const credentialIdBytes = new Uint8Array(
      credentialId.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
    );

    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{
          id: credentialIdBytes,
          type: 'public-key',
        }],
        userVerification: 'required',
        timeout: 60000,
      },
    }) as PublicKeyCredential;

    if (!credential || !credential.response) {
      throw new Error('Biometric authentication failed');
    }

    const response = credential.response as AuthenticatorAssertionResponse;

    return {
      success: true,
      signature: response.signature,
      authenticatorData: response.authenticatorData,
    };
  } catch (error) {
    console.error('Biometric authentication failed:', error);
    throw new Error(`Biometric authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ─── Per-credential PRF storage (prf-v3) ─────────────────────────────────────
//
// Firestore schema (on the user profile document):
//   biometricKeys: {
//     [credentialId]: { encryptedKey, iv, version: 'prf-v3' }
//   }
//   biometricKey: { ... }   ← legacy single-credential field (prf-v2), read-only
//
// Each hardware key (fingerprint, YubiKey, etc.) gets its own entry keyed by
// credential ID.  Multiple keys coexist without overwriting each other.
// LocalStorage caches which credential IDs are registered on this device.

const PRF_KEY_VERSION = 'prf-v3';

/** Encode a credential ID for use as a Firestore map key (base64 → safe string). */
function credentialKey(credentialId: string): string {
  // Replace characters that Firestore field names cannot contain
  return credentialId.replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c]!));
}

/**
 * Encrypt the private key with the PRF output for a specific credential and
 * store the ciphertext in Firestore under `biometricKeys[credentialId]`.
 *
 * Works for any PRF-capable authenticator: platform (fingerprint/Face ID/PIN)
 * or cross-platform (YubiKey 5+, Titan, etc. on Chrome 116+).
 * The ciphertext is accessible on any device where the passkey syncs.
 */
export async function storeBiometricEncryptedKey(
  privateKey: string,
  credentialId: string,
  userId: string,
  precomputedPrfOutput?: ArrayBuffer
): Promise<void> {
  // If the caller already obtained the PRF output during credential creation
  // (e.g. from the credentials.create() response on Chrome 132+), use it
  // directly to skip the second credentials.get() dialog.
  const prfOutput = precomputedPrfOutput ?? await getPrfOutput(credentialId);

  const encryptionKey = await crypto.subtle.importKey(
    'raw', prfOutput, { name: 'AES-GCM' }, false, ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encryptionKey,
    new TextEncoder().encode(privateKey)
  );

  const record = {
    encryptedKey: Array.from(new Uint8Array(encryptedData)).map(b => b.toString(16).padStart(2, '0')).join(''),
    iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
    version: PRF_KEY_VERSION,
  };

  const { getUserProfile, updateUserProfile, clearUserProfileCache } = await getFirestoreFns();

  // Merge into the per-credential map, preserving existing entries
  const profile = await getUserProfile(userId);
  const existing = (profile?.biometricKeys || {}) as Record<string, { encryptedKey: string; iv: string; version: string }>;
  await updateUserProfile(userId, {
    biometricKeys: { ...existing, [credentialKey(credentialId)]: record },
    // Also write legacy field so old app versions still work during rollout
    biometricKey: { ...record, credentialId, version: 'prf-v2' as const },
  });
  clearUserProfileCache();

  // Cache this credential ID on the device
  const cached = getLocalCredentialIds(userId);
  if (!cached.includes(credentialId)) {
    setLocalCredentialIds(userId, [...cached, credentialId]);
  }
}

/**
 * Decrypt the private key using the PRF output for a specific credential.
 * `credentialId` must be a key that was previously stored via storeBiometricEncryptedKey.
 */
export async function retrieveBiometricEncryptedKey(
  userId: string,
  credentialId?: string,
  options?: { preferDiscoverable?: boolean }
): Promise<string> {
  const { getUserProfile } = await getFirestoreFns();
  const profile = await getUserProfile(userId);

  const fromMap = Object.keys(profile?.biometricKeys || {});
  const fromMapSafe = fromMap;
  const fromLegacy = profile?.biometricKey?.credentialId ? [profile.biometricKey.credentialId] : [];
  const local = getLocalCredentialIds(userId);
  const isHexCredentialId = (id: string) => /^[0-9a-f]+$/.test(id) && id.length % 2 === 0;
  const localHex = local.filter(isHexCredentialId);
  const fromLegacyHex = fromLegacy.filter(isHexCredentialId);

  // Prefer an explicit credential ID when supplied, then local cache, then Firestore hints.
  const candidates = credentialId
    ? [credentialId]
    : [...new Set([...localHex, ...fromLegacyHex, ...fromMapSafe])];
  const preferDiscoverable = options?.preferDiscoverable === true;

  let lastError: unknown = null;

  const decryptStored = async (
    stored: { encryptedKey: string; iv: string; version: string },
    prfOutput: ArrayBuffer
  ): Promise<string> => {
    const decryptionKey = await crypto.subtle.importKey(
      'raw', prfOutput, { name: 'AES-GCM' }, false, ['decrypt']
    );

    const ivBytes = new Uint8Array(stored.iv.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));
    const encryptedBytes = new Uint8Array(stored.encryptedKey.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));

    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      decryptionKey,
      encryptedBytes
    );

    return new TextDecoder().decode(decryptedData);
  };

  const lookupStoredRecord = (id: string) => {
    const mapRecord = profile?.biometricKeys?.[credentialKey(id)];
    const legacyRecord = profile?.biometricKey?.credentialId === id ? profile.biometricKey : null;
    const stored = mapRecord || legacyRecord;
    if (!stored || !['prf-v2', PRF_KEY_VERSION].includes(stored.version)) return null;
    return stored;
  };

  const tryDiscoverableAssertion = async (): Promise<string | null> => {
    let discovered: AssertionResult;
    try {
      discovered = await runPrfAssertion({ rpId: window.location.hostname });
    } catch (firstError) {
      logWebAuthnError('retrieveBiometricEncryptedKey/discoverable-rpId', firstError);
      try {
        discovered = await runPrfAssertion({});
      } catch (fallbackError) {
        logWebAuthnError('retrieveBiometricEncryptedKey/discoverable-no-rpId', fallbackError);
        throw firstError;
      }
    }

    if (!discovered.prfOutput) {
      throw new Error(
        'Your browser or authenticator does not support secure biometric key storage (PRF extension). ' +
        'Please update your browser and re-set up biometrics in Profile settings.'
      );
    }

    const discoveredBase64 = bytesToBase64(discovered.rawId);
    const discoveredBase64Url = discoveredBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const discoveredCandidates = [...new Set([
      discovered.credentialId,
      discoveredBase64,
      discoveredBase64Url,
    ])];

    for (const id of discoveredCandidates) {
      const stored = lookupStoredRecord(id);
      if (!stored) continue;

      const decrypted = await decryptStored(stored, discovered.prfOutput);
      const reordered = [id, ...local.filter(existingId => existingId !== id)];
      setLocalCredentialIds(userId, reordered);
      return decrypted;
    }

    // Fallback for credential ID drift across browser/passkey manager encodings.
    // If ID matching fails, attempt to decrypt against every stored PRF record
    // using the discovered PRF output; only the matching credential will decrypt.
    const allStoredRecords: Array<{ id: string; record: { encryptedKey: string; iv: string; version: string } }> = [];
    for (const id of Object.keys(profile?.biometricKeys || {})) {
      const record = profile?.biometricKeys?.[id];
      if (record && ['prf-v2', PRF_KEY_VERSION].includes(record.version)) {
        allStoredRecords.push({ id, record });
      }
    }
    if (profile?.biometricKey && ['prf-v2', PRF_KEY_VERSION].includes(profile.biometricKey.version)) {
      allStoredRecords.push({ id: profile.biometricKey.credentialId || 'legacy', record: profile.biometricKey });
    }

    for (const { id, record } of allStoredRecords) {
      try {
        const decrypted = await decryptStored(record, discovered.prfOutput);
        // Promote the credential returned by the authenticator for future calls.
        const preferredId = discoveredCandidates[0] || id;
        const reordered = [preferredId, ...local.filter(existingId => existingId !== preferredId)];
        setLocalCredentialIds(userId, reordered);
        return decrypted;
      } catch {
        // Continue trying other stored records.
      }
    }

    return null;
  };

  // Discoverable assertion path (passkey chooser). We run this when requested
  // explicitly, or when no credential hints exist.
  if (!credentialId && (preferDiscoverable || candidates.length === 0)) {
    try {
      const decrypted = await tryDiscoverableAssertion();
      if (decrypted) return decrypted;
    } catch (error) {
      lastError = error;
    }
  }

  for (const resolvedId of candidates) {
    // Look up the record — try new map first, then legacy field.
    const stored = lookupStoredRecord(resolvedId);
    if (!stored) {
      continue;
    }

    try {
      const prfOutput = await getPrfOutput(resolvedId);
      const decrypted = await decryptStored(stored, prfOutput);

      // Promote the working credential to the front for future unlock attempts.
      if (!credentialId) {
        const reordered = [resolvedId, ...local.filter(id => id !== resolvedId)];
        setLocalCredentialIds(userId, reordered);
      }

      return decrypted;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error && /NotAllowed|passkey|credential/i.test(lastError.message)) {
    throw new Error(
      'No passkey for this account is available on this device. ' +
      'Please unlock with your passphrase, then set up device unlock on this phone in Profile > Privacy.'
    );
  }

  if (lastError) {
    throw lastError;
  }

  if (candidates.length === 0) {
    throw new Error('No PRF credential found on this device. Please set up device unlock in Profile > Privacy.');
  }

  throw new Error('No device unlock record found. Please set it up in Profile > Privacy.');
}

/**
 * Centralized device-unlock orchestrator.
 *
 * - `interactive=true` (default): user-initiated unlock from the modal.
 *   On Android, defaults to discoverable-first to use the native passkey chooser.
 * - `interactive=false`: background/silent unlock attempts.
 *   Avoids discoverable-first to reduce unexpected prompts.
 */
export async function unlockPrivateKeyWithDevice(
  userId: string,
  options?: {
    interactive?: boolean;
    preferDiscoverable?: boolean;
    credentialId?: string;
  }
): Promise<string> {
  const interactive = options?.interactive ?? true;
  const androidDefault = /android/i.test(navigator.userAgent) && interactive;
  const preferDiscoverable = options?.preferDiscoverable ?? androidDefault;

  return retrieveBiometricEncryptedKey(
    userId,
    options?.credentialId,
    { preferDiscoverable }
  );
}

/**
 * Returns true if this user has at least one PRF credential stored in Firestore.
 */
export async function hasBiometricSetup(userId: string): Promise<boolean> {
  try {
    const { getUserProfile } = await getFirestoreFns();
    const profile = await getUserProfile(userId);
    const hasMap = Object.keys(profile?.biometricKeys || {}).length > 0;
    const hasLegacy = profile?.biometricKey?.version === 'prf-v2';
    return hasMap || hasLegacy;
  } catch {
    return getLocalCredentialIds(userId).length > 0;
  }
}

/**
 * Returns true if this device has a PRF credential for the given credentialId.
 * Checks localStorage cache only — no Firestore read.
 */
export function hasLocalPrfCredential(userId: string, credentialId: string): boolean {
  return getLocalCredentialIds(userId).includes(credentialId);
}

/**
 * Self-heal the local credential ID cache from Firestore.
 *
 * Mobile browsers (especially iOS Safari, PWAs, and Android in low-storage
 * conditions) can evict localStorage between sessions. When that happens,
 * the unlock dialog won't surface the biometric option even though Firestore
 * still has the encrypted key, because detection requires a local credential
 * ID to feed into the WebAuthn allowCredentials list.
 *
 * This helper repopulates the local cache from Firestore. The biometricKeys
 * map is keyed by the (sanitized) credential ID; for hex-encoded credentials
 * (the platform-authenticator path used by registerBiometric) the sanitized
 * key equals the original ID, so we can use it directly.
 *
 * Returns the credential IDs now cached locally.
 */
export async function syncLocalCredentialsFromFirestore(userId: string): Promise<string[]> {
  try {
    // ── Step 1: Restore from IndexedDB if localStorage was evicted ────────
    // IndexedDB survives iOS ITP eviction and Android storage-pressure clears
    // that wipe localStorage. If localStorage is empty but IndexedDB has data,
    // repopulate localStorage immediately (no network needed).
    const lsIds  = getLocalCredentialIds(userId);
    const idbIds = lsIds.length === 0 ? await idbGetCredentialIds(userId) : [];
    if (idbIds.length > 0 && lsIds.length === 0) {
      // Restore localStorage from IndexedDB (fast, no Firestore round-trip)
      localStorage.setItem(LOCAL_CREDS_KEY(userId), JSON.stringify(idbIds));
      if (idbIds.length > 0) {
        localStorage.setItem(`biometric_credential_${userId}`, idbIds[0]);
      }
    }

    // ── Step 2: Merge with Firestore as the authoritative source ──────────
    const { getUserProfile } = await getFirestoreFns();
    const profile = await getUserProfile(userId);

    const fromMap = Object.keys(profile?.biometricKeys || {});
    const fromLegacy = profile?.biometricKey?.credentialId ? [profile.biometricKey.credentialId] : [];

    // fromMap keys are Firestore-sanitized (stripped `+`, `/`, `=`), so only
    // lowercase hex IDs (registerBiometric output) can be safely round-tripped.
    const fromMapSafe = fromMap.filter(id => /^[0-9a-f]+$/.test(id) && id.length % 2 === 0);
    // fromLegacy preserves the original unsanitized credentialId (set by
    // storeBiometricEncryptedKey), so base64 IDs from the hardware-key path
    // are safe to use directly for recovery after localStorage eviction.
    const candidates = [...new Set([...fromMapSafe, ...fromLegacy])];

    if (candidates.length === 0) return getLocalCredentialIds(userId);

    const existing = getLocalCredentialIds(userId);
    const merged = [...new Set([...existing, ...candidates])];
    if (merged.length !== existing.length) {
      setLocalCredentialIds(userId, merged); // also writes to IndexedDB
    }
    return merged;
  } catch {
    return getLocalCredentialIds(userId);
  }
}

/**
 * Remove the PRF record for a specific credential from Firestore and local cache.
 */
export async function removeBiometricKeyForCredential(userId: string, credentialId: string): Promise<void> {
  const { getUserProfile, updateUserProfile, clearUserProfileCache } = await getFirestoreFns();
  const profile = await getUserProfile(userId);
  const existing = { ...(profile?.biometricKeys || {}) };
  delete existing[credentialKey(credentialId)];

  // If no more keys remain, also clear the legacy field
  const remainingCount = Object.keys(existing).length;
  await updateUserProfile(userId, {
    biometricKeys: existing,
    ...(remainingCount === 0 ? { biometricKey: null } : {}),
  });
  clearUserProfileCache();

  // Remove from local cache (localStorage + IndexedDB)
  const cached = getLocalCredentialIds(userId).filter(id => id !== credentialId);
  setLocalCredentialIds(userId, cached); // setLocalCredentialIds also updates IndexedDB
  localStorage.removeItem(`biometric_key_${userId}`); // legacy cleanup
}

/**
 * Remove ALL PRF records for this user (used when deleting account or full reset).
 */
export async function removeBiometricSetup(userId: string): Promise<void> {
  const { updateUserProfile, clearUserProfileCache } = await getFirestoreFns();
  await updateUserProfile(userId, { biometricKey: null, biometricKeys: {} });
  clearUserProfileCache();
  setLocalCredentialIds(userId, []); // also clears IndexedDB entry
  localStorage.removeItem(`biometric_credential_${userId}`); // legacy key
  localStorage.removeItem(`biometric_key_${userId}`);
}

// ─── Local credential ID cache helpers ───────────────────────────────────────
//
// Storage strategy for PWA resilience:
//
//  • localStorage  — synchronous, fast; used for all hot-path reads.
//  • IndexedDB     — async, durable; written alongside localStorage as a
//                    background backup. Installed PWAs keep IndexedDB in the
//                    persistent storage bucket (navigator.storage.persist()),
//                    while localStorage is subject to ITP 7-day eviction on
//                    iOS and storage-pressure eviction on Android.
//
// The credential IDs are NOT secret (they're public WebAuthn identifiers).
// The actual key material lives in Firestore; the IDs are only needed to build
// the allowCredentials list for the WebAuthn challenge. Losing them is
// recoverable via syncLocalCredentialsFromFirestore(), but reading IndexedDB
// first avoids the network round-trip on every unlock after an iOS eviction.

const LOCAL_CREDS_KEY = (uid: string) => `prf_credentials_${uid}`;
const IDB_CREDS_KEY   = (uid: string) => `prf_credentials_${uid}`;
const IDB_NAME = 'SeraVaultHardwareKeys'; // shared with hardwareKeyAuth.ts
const IDB_STORE = 'keys';

/** Fire-and-forget IndexedDB write — never blocks the caller. */
function idbSetCredentialIds(userId: string, ids: string[]): void {
  try {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      try {
        const tx = db.transaction([IDB_STORE], 'readwrite');
        tx.objectStore(IDB_STORE).put(JSON.stringify(ids), IDB_CREDS_KEY(userId));
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
      } catch { db.close(); }
    };
  } catch { /* IDB not available */ }
}

/** Read credential IDs from IndexedDB. Returns [] on any error. */
async function idbGetCredentialIds(userId: string): Promise<string[]> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onerror = () => resolve([]);
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction([IDB_STORE], 'readonly');
          const getReq = tx.objectStore(IDB_STORE).get(IDB_CREDS_KEY(userId));
          getReq.onsuccess = () => {
            db.close();
            try { resolve(getReq.result ? JSON.parse(getReq.result) : []); }
            catch { resolve([]); }
          };
          getReq.onerror = () => { db.close(); resolve([]); };
        } catch { db.close(); resolve([]); }
      };
    } catch { resolve([]); }
  });
}

export function getLocalCredentialIds(userId: string): string[] {
  try {
    const raw = localStorage.getItem(LOCAL_CREDS_KEY(userId));
    if (raw) return JSON.parse(raw);
    // Migrate legacy single-credential key
    const legacy = localStorage.getItem(`biometric_credential_${userId}`);
    return legacy ? [legacy] : [];
  } catch {
    return [];
  }
}

function setLocalCredentialIds(userId: string, ids: string[]): void {
  // Write to localStorage synchronously (hot path)
  localStorage.setItem(LOCAL_CREDS_KEY(userId), JSON.stringify(ids));
  // Keep legacy key in sync for backward compat
  if (ids.length > 0) {
    localStorage.setItem(`biometric_credential_${userId}`, ids[0]);
  } else {
    localStorage.removeItem(`biometric_credential_${userId}`);
  }
  // Persist to IndexedDB as a durable PWA backup (fire-and-forget)
  idbSetCredentialIds(userId, ids);
}

/**
 * Store biometric credential ID for a user (called after registration).
 */
export function storeBiometricCredential(userId: string, credentialId: string): void {
  const existing = getLocalCredentialIds(userId);
  if (!existing.includes(credentialId)) {
    setLocalCredentialIds(userId, [...existing, credentialId]);
  }
  // Legacy compatibility
  localStorage.setItem(`biometric_credential_${userId}`, credentialId);
}