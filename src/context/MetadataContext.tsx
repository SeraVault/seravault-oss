import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { metadataPreloader } from '../services/metadataPreloader';
import { metadataCache } from '../services/metadataCache';

interface MetadataContextType {
  isPreloading: boolean;
  preloadCompleted: boolean;
  preloadStats: {
    totalFiles: number;
    processedFiles: number;
    duration: number;
  } | null;
  refreshTags: () => void;
  triggerTagRefresh: () => void; // New method to trigger tag refresh
  refreshCounter: number; // Expose refresh counter for components to watch
}

const MetadataContext = createContext<MetadataContextType>({
  isPreloading: false,
  preloadCompleted: false,
  preloadStats: null,
  refreshTags: () => {},
  triggerTagRefresh: () => {},
  refreshCounter: 0,
});

const MetadataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const [isPreloading, setIsPreloading] = useState(false);
  const [preloadCompleted, setPreloadCompleted] = useState(false);
  const [preloadStats, setPreloadStats] = useState<MetadataContextType['preloadStats']>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Trigger refresh for components that need to update after preload
  const refreshTags = useCallback(() => {
    setRefreshCounter(prev => prev + 1);
  }, []);

  // Trigger tag refresh when individual files are modified
  const triggerTagRefresh = useCallback(() => {
    console.log('🏷️ Triggering tag refresh due to file/tag updates...');
    setRefreshCounter(prev => prev + 1);
  }, []);

  // Start preloading when user unlocks private key
  useEffect(() => {
    if (!user || !privateKey) {
      setIsPreloading(false);
      setPreloadCompleted(false);
      setPreloadStats(null);
      metadataCache.clear();
      return;
    }

    // Start background preloading
    const startPreload = async () => {
      setIsPreloading(true);
      setPreloadCompleted(false);

      try {
        // Set cache timeout preference
        const hasLongerPreference = localStorage.getItem(`rememberChoice_${user.uid}`) === 'true';
        metadataCache.setTimeoutPreference(hasLongerPreference);

        const startTime = Date.now();
        await metadataPreloader.preloadAllMetadata(user.uid, privateKey);
        const duration = Date.now() - startTime;

        const stats = {
          totalFiles: 0, // Will be updated by preloader
          processedFiles: 0, // Will be updated by preloader
          duration,
        };

        setPreloadStats(stats);
        setPreloadCompleted(true);

        console.log('🎉 Metadata preload completed via React context!');

        // Trigger refresh for all components that use tags
        refreshTags();

      } catch (error) {
        console.error('Background metadata preload failed:', error);
      } finally {
        setIsPreloading(false);
      }
    };

    startPreload();
  }, [user, privateKey]);

  const contextValue: MetadataContextType = useMemo(() => ({
    isPreloading,
    preloadCompleted,
    preloadStats,
    refreshTags,
    triggerTagRefresh,
    refreshCounter,
  }), [isPreloading, preloadCompleted, preloadStats, refreshTags, triggerTagRefresh, refreshCounter]);

  return (
    <MetadataContext.Provider value={contextValue}>
      {children}
    </MetadataContext.Provider>
  );
};

export const useMetadata = () => useContext(MetadataContext);
export { MetadataProvider };