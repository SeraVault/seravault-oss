/**
 * DemoPassphraseProvider — passphrase gate bypass for demo/screenshot mode.
 * Immediately returns a fake privateKey so the vault renders without any unlock dialog.
 * Uses the real PassphraseContext so all usePassphrase() calls get the demo key.
 */
import React from 'react';
import { PassphraseContext } from './PassphraseContext';
import { DEMO_PRIVATE_KEY } from '../backend/MockBackend';

export const DemoPassphraseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <PassphraseContext.Provider
      value={{
        privateKey: DEMO_PRIVATE_KEY,
        setPrivateKey: () => {},
        clearPrivateKey: () => {},
        hasStoredKey: true,
        loading: false,
        requestUnlock: () => {},
        refreshPrivateKey: () => {},
        unlockWithPassphrase: async () => {},
      }}
    >
      {children}
    </PassphraseContext.Provider>
  );
};
