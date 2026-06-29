/**
 * In-memory cache for decrypted ML-KEM-768 file keys.
 *
 * ML-KEM-768 decapsulation in pure JavaScript is the main per-file performance
 * bottleneck — especially on mobile. By caching the 32-byte decrypted file key
 * after the first decapsulation, every subsequent operation on that file
 * (view, rename, deep-search, re-open) is free for the rest of the session.
 *
 * Security: the cache lives only in JS heap memory. It is never written to
 * disk, localStorage, or IndexedDB. Calling clearFileKeyCache() (on logout)
 * drops all references so the keys can be GC'd.
 */
import { decryptData, hexToBytes } from '../crypto/quantumSafeCrypto';

// Map key: first 48 hex chars of the encryptedKey string.
// That covers the 12-byte random IV + 12 bytes of the ML-KEM encapsulated ciphertext.
// Collision probability ≈ 1/2^96 — effectively unique per encrypt event.
const cache = new Map<string, Uint8Array>();

/**
 * Fixed 32-byte key used in demo mode.
 * Sentinel value: encryptedKey === 'DEMO' → skip ML-KEM and return this key.
 * decryptMetadata treats nonce='000...0' (24 zeros) as "plaintext = hex-decode ciphertext".
 */
export const DEMO_FILE_KEY = new Uint8Array(32); // all zeros — only used in demo mode

/** Drop all cached file keys (call on logout / lock). */
export function clearFileKeyCache(): void {
  cache.clear();
}

/** Cached count — useful for diagnostics. */
export function fileKeyCacheSize(): number {
  return cache.size;
}

/**
 * Return the decrypted 32-byte AES file key, running ML-KEM-768 decapsulation
 * only on the first call for each unique encrypted key blob.
 */
export async function getOrDecryptFileKey(
  encryptedKey: string,
  userPrivateKey: string
): Promise<Uint8Array> {
  // Demo mode sentinel — skip ML-KEM entirely
  if (encryptedKey === 'DEMO') return DEMO_FILE_KEY;

  const ck = encryptedKey.slice(0, 48);
  const cached = cache.get(ck);
  if (cached) return cached;

  const keyData = hexToBytes(encryptedKey);
  // Layout: IV (12 bytes) + ML-KEM encapsulated key (1088 bytes) + AES ciphertext (32 bytes)
  const iv              = keyData.slice(0, 12);
  const encapsulatedKey = keyData.slice(12, 12 + 1088);
  const ciphertext      = keyData.slice(12 + 1088);

  const privateKeyBytes = hexToBytes(userPrivateKey);
  const fileKey = await decryptData({ iv, encapsulatedKey, ciphertext }, privateKeyBytes);

  cache.set(ck, fileKey);
  return fileKey;
}
