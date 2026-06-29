/**
 * DemoAuthProvider — auth bypass for demo/screenshot mode.
 * Immediately returns the demo user without any Firebase calls.
 * Uses the real AuthContext so all useAuth() calls get the demo user.
 */
import React from 'react';
import { AuthContext } from './AuthContext';
import { DEMO_USER } from '../backend/MockBackend';

export const DemoAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <AuthContext.Provider
      value={{
        user: DEMO_USER,
        loading: false,
        logout: async () => {},
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
