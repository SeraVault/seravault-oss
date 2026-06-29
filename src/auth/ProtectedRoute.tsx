import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { PassphraseProvider } from './PassphraseContext';
import { DemoPassphraseProvider } from './DemoPassphraseContext';
import { ImportProvider } from '../context/ImportContext';

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

const ProtectedRoute: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    // You can return a loading spinner here
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  const ActivePassphraseProvider = IS_DEMO ? DemoPassphraseProvider : PassphraseProvider;

  return (
    <ActivePassphraseProvider>
      <ImportProvider>
        <Outlet />
      </ImportProvider>
    </ActivePassphraseProvider>
  );
};

export default ProtectedRoute;
