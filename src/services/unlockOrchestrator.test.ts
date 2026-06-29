import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockUnlockPrivateKey: vi.fn(),
  mockHasBiometricSetup: vi.fn(),
  mockGetLocalCredentialIds: vi.fn(),
  mockHasLocalPrfCredential: vi.fn(),
  mockSyncLocalCredentialsFromFirestore: vi.fn(),
  mockUnlockPrivateKeyWithDevice: vi.fn(),
  mockGetHardwareKeyCapabilities: vi.fn(),
  mockGetRegisteredHardwareKeys: vi.fn(),
  mockHasStoredPrivateKey: vi.fn(),
  mockRetrievePrivateKeyFromHardware: vi.fn(),
}));

vi.mock('./keyManagement', () => ({
  unlockPrivateKey: mocks.mockUnlockPrivateKey,
}));

vi.mock('../utils/biometricAuth', () => ({
  hasBiometricSetup: mocks.mockHasBiometricSetup,
  getLocalCredentialIds: mocks.mockGetLocalCredentialIds,
  hasLocalPrfCredential: mocks.mockHasLocalPrfCredential,
  syncLocalCredentialsFromFirestore: mocks.mockSyncLocalCredentialsFromFirestore,
  unlockPrivateKeyWithDevice: mocks.mockUnlockPrivateKeyWithDevice,
}));

vi.mock('../utils/hardwareKeyAuth', () => ({
  getHardwareKeyCapabilities: mocks.mockGetHardwareKeyCapabilities,
  getRegisteredHardwareKeys: mocks.mockGetRegisteredHardwareKeys,
  hasStoredPrivateKey: mocks.mockHasStoredPrivateKey,
  retrievePrivateKeyFromHardware: mocks.mockRetrievePrivateKeyFromHardware,
}));

import {
  getAvailableUnlockMethods,
  unlockWithPassphrase,
  unlockWithBiometric,
  unlockWithHardware,
  trySilentDeviceUnlock,
} from './unlockOrchestrator';

beforeEach(() => {
  vi.clearAllMocks();

  mocks.mockGetHardwareKeyCapabilities.mockResolvedValue({ supported: true });
  mocks.mockGetRegisteredHardwareKeys.mockResolvedValue([]);
  mocks.mockSyncLocalCredentialsFromFirestore.mockResolvedValue([]);
  mocks.mockGetLocalCredentialIds.mockReturnValue([]);
  mocks.mockHasLocalPrfCredential.mockReturnValue(false);
  mocks.mockHasStoredPrivateKey.mockResolvedValue(false);
  mocks.mockHasBiometricSetup.mockResolvedValue(false);
  mocks.mockUnlockPrivateKeyWithDevice.mockResolvedValue('device-private-key');
});

describe('unlockOrchestrator', () => {
  it('returns hardware as primary when a local hardware credential exists', async () => {
    mocks.mockGetRegisteredHardwareKeys.mockResolvedValue([{ id: 'cred-1', type: 'internal' }]);
    mocks.mockHasLocalPrfCredential.mockImplementation((_uid: string, id: string) => id === 'cred-1');

    const result = await getAvailableUnlockMethods('u1', { isMobile: false });

    expect(result.primaryMethod).toBe('hardware');
    expect(result.methods).toEqual(['hardware', 'passphrase', 'keyfile']);
    expect(result.registeredKeyIsPlatform).toBe(true);
  });

  it('falls back to biometric on mobile when only cross-platform key is local', async () => {
    mocks.mockGetRegisteredHardwareKeys.mockResolvedValue([{ id: 'yubi-1', type: 'usb' }]);
    mocks.mockHasLocalPrfCredential.mockImplementation((_uid: string, id: string) => id === 'yubi-1');
    mocks.mockGetLocalCredentialIds.mockReturnValue(['aabbccdd']);
    mocks.mockHasBiometricSetup.mockResolvedValue(true);

    const result = await getAvailableUnlockMethods('u1', { isMobile: true });

    expect(result.primaryMethod).toBe('biometric');
    expect(result.methods).toEqual(['biometric', 'passphrase', 'keyfile']);
    expect(result.registeredKeyIsPlatform).toBe(false);
  });

  it('does not show biometric on mobile when only non-platform credential ids exist', async () => {
    mocks.mockGetRegisteredHardwareKeys.mockResolvedValue([{ id: 'yubi-1', type: 'usb' }]);
    mocks.mockHasLocalPrfCredential.mockImplementation((_uid: string, id: string) => id === 'yubi-1');
    mocks.mockGetLocalCredentialIds.mockReturnValue(['AQIDBA==']);
    mocks.mockHasBiometricSetup.mockResolvedValue(true);

    const result = await getAvailableUnlockMethods('u1', { isMobile: true });

    expect(result.primaryMethod).toBe('passphrase');
    expect(result.methods).toEqual(['passphrase', 'keyfile']);
  });

  it('unlockWithPassphrase returns keyManagement private key', async () => {
    mocks.mockUnlockPrivateKey.mockResolvedValue({ privateKey: 'passphrase-key' });

    const key = await unlockWithPassphrase('u1', 'secret');

    expect(key).toBe('passphrase-key');
    expect(mocks.mockUnlockPrivateKey).toHaveBeenCalledWith('u1', 'secret');
  });

  it('unlockWithBiometric forwards options to device unlock utility', async () => {
    mocks.mockUnlockPrivateKeyWithDevice.mockResolvedValue('bio-key');

    const key = await unlockWithBiometric('u1', { interactive: true, preferDiscoverable: true });

    expect(key).toBe('bio-key');
    expect(mocks.mockUnlockPrivateKeyWithDevice).toHaveBeenCalledWith('u1', {
      interactive: true,
      preferDiscoverable: true,
    });
  });

  it('unlockWithHardware picks the first local key and retrieves key material', async () => {
    mocks.mockGetRegisteredHardwareKeys.mockResolvedValue([
      { id: 'cred-a', type: 'usb' },
      { id: 'cred-b', type: 'internal' },
    ]);
    mocks.mockHasLocalPrfCredential.mockImplementation((_uid: string, id: string) => id === 'cred-b');
    mocks.mockRetrievePrivateKeyFromHardware.mockResolvedValue('hardware-key');

    const key = await unlockWithHardware('u1');

    expect(key).toBe('hardware-key');
    expect(mocks.mockRetrievePrivateKeyFromHardware).toHaveBeenCalledWith('cred-b', 'u1');
  });

  it('unlockWithHardware throws if no local key material exists', async () => {
    mocks.mockGetRegisteredHardwareKeys.mockResolvedValue([{ id: 'cred-a', type: 'usb' }]);
    mocks.mockHasLocalPrfCredential.mockReturnValue(false);
    mocks.mockHasStoredPrivateKey.mockResolvedValue(false);

    await expect(unlockWithHardware('u1')).rejects.toThrow(
      'Private key not stored for this hardware key. Please re-register it in Profile > Privacy.'
    );
  });

  it('trySilentDeviceUnlock returns null when no local PRF credentials exist', async () => {
    mocks.mockSyncLocalCredentialsFromFirestore.mockResolvedValue([]);

    await expect(trySilentDeviceUnlock('u1')).resolves.toBeNull();
  });

  it('trySilentDeviceUnlock returns null when a local roaming key exists', async () => {
    mocks.mockSyncLocalCredentialsFromFirestore.mockResolvedValue(['cred-a']);
    mocks.mockGetRegisteredHardwareKeys.mockResolvedValue([{ id: 'yubi-1', type: 'usb' }]);
    mocks.mockHasLocalPrfCredential.mockImplementation((_uid: string, id: string) => id === 'yubi-1');

    await expect(trySilentDeviceUnlock('u1')).resolves.toBeNull();
    expect(mocks.mockUnlockPrivateKeyWithDevice).not.toHaveBeenCalled();
  });

  it('trySilentDeviceUnlock uses biometric path when only platform/no roaming constraints apply', async () => {
    mocks.mockSyncLocalCredentialsFromFirestore.mockResolvedValue(['cred-a']);
    mocks.mockGetRegisteredHardwareKeys.mockResolvedValue([{ id: 'platform-1', type: 'internal' }]);
    mocks.mockHasLocalPrfCredential.mockReturnValue(false);
    mocks.mockHasStoredPrivateKey.mockResolvedValue(false);
    mocks.mockUnlockPrivateKeyWithDevice.mockResolvedValue('silent-key');

    await expect(trySilentDeviceUnlock('u1')).resolves.toBe('silent-key');
    expect(mocks.mockUnlockPrivateKeyWithDevice).toHaveBeenCalledWith('u1', {
      interactive: false,
      preferDiscoverable: undefined,
    });
  });
});
