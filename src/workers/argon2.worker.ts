/**
 * Web Worker for Argon2id key derivation.
 * Runs the CPU-intensive 64 MiB Argon2id operation off the main thread
 * so the UI stays responsive during passphrase unlock.
 */
import { decryptString } from '../crypto/quantumSafeCrypto';

self.onmessage = (e: MessageEvent) => {
  const { encrypted, passphrase } = e.data as {
    encrypted: { ciphertext: string; salt: string; nonce: string };
    passphrase: string;
  };
  try {
    const result = decryptString(encrypted, passphrase);
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
