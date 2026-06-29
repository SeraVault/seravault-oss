/**
 * ML-KEM-768 Key Validation Utilities
 * Validates quantum-safe key pairs for proper encryption/decryption
 */

import { encryptData, decryptData, hexToBytes, bytesToHex } from '../crypto/quantumSafeCrypto';
import { getUserProfile } from '../firestore';

/**
 * Validate that a public and private key pair are compatible
 */
export async function validateKeyPair(publicKeyHex: string, privateKeyHex: string): Promise<{ isValid: boolean; error?: string }> {
  try {
    console.log('🔍 Validating key pair compatibility...', {
      publicKeyLength: publicKeyHex.length,
      privateKeyLength: privateKeyHex.length
    });
    
    const publicKeyBytes = hexToBytes(publicKeyHex);
    const privateKeyBytes = hexToBytes(privateKeyHex);
    
    // Test with a small message
    const testMessage = new TextEncoder().encode('key-validation-test');
    const encrypted = await encryptData(testMessage, publicKeyBytes);
    const decrypted = await decryptData(encrypted, privateKeyBytes);
    const decryptedText = new TextDecoder().decode(decrypted);
    
    const isValid = decryptedText === 'key-validation-test';
    console.log('✅ Key pair validation result:', isValid);
    
    return { isValid };
  } catch (error) {
    console.error('❌ Key pair validation failed:', error);
    return { 
      isValid: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Validate that a user's stored keys are consistent
 * This helps identify the root cause of decryption failures
 */
export async function validateUserKeys(userId: string, privateKeyHex: string): Promise<{
  isValid: boolean;
  storedPublicKey: string | null;
  error?: string;
}> {
  try {
    console.log('🔍 Validating user keys for:', userId);
    
    // Get the user's stored public key
    const userProfile = await getUserProfile(userId);
    if (!userProfile?.publicKey) {
      return {
        isValid: false,
        storedPublicKey: null,
        error: 'No public key found in user profile'
      };
    }
    
    console.log('📋 User profile public key found:', {
      length: userProfile.publicKey.length,
      preview: userProfile.publicKey.substring(0, 16) + '...'
    });
    
    // Validate the key pair
    const validation = await validateKeyPair(userProfile.publicKey, privateKeyHex);
    
    return {
      isValid: validation.isValid,
      storedPublicKey: userProfile.publicKey,
      error: validation.error
    };
  } catch (error) {
    console.error('❌ User key validation failed:', error);
    return {
      isValid: false,
      storedPublicKey: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Debug function to log key information during encryption/decryption operations
 */
export function logKeyDebugInfo(context: string, publicKeyHex?: string, privateKeyHex?: string) {
  console.log(`🔑 Key Debug Info [${context}]:`, {
    publicKeyProvided: !!publicKeyHex,
    privateKeyProvided: !!privateKeyHex,
    publicKeyLength: publicKeyHex?.length || 'N/A',
    privateKeyLength: privateKeyHex?.length || 'N/A',
    publicKeyPreview: publicKeyHex ? publicKeyHex.substring(0, 16) + '...' : 'N/A',
    privateKeyPreview: privateKeyHex ? privateKeyHex.substring(0, 16) + '...' : 'N/A',
    timestamp: new Date().toISOString()
  });
}