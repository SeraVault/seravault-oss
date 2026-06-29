import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  updateUserProfile: vi.fn(),
  clearUserProfileCache: vi.fn(),
  getCredsGet: vi.fn(),
  importKey: vi.fn(),
  decrypt: vi.fn(),
}));

vi.mock('../firestore', () => ({
  getUserProfile: mocks.getUserProfile,
  updateUserProfile: mocks.updateUserProfile,
  clearUserProfileCache: mocks.clearUserProfileCache,
}));

import { retrieveBiometricEncryptedKey } from './biometricAuth';

function strToBuffer(s: string): ArrayBuffer {
  return new TextEncoder().encode(s).buffer;
}

function b64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

describe('retrieveBiometricEncryptedKey discoverable fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();

    Object.defineProperty(global.navigator, 'credentials', {
      value: { get: mocks.getCredsGet },
      configurable: true,
    });

    vi.spyOn(global.crypto.subtle, 'importKey').mockImplementation(mocks.importKey);
    vi.spyOn(global.crypto.subtle, 'decrypt').mockImplementation(mocks.decrypt);
    vi.spyOn(global.crypto, 'getRandomValues').mockImplementation((arr: Uint8Array) => arr);

    mocks.importKey.mockResolvedValue({});
    mocks.decrypt.mockResolvedValue(strToBuffer('private-key-hex'));
  });

  it('decrypts via discoverable PRF even when credential id does not map directly', async () => {
    const discoveredBase64 = 'AQIDBA==';
    const rawId = b64ToBytes(discoveredBase64);

    const fakeAssertion = {
      rawId: rawId.buffer,
      response: { signature: new Uint8Array([1, 2, 3]).buffer },
      getClientExtensionResults: () => ({
        prf: { results: { first: new Uint8Array([9, 9, 9, 9]).buffer } },
      }),
    } as unknown as PublicKeyCredential;

    mocks.getCredsGet.mockResolvedValue(fakeAssertion);

    // Firestore key intentionally doesn't match discovered candidate IDs.
    mocks.getUserProfile.mockResolvedValue({
      biometricKeys: {
        stale_credential_key: {
          encryptedKey: 'abcd',
          iv: '00112233445566778899aabb',
          version: 'prf-v3',
        },
      },
    });

    const result = await retrieveBiometricEncryptedKey('u1', undefined, { preferDiscoverable: true });
    expect(result).toBe('private-key-hex');
  });
});
