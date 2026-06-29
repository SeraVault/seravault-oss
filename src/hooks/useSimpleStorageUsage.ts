import { useState, useEffect, useCallback } from 'react';
import { getStorageUsage, clearStorageUsageCache, type StorageUsage } from '../services/simpleStorageUsage';
import { useAuth } from '../auth/AuthContext';
import { backendService } from '../backend/BackendService';

export interface UseStorageUsageReturn {
  usage: StorageUsage | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  clearCache: () => void;
}


function formatBytes(bytes: number): string {
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes < 0) {
    return '0 B';
  }
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Hook to manage storage usage with real-time updates
 * Listens to user profile document for instant updates when storage usage changes
 */
export function useSimpleStorageUsage(): UseStorageUsageReturn {
  const { user } = useAuth();
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate storage usage from user profile data
  const calculateUsageFromProfile = useCallback((data: any): StorageUsage => {
    const storageUsedRaw = data?.storageUsed;
    const storageUsed = typeof storageUsedRaw === 'number' && !isNaN(storageUsedRaw) ? storageUsedRaw : 0;

    const firestoreUsedRaw = data?.firestoreUsed;
    const firestoreUsed = typeof firestoreUsedRaw === 'number' && !isNaN(firestoreUsedRaw) ? firestoreUsedRaw : 0;

    const totalUsed = storageUsed + firestoreUsed;

    return {
      usedBytes: totalUsed,
      storageUsedBytes: storageUsed,
      firestoreUsedBytes: firestoreUsed,
      usedFormatted: formatBytes(totalUsed),
    };
  }, []);

  // Refresh storage usage by calling Cloud Function
  const refresh = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      console.log('📊 Force refreshing storage usage from Cloud Function');
      const result = await getStorageUsage(user.uid, true);
      setUsage(result);
      setError(null);
    } catch (err) {
      console.error('❌ Error refreshing storage usage:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh storage usage');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Clear cache
  const clearCache = useCallback(() => {
    if (user) {
      clearStorageUsageCache(user.uid);
      console.log('🗑️ Storage usage cache cleared');
    }
  }, [user]);

  // Real-time listener on user profile document
  useEffect(() => {
    if (!user) {
      setUsage(null);
      setError(null);
      return;
    }

    console.log('📊 Setting up real-time storage usage listener for user', user.uid);
    setLoading(true);

    const unsubscribe = backendService.realtime.subscribeToDocument(
      'users',
      user.uid,
      (data) => {
        if (data) {
          const newUsage = calculateUsageFromProfile(data);
          
          console.log('📊 Real-time storage usage update:', {
            storage: formatBytes(newUsage.storageUsedBytes),
            firestore: formatBytes(newUsage.firestoreUsedBytes),
            total: formatBytes(newUsage.usedBytes),
          });
          
          setUsage(newUsage);
          setError(null);
        } else {
          // User doc doesn't exist yet, set defaults
          setUsage({
            usedBytes: 0,
            storageUsedBytes: 0,
            firestoreUsedBytes: 0,
            usedFormatted: formatBytes(0),
          });
        }
        setLoading(false);
      }
    );

    return () => {
      console.log('📊 Cleaning up storage usage listener');
      unsubscribe();
    };
  }, [user, calculateUsageFromProfile]);

  return {
    usage,
    loading,
    error,
    refresh,
    clearCache,
  };
}