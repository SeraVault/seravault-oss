import { unlockPrivateKey } from './keyManagement';
import {
  hasBiometricSetup,
  getLocalCredentialIds,
  hasLocalPrfCredential,
  syncLocalCredentialsFromFirestore,
  unlockPrivateKeyWithDevice,
} from '../utils/biometricAuth';
import {
  getHardwareKeyCapabilities,
  getRegisteredHardwareKeys,
  hasStoredPrivateKey,
  retrievePrivateKeyFromHardware,
} from '../utils/hardwareKeyAuth';

export type UnlockMethod = 'hardware' | 'biometric' | 'passphrase' | 'keyfile';

export interface AvailableUnlockMethodsResult {
  methods: UnlockMethod[];
  primaryMethod: UnlockMethod;
  registeredKeyIsPlatform: boolean;
}

interface LocalHardwareCredential {
  credentialId: string;
  isPlatform: boolean;
}

async function findLocalHardwareCredential(userId: string): Promise<LocalHardwareCredential | null> {
  const hwCaps = await getHardwareKeyCapabilities();
  if (!hwCaps.supported) return null;

  const keys = await getRegisteredHardwareKeys(userId);
  if (keys.length === 0) return null;

  await syncLocalCredentialsFromFirestore(userId);

  for (const key of keys) {
    if (hasLocalPrfCredential(userId, key.id) || await hasStoredPrivateKey(key.id, userId)) {
      return {
        credentialId: key.id,
        isPlatform: key.type === 'internal',
      };
    }
  }

  return null;
}

export async function getAvailableUnlockMethods(
  userId: string,
  options?: { isMobile?: boolean }
): Promise<AvailableUnlockMethodsResult> {
  const methods: UnlockMethod[] = ['passphrase'];
  let registeredKeyIsPlatform = false;
  const isMobile = options?.isMobile === true;

  try {
    const localHardware = await findLocalHardwareCredential(userId);
    if (localHardware && (!isMobile || localHardware.isPlatform)) {
      methods.unshift('hardware');
      registeredKeyIsPlatform = localHardware.isPlatform;
    }
  } catch {
    // keep fallback methods
  }

  if (!methods.includes('hardware')) {
    try {
      await syncLocalCredentialsFromFirestore(userId);
      const localCredentialIds = getLocalCredentialIds(userId);
      // registerBiometric() stores hex credential IDs for platform passkeys.
      // If only base64 IDs are present, they are typically hardware-key records
      // and should not surface as a phone passkey/biometric option.
      const hasLikelyPlatformCredential = localCredentialIds.some(id => /^[0-9a-f]+$/.test(id) && id.length % 2 === 0);
      if (hasLikelyPlatformCredential && await hasBiometricSetup(userId)) {
        methods.unshift('biometric');
      }
    } catch {
      // keep fallback methods
    }
  }

  methods.push('keyfile');

  return {
    methods,
    primaryMethod: methods[0],
    registeredKeyIsPlatform,
  };
}

export async function unlockWithPassphrase(userId: string, passphrase: string): Promise<string> {
  const result = await unlockPrivateKey(userId, passphrase);
  return result.privateKey;
}

export async function unlockWithBiometric(
  userId: string,
  options?: { interactive?: boolean; preferDiscoverable?: boolean }
): Promise<string> {
  return unlockPrivateKeyWithDevice(userId, {
    interactive: options?.interactive,
    preferDiscoverable: options?.preferDiscoverable,
  });
}

export async function unlockWithHardware(userId: string): Promise<string> {
  const localHardware = await findLocalHardwareCredential(userId);
  if (!localHardware) {
    throw new Error('Private key not stored for this hardware key. Please re-register it in Profile > Privacy.');
  }

  return retrievePrivateKeyFromHardware(localHardware.credentialId, userId);
}

export async function trySilentDeviceUnlock(userId: string): Promise<string | null> {
  const localCreds = await syncLocalCredentialsFromFirestore(userId);
  if (localCreds.length === 0) return null;

  const hwKeys = await getRegisteredHardwareKeys(userId);
  for (const key of hwKeys) {
    if (key.type !== 'internal') {
      if (hasLocalPrfCredential(userId, key.id) || await hasStoredPrivateKey(key.id, userId)) {
        return null;
      }
    }
  }

  return unlockWithBiometric(userId, { interactive: false });
}