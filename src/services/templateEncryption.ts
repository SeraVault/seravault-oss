/**
 * Encryption/decryption service for custom form templates.
 *
 * Templates are stored in Firestore as:
 * {
 *   encryptedData: { ciphertext: string; nonce: string },
 *   encryptedKeys: { [userId: string]: string },   // ML-KEM-768 encrypted AES key
 *   author: string,
 *   isEncrypted: true,       // sentinel so we know to decrypt
 *   createdAt, updatedAt, ...
 * }
 */

import {
  encryptData,
  decryptData,
  bytesToHex,
  hexToBytes,
} from '../crypto/quantumSafeCrypto';
import { getPublicKeyForEncryption } from './keyManagement';
import type { FormTemplate } from '../utils/formFiles';

/** Shape stored in Firestore for an encrypted template */
export interface EncryptedTemplateDoc {
  encryptedData: { ciphertext: string; nonce: string };
  encryptedKeys: { [userId: string]: string };
  author: string;
  isEncrypted: true;
  createdAt?: unknown;
  updatedAt?: unknown;
  // Extra plain-text fields kept for display/querying without decryption:
  isPublic?: boolean;
  usageCount?: number;
}

/**
 * Encrypt a FormTemplate for a single user.
 * Returns the Firestore document payload (minus createdAt/updatedAt which the
 * caller adds separately).
 */
export async function encryptTemplateForUser(
  template: FormTemplate,
  userId: string,
  privateKey: string
): Promise<Omit<EncryptedTemplateDoc, 'createdAt' | 'updatedAt'>> {
  // Resolve the user's public key (fetched from Firestore profile)
  const publicKeyHex = await getPublicKeyForEncryption(userId, privateKey);
  const publicKey = hexToBytes(publicKeyHex);

  // Serialize the template to JSON bytes
  const plaintext = new TextEncoder().encode(JSON.stringify(template));

  // Generate a random 256-bit AES content key
  const contentKey = crypto.getRandomValues(new Uint8Array(32));

  // Encrypt the template JSON with AES-256-GCM
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await crypto.subtle.importKey(
    'raw',
    contentKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    aesKey,
    plaintext
  );

  const encryptedData = {
    ciphertext: bytesToHex(new Uint8Array(encryptedBuf)),
    nonce: bytesToHex(nonce),
  };

  // Encrypt the content key with ML-KEM-768 + AES for the user
  const encryptedKeyResult = await encryptData(contentKey, publicKey);
  const combinedKey = new Uint8Array(
    encryptedKeyResult.iv.length +
    encryptedKeyResult.encapsulatedKey.length +
    encryptedKeyResult.ciphertext.length
  );
  combinedKey.set(encryptedKeyResult.iv, 0);
  combinedKey.set(encryptedKeyResult.encapsulatedKey, encryptedKeyResult.iv.length);
  combinedKey.set(
    encryptedKeyResult.ciphertext,
    encryptedKeyResult.iv.length + encryptedKeyResult.encapsulatedKey.length
  );

  return {
    encryptedData,
    encryptedKeys: { [userId]: bytesToHex(combinedKey) },
    author: userId,
    isEncrypted: true,
    isPublic: template.isPublic ?? false,
    usageCount: template.usageCount ?? 0,
  };
}

/**
 * Decrypt a Firestore template document back to a FormTemplate.
 * Throws if the user has no key for this document.
 */
export async function decryptTemplateDoc(
  doc: EncryptedTemplateDoc & { id?: string },
  userId: string,
  privateKey: string
): Promise<FormTemplate> {
  const encryptedKeyHex = doc.encryptedKeys?.[userId];
  if (!encryptedKeyHex) {
    throw new Error('No decryption key found for this template');
  }

  const privateKeyBytes = hexToBytes(privateKey);

  // Parse the encrypted content key: IV (12) + encapsulated key (1088) + ciphertext (32)
  const keyData = hexToBytes(encryptedKeyHex);
  const iv = keyData.slice(0, 12);
  const encapsulatedKey = keyData.slice(12, 12 + 1088);
  const keyCiphertext = keyData.slice(12 + 1088);

  // Recover the AES content key via ML-KEM-768
  const contentKey = await decryptData(
    { iv, encapsulatedKey, ciphertext: keyCiphertext },
    privateKeyBytes
  );

  // Decrypt the template JSON
  const aesKey = await crypto.subtle.importKey(
    'raw',
    contentKey.slice(0, 32),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  const nonce = hexToBytes(doc.encryptedData.nonce);
  const ciphertext = hexToBytes(doc.encryptedData.ciphertext);

  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce },
    aesKey,
    ciphertext
  );

  const template = JSON.parse(new TextDecoder().decode(plainBuf)) as FormTemplate;

  // Restore the Firestore doc ID as templateId
  if (doc.id && !template.templateId) {
    template.templateId = doc.id;
  }

  return template;
}
