import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getUserRecents, updateUserRecents } from '../firestore';
import { STORAGE_KEYS } from '../constants/storage-keys';

export interface RecentItem {
  id: string;
  // Store only non-sensitive metadata - names will be decrypted on-demand
  type: 'file' | 'form';
  parent: string | null;
  accessedAt: string;
  // Remove sensitive fields that would expose decrypted data
}

interface RecentsContextType {
  recentItems: RecentItem[];
  addRecentItem: (item: Omit<RecentItem, 'accessedAt'>) => void;
  clearRecents: () => void;
  isRecentsView: boolean;
  setIsRecentsView: (value: boolean) => void;
  isFavoritesView: boolean;
  setIsFavoritesView: (value: boolean) => void;
  isSharedView: boolean;
  setIsSharedView: (value: boolean) => void;
  isArchivedView: boolean;
  setIsArchivedView: (value: boolean) => void;
  selectedDocType: string | null;
  setSelectedDocType: (value: string | null) => void;
}

const RecentsContext = createContext<RecentsContextType | undefined>(undefined);

export const useRecents = () => {
  const context = useContext(RecentsContext);
  if (!context) {
    throw new Error('useRecents must be used within a RecentsProvider');
  }
  return context;
};

export const RecentsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [isRecentsView, setIsRecentsView] = useState(false);
  const [isFavoritesView, setIsFavoritesView] = useState(false);
  const [isSharedView, setIsSharedView] = useState(false);
  const [isArchivedView, setIsArchivedView] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<string | null>(null);
  const MAX_RECENT_ITEMS = 20;

  // Get storage key for user (for migration from localStorage)
  const getStorageKey = (userId: string) => STORAGE_KEYS.recentItems(userId);

  // Load recents from Firestore on mount
  useEffect(() => {
    if (!user) {
      setRecentItems([]);
      return;
    }

    const loadRecents = async () => {
      try {
        // Try loading from Firestore first
        const firestoreRecents = await getUserRecents(user.uid);
        
        if (firestoreRecents && firestoreRecents.length > 0) {
          // Filter out items older than 30 days
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          
          const validItems = firestoreRecents.filter(item => 
            new Date(item.accessedAt) > thirtyDaysAgo
          );
          
          setRecentItems(validItems);
          
          // Update Firestore if we filtered out old items
          if (validItems.length !== firestoreRecents.length) {
            await updateUserRecents(user.uid, validItems);
          }
        } else {
          // Migration path: try loading from localStorage
          const stored = localStorage.getItem(getStorageKey(user.uid));
          if (stored) {
            const parsed: RecentItem[] = JSON.parse(stored);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const validItems = parsed.filter(item => 
              new Date(item.accessedAt) > thirtyDaysAgo
            );
            
            setRecentItems(validItems);
            
            // Migrate to Firestore
            if (validItems.length > 0) {
              await updateUserRecents(user.uid, validItems);
              console.log('✅ Migrated recent items from localStorage to Firestore');
            }
            
            // Clean up localStorage after successful migration
            localStorage.removeItem(getStorageKey(user.uid));
          }
        }
      } catch (error) {
        console.error('Error loading recent items:', error);
        setRecentItems([]);
      }
    };

    loadRecents();
  }, [user]);

  const addRecentItem = async (newItem: Omit<RecentItem, 'accessedAt'>) => {
    if (!user) return;

    // Only store non-sensitive metadata
    const recentItem: RecentItem = {
      id: newItem.id,
      type: newItem.type,
      parent: newItem.parent,
      accessedAt: new Date().toISOString(),
    };

    setRecentItems(prev => {
      // Remove existing entry if it exists
      const filtered = prev.filter(item => item.id !== recentItem.id);
      
      // Add to beginning and limit to MAX_RECENT_ITEMS
      const updated = [recentItem, ...filtered].slice(0, MAX_RECENT_ITEMS);
      
      // Save to Firestore asynchronously
      updateUserRecents(user.uid, updated).catch(error => {
        console.error('Error saving recent items to Firestore:', error);
      });
      
      return updated;
    });
  };

  const clearRecents = async () => {
    if (!user) return;
    
    setRecentItems([]);
    try {
      await updateUserRecents(user.uid, []);
    } catch (error) {
      console.error('Error clearing recent items:', error);
    }
  };

  return (
    <RecentsContext.Provider value={{
      recentItems,
      addRecentItem,
      clearRecents,
      isRecentsView,
      setIsRecentsView,
      isFavoritesView,
      setIsFavoritesView,
      isSharedView,
      setIsSharedView,
      isArchivedView,
      setIsArchivedView,
      selectedDocType,
      setSelectedDocType,
    }}>
      {children}
    </RecentsContext.Provider>
  );
};