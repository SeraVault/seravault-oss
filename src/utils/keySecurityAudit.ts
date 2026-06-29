/**
 * Security audit utilities to prevent private key leakage between users
 * CRITICAL: These functions help prevent private key contamination vulnerabilities
 */

import { encryptData, decryptData, hexToBytes, bytesToHex } from '../crypto/quantumSafeCrypto';

/**
 * Verify that a private key can decrypt data encrypted with its corresponding public key
 * This prevents using private keys that don't belong to the user
 */
export async function verifyPrivateKeyOwnership(
  privateKeyHex: string,
  publicKeyHex: string
): Promise<boolean> {
  try {
    // Convert hex strings to bytes
    const privateKeyBytes = hexToBytes(privateKeyHex);
    const publicKeyBytes = hexToBytes(publicKeyHex);
    
    // Generate test data to encrypt/decrypt
    const testData = new TextEncoder().encode(`key_ownership_test_${Date.now()}`);
    
    // Encrypt with the public key
    const encrypted = await encryptData(testData, publicKeyBytes);
    
    // Try to decrypt with the private key
    const decrypted = await decryptData(encrypted, privateKeyBytes);
    
    // Verify the decrypted data matches
    const decryptedText = new TextDecoder().decode(decrypted);
    const originalText = new TextDecoder().decode(testData);
    
    const isValid = decryptedText === originalText;
    
    if (isValid) {
      console.log('✅ Private key ownership verified successfully');
    } else {
      console.error('❌ SECURITY ALERT: Private key does not match public key!');
    }
    
    return isValid;
  } catch (error) {
    console.error('❌ SECURITY ALERT: Private key ownership verification failed:', error);
    return false;
  }
}

/**
 * Audit function to check for potential private key contamination
 */
export async function auditPrivateKeyIntegrity(
  userId: string,
  privateKeyHex: string,
  publicKeyHex: string
): Promise<{
  isValid: boolean;
  issues: string[];
  userId: string;
}> {
  const issues: string[] = [];
  
  // Check key format
  if (privateKeyHex.length !== 64) {
    issues.push(`Invalid private key length: expected 64 hex chars, got ${privateKeyHex.length}`);
  }
  
  if (publicKeyHex.length !== 64) {
    issues.push(`Invalid public key length: expected 64 hex chars, got ${publicKeyHex.length}`);
  }
  
  // Check key ownership
  let ownershipValid = false;
  try {
    ownershipValid = await verifyPrivateKeyOwnership(privateKeyHex, publicKeyHex);
    if (!ownershipValid) {
      issues.push('Private key does not correspond to public key - potential contamination detected');
    }
  } catch (error) {
    issues.push(`Key ownership verification failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  return {
    isValid: issues.length === 0 && ownershipValid,
    issues,
    userId
  };
}

/**
 * Log security audit results
 */
export function logSecurityAudit(auditResult: ReturnType<typeof auditPrivateKeyIntegrity>) {
  auditResult.then(result => {
    if (result.isValid) {
      console.log(`🔐 Security audit PASSED for user ${result.userId}`);
    } else {
      console.error(`🚨 SECURITY AUDIT FAILED for user ${result.userId}:`);
      result.issues.forEach(issue => {
        console.error(`  ❌ ${issue}`);
      });
    }
  });
}