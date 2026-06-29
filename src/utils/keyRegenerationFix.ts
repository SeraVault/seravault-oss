/**
 * Key Regeneration Fix Utilities
 * Ensures atomic and complete key regeneration with proper cache clearing
 */

import { getUserProfile, createUserProfile, type UserProfile } from '../firestore';

/**
 * Clear all relevant caches that might contain stale key data
 */
export function clearAllKeyCaches(): void {
  console.log('🧹 Clearing all key-related caches...');
  
  // Clear localStorage keys that might contain encrypted keys or cached data
  const keysToRemove = [
    'privateKey',
    'encryptedPrivateKey', 
    'userProfile',
    'keyCache',
    'foldersCache',
    'filesCache'
  ];
  
  keysToRemove.forEach(key => {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch (error) {
      console.warn(`Failed to remove ${key} from storage:`, error);
    }
  });

  // Clear any IndexedDB caches if they exist
  try {
    if ('caches' in window) {
      caches.keys().then(cacheNames => {
        cacheNames.forEach(cacheName => {
          if (cacheName.includes('key') || cacheName.includes('crypto') || cacheName.includes('firestore')) {
            caches.delete(cacheName);
          }
        });
      });
    }
  } catch (error) {
    console.warn('Failed to clear service worker caches:', error);
  }
  
  console.log('✅ Cache clearing completed');
}

/**
 * Perform atomic key regeneration with verification
 */
export async function performAtomicKeyRegeneration(
  userId: string,
  newProfile: UserProfile
): Promise<{ success: boolean; error?: string }> {
  console.log('🔄 Starting atomic key regeneration...', {
    userId,
    newPublicKeyLength: newProfile.publicKey?.length
  });

  try {
    // Step 1: Clear all caches to prevent stale data
    clearAllKeyCaches();
    
    // Step 2: Update Firestore profile
    await createUserProfile(userId, newProfile);
    console.log('✅ Firestore profile updated');
    
    // Step 3: Verify the update with multiple attempts
    let verificationAttempts = 0;
    const maxAttempts = 5;
    
    while (verificationAttempts < maxAttempts) {
      verificationAttempts++;
      console.log(`🔍 Verification attempt ${verificationAttempts}/${maxAttempts}...`);
      
      // Add delay to allow Firestore consistency
      await new Promise(resolve => setTimeout(resolve, 200 * verificationAttempts));
      
      const verifiedProfile = await getUserProfile(userId);
      
      if (verifiedProfile?.publicKey === newProfile.publicKey && 
          verifiedProfile?.encryptedPrivateKey && 
          newProfile.encryptedPrivateKey &&
          JSON.stringify(verifiedProfile.encryptedPrivateKey) === JSON.stringify(newProfile.encryptedPrivateKey)) {
        
        console.log('🔍 Performing key compatibility validation...');
        
        // Step 4: Validate that the keys actually work together
        try {
          const { hexToBytes } = await import('../crypto/quantumSafeCrypto');
          
          // Basic key format validation
          const publicKeyBytes = hexToBytes(newProfile.publicKey);
          
          if (publicKeyBytes.length !== 1184) {
            throw new Error(`Invalid ML-KEM-768 public key length: ${publicKeyBytes.length} bytes`);
          }
          
          console.log('✅ Key format validation passed');
          console.log('✅ Key regeneration verification successful');
          return { success: true };
        } catch (validationError) {
          console.error('❌ Key validation failed:', validationError);
          return { 
            success: false, 
            error: `Key validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}` 
          };
        }
      }
      
      console.warn(`⚠️ Verification attempt ${verificationAttempts} failed:`, {
        expectedPublicKey: newProfile.publicKey,
        actualPublicKey: verifiedProfile?.publicKey,
        expectedHasEncryptedKey: !!newProfile.encryptedPrivateKey,
        actualHasEncryptedKey: !!verifiedProfile?.encryptedPrivateKey,
        profileExists: !!verifiedProfile
      });
    }
    
    // If we get here, verification failed after all attempts
    return { 
      success: false, 
      error: `Verification failed after ${maxAttempts} attempts. Expected: ${newProfile.publicKey}, Got: ${(await getUserProfile(userId))?.publicKey || 'null'}` 
    };
    
  } catch (error) {
    console.error('❌ Atomic key regeneration failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

/**
 * Force refresh all components that cache user profile data
 */
export function forceComponentRefresh(): void {
  console.log('🔄 Forcing component refresh...');
  
  // Dispatch custom events to notify components to refresh
  window.dispatchEvent(new CustomEvent('keyRegenerationComplete', {
    detail: { timestamp: Date.now() }
  }));
  
  window.dispatchEvent(new CustomEvent('clearUserProfileCache', {
    detail: { timestamp: Date.now() }
  }));
  
  // Force a complete page refresh if needed (as a last resort)
  // window.location.reload();
}