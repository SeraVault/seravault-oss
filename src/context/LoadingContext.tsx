import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';

interface LoadingContextType {
  isDataLoading: boolean;
  setIsDataLoading: (loading: boolean) => void;
}

const LoadingContext = createContext<LoadingContextType>({
  isDataLoading: false,
  setIsDataLoading: () => {},
});

const LoadingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDataLoading, setIsDataLoading] = useState(false);
  const { user } = useAuth();
  const { privateKey } = usePassphrase();

  // Only clear data loading when user or privateKey become unavailable
  // Don't auto-set to true - let MainContent control when data loading starts
  useEffect(() => {
    if (!user || !privateKey) {
      // Clear loading when user or privateKey is not available
      setIsDataLoading(false);
    }
  }, [user, privateKey]);

  const contextValue: LoadingContextType = {
    isDataLoading,
    setIsDataLoading,
  };

  return (
    <LoadingContext.Provider value={contextValue}>
      {children}
    </LoadingContext.Provider>
  );
};

export const useGlobalLoading = () => useContext(LoadingContext);
export { LoadingProvider };