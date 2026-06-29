// @ts-nocheck
import { AUTH_CONFIG } from '../constants/authConfig';
/**
 * Centralized Key Management Service
 * Handles all key generation, encryption, decryption, and storage operations
 * Eliminates the need for complex event listeners and timing dependencies
 */

import { generateKeyPair, bytesToHex, hexToBytes, encryptData, decryptData } from '../crypto/quantumSafeCrypto';
import { encryptString, decryptString } from '../crypto/quantumSafeCrypto';

/**
 * Run Argon2id in a Web Worker to keep the UI thread responsive during unlock.
 * Falls back to synchronous on-thread if workers are unavailable.
 */
function decryptStringOffThread(
  encrypted: { ciphertext: string; salt: string; nonce: string },
  passphrase: string
): Promise<string> {
  // Workers are universally supported in modern browsers; this guard is defensive.
  if (typeof Worker === 'undefined') {
    return Promise.resolve(decryptString(encrypted, passphrase));
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/argon2.worker.ts', import.meta.url),
      { type: 'module' }
    );
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('Decryption timed out. Please try again.'));
    }, 60_000);
    worker.onmessage = (e: MessageEvent) => {
      clearTimeout(timeout);
      worker.terminate();
      if (e.data.ok) resolve(e.data.result);
      else reject(new Error(e.data.error ?? 'Argon2 worker error'));
    };
    worker.onerror = (err) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(new Error(err.message ?? 'Argon2 worker crashed'));
    };
    worker.postMessage({ encrypted, passphrase });
  });
}
import { createUserProfile, getUserProfile, updateUserProfile, clearUserProfileCache, type UserProfile } from '../firestore';

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export interface EncryptedKeyPair {
  publicKey: string;
  encryptedPrivateKey: {
    ciphertext: string;
    salt: string;
    nonce: string;
  };
}

/**
 * Generate a new ML-KEM-768 (quantum-safe) key pair and encrypt the private key with Argon2id
 */
export async function generateAndEncryptKeyPair(passphrase: string): Promise<EncryptedKeyPair> {
  const { publicKey, privateKey } = await generateKeyPair();
  const publicKeyHex = bytesToHex(publicKey);
  const privateKeyHex = bytesToHex(privateKey);

  try {
    const testData = new TextEncoder().encode('mlkem_test_data');
    const encrypted = await encryptData(testData, publicKey);
    const decrypted = await decryptData(encrypted, privateKey);
    const decryptedText = new TextDecoder().decode(decrypted);
    if (decryptedText !== 'mlkem_test_data') {
      throw new Error('ML-KEM-768 key pair failed self-test');
    }
  } catch (keyTestError) {
    throw new Error(`ML-KEM-768 key pair is invalid: ${keyTestError instanceof Error ? keyTestError.message : String(keyTestError)}`);
  }

  const encryptedPrivateKey = encryptString(privateKeyHex, passphrase);
  
  return {
    publicKey: publicKeyHex,
    encryptedPrivateKey
  };
}

/**
 * Decrypt an Argon2id encrypted private key
 */
export async function decryptPrivateKey(
  encryptedPrivateKey: { ciphertext: string; salt: string; nonce: string },
  passphrase: string
): Promise<string> {
  // Runs Argon2id in a worker — keeps the UI responsive on mobile during the
  // ~1-3 s it takes to hash 64 MiB of memory.
  const decryptedHex = await decryptStringOffThread(encryptedPrivateKey, passphrase);

  const isHex = /^[a-fA-F0-9]+$/.test(decryptedHex);
  if (!isHex) {
    throw new Error('Incorrect passphrase. Please try again.');
  }

  if (decryptedHex.length === 4800) {
    try {
      const privateKeyBytes = hexToBytes(decryptedHex);
      if (privateKeyBytes.length !== 2400) {
        throw new Error('Incorrect passphrase. Please try again.');
      }
    } catch {
      throw new Error('Incorrect passphrase. Please try again.');
    }
  } else if (decryptedHex.length >= 64 && decryptedHex.length <= 8192 && decryptedHex.length % 2 === 0) {
    try {
      hexToBytes(decryptedHex);
    } catch {
      throw new Error('Incorrect passphrase. Please try again.');
    }
  } else {
    throw new Error('Incorrect passphrase. Please try again.');
  }

  return decryptedHex;
}

/**
 * Verify that a private key matches a public key by testing encryption/decryption
 */
export async function verifyKeyPair(privateKeyHex: string, publicKeyHex: string): Promise<boolean> {
  try {
    const privateKeyBytes = hexToBytes(privateKeyHex);
    const publicKeyBytes = hexToBytes(publicKeyHex);
    const testData = new TextEncoder().encode(`quantum_test_${Date.now()}`);
    const encrypted = await encryptData(testData, publicKeyBytes);
    const decrypted = await decryptData(encrypted, privateKeyBytes);
    return new TextDecoder().decode(decrypted) === new TextDecoder().decode(testData);
  } catch {
    return false;
  }
}

/**
 * Create new user profile with generated keys
 * If passphrase is empty, keys are generated but encryptedPrivateKey is not stored (hardware-only mode)
 */
export async function createUserWithKeys(
  userId: string,
  displayName: string,
  email: string,
  passphrase: string,
  theme: 'light' | 'dark' = 'dark'
): Promise<{ profile: UserProfile; privateKey: string }> {
  // Always generate a key pair
  const { publicKey, privateKey } = await generateKeyPair();
  const publicKeyHex = bytesToHex(publicKey);
  const privateKeyHex = bytesToHex(privateKey);
  
  // Test the generated key pair
  try {
    const testData = new TextEncoder().encode('mlkem_test_data');
    const encrypted = await encryptData(testData, publicKey);
    const decrypted = await decryptData(encrypted, privateKey);
    const decryptedText = new TextDecoder().decode(decrypted);
    
    if (decryptedText !== 'mlkem_test_data') {
      throw new Error('Quantum-safe ML-KEM-768 key pair failed verification');
    }
  } catch (keyTestError) {
    console.error('❌ Quantum-safe ML-KEM-768 key pair test failed:', keyTestError);
    throw new Error(`Quantum-safe ML-KEM-768 key pair is invalid: ${keyTestError instanceof Error ? keyTestError.message : String(keyTestError)}`);
  }
  
  const profile: UserProfile = {
    displayName,
    email: email.toLowerCase(), // Normalize email for case-insensitive matching
    theme,
    publicKey: publicKeyHex,
  };
  
  // Only encrypt and store private key if passphrase is provided
  if (passphrase && passphrase.length >= AUTH_CONFIG.passphrase.minLength) {
    const encryptedPrivateKey = encryptString(privateKeyHex, passphrase);
    profile.encryptedPrivateKey = encryptedPrivateKey;
  }
  
  // Store in Firestore
  await createUserProfile(userId, profile);
  
  // Fetch the complete profile from Firestore to ensure we have all fields
  // including termsAcceptedAt and other fields that were merged
  const completeProfile = await getUserProfile(userId);
  if (!completeProfile) {
    throw new Error('Failed to fetch complete user profile after creation');
  }
  
  return { profile: completeProfile, privateKey: privateKeyHex };
}

/**
 * Regenerate keys for existing user
 */
export async function regenerateUserKeys(
  userId: string,
  displayName: string,
  email: string,
  passphrase: string,
  theme: 'light' | 'dark' = 'dark'
): Promise<{ profile: UserProfile; privateKey: string }> {
  // Same as create - just overwrites existing profile
  return await createUserWithKeys(userId, displayName, email, passphrase, theme);
}

/**
 * Unlock user's private key using passphrase
 */
export async function unlockPrivateKey(
  userId: string,
  passphrase: string
): Promise<{ privateKey: string; profile: UserProfile }> {
  const profile = await getUserProfile(userId);
  if (!profile) {
    throw new Error('User profile not found');
  }
  
  if (!profile.encryptedPrivateKey) {
    throw new Error('No encrypted private key found. Please regenerate your keys.');
  }
  
  const privateKey = await decryptPrivateKey(profile.encryptedPrivateKey, passphrase);
  
  // Verify key pair integrity (non-blocking - just warn if there's an issue)
  try {
    const isValid = await verifyKeyPair(privateKey, profile.publicKey || '');
    if (!isValid) {
      console.warn('⚠️ Private key verification failed — you may encounter encryption issues.');
    }
  } catch (error) {
    console.warn('⚠️ Could not verify key pair compatibility:', error);
  }
  
  return { privateKey, profile };
}

/**
 * Re-encrypt the user's private key with a new passphrase.
 * Verifies the current passphrase first (off-thread Argon2id), then re-encrypts
 * with the new passphrase and persists to Firestore.
 * Returns the decrypted private key hex so the caller can update in-memory session state.
 */
export async function reencryptPrivateKey(
  userId: string,
  currentPassphrase: string,
  newPassphrase: string
): Promise<string> {
  const profile = await getUserProfile(userId);
  if (!profile?.encryptedPrivateKey) {
    throw new Error('User profile or encrypted private key not found');
  }

  // Decrypt with current passphrase (runs Argon2id in a Web Worker)
  let privateKeyHex: string;
  try {
    privateKeyHex = await decryptPrivateKey(profile.encryptedPrivateKey, currentPassphrase);
  } catch {
    throw new Error('Current passphrase is incorrect');
  }

  // Re-encrypt with new passphrase
  const newEncryptedPrivateKey = encryptString(privateKeyHex, newPassphrase);

  // Verify round-trip before persisting
  let verified: string;
  try {
    verified = await decryptPrivateKey(newEncryptedPrivateKey, newPassphrase);
  } catch {
    throw new Error('Failed to verify new passphrase. Please try again.');
  }
  if (verified !== privateKeyHex) {
    throw new Error('Failed to verify new passphrase. Please try again.');
  }

  // Persist to Firestore, wait for server acknowledgement, read back from
  // the server to confirm the correct ciphertext was stored, then bust the
  // in-memory cache so the next unlock reads the new key.
  await updateUserProfile(userId, { encryptedPrivateKey: newEncryptedPrivateKey });
  try {
    const { waitForFirestoreSync } = await import('../backend/FirebaseBackend');
    await waitForFirestoreSync();
  } catch (syncErr: any) {
    if (/offline|network|unavailable/i.test(syncErr?.message ?? '')) {
      throw new Error('Passphrase change could not be saved — your device appears to be offline. Please reconnect and try again.');
    }
  }

  // Read back directly from the Firestore server (bypassing all local caches) to
  // confirm the correct ciphertext was stored. This catches silent write failures
  // and any scenario where a stale value would be served on the next session.
  clearUserProfileCache();
  const { getUserProfileFromServer } = await import('../backend/FirebaseBackend');
  const confirmedProfile = await getUserProfileFromServer(userId);
  if (confirmedProfile?.encryptedPrivateKey?.ciphertext !== newEncryptedPrivateKey.ciphertext) {
    throw new Error('Passphrase change could not be verified — please try again.');
  }

  return privateKeyHex;
}

/**
 * Get public key for encryption (prefers Firestore but validates with private key if available)
 */
export async function getPublicKeyForEncryption(
  userId: string,
  privateKey?: string
): Promise<string> {
  // Get public key from Firestore
  const profile = await getUserProfile(userId);
  if (!profile?.publicKey) {
    throw new Error('Public key not found. Please regenerate your keys.');
  }
  
  // If we have the private key, verify it matches the public key (non-blocking)
  if (privateKey) {
    try {
      const isValid = await verifyKeyPair(privateKey, profile.publicKey);
      if (!isValid) {
        console.warn('⚠️ WARNING: Private key does not match stored public key. You may encounter issues.');
      } else {
        console.log('✅ Public key verification successful');
      }
    } catch (error) {
      console.warn('⚠️ WARNING: Could not verify key pair compatibility for encryption:', error);
    }
  }
  
  return profile.publicKey;
}