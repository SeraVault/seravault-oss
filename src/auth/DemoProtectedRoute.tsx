// @ts-nocheck
/**
 * DemoProtectedRoute — replaces ProtectedRoute in demo mode.
 * Always passes the demo user through without any auth/passphrase checks.
 * Wraps children in DemoPassphraseProvider so usePassphrase() returns the demo key.
 */
import React from 'react';
import { Outlet } from 'react-router-dom';
import { DemoPassphraseProvider } from './DemoPassphraseContext';
import { ImportProvider } from '../context/ImportContext';

// We re-export PassphraseContext symbols from the demo context so all hooks resolve correctly
export { useDemoPassphrase as usePassphrase } from './DemoPassphraseContext';

const DemoProtectedRoute: React.FC = () => {
  return (
    <DemoPassphraseProvider>
      <ImportProvider>
        <Outlet />
      </ImportProvider>
    </DemoPassphraseProvider>
  );
};

export default DemoProtectedRoute;
