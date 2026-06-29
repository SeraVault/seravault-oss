import { useState, useCallback } from 'react';
import type { User } from '../backend/BackendInterface';
import { getUserProfile, createUserProfile, type UserProfile } from '../firestore';

export interface UseProfileManagementReturn {
  userProfile: UserProfile | null;
  loading: boolean;
  editMode: boolean;
  displayName: string;
  theme: 'light' | 'dark';
  error: string | null;
  setUserProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setEditMode: (editMode: boolean) => void;
  setDisplayName: (displayName: string) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setError: (error: string | null) => void;
  fetchProfile: (user: User | null) => Promise<void>;
  handleProfileUpdate: (user: User | null, setMode: (theme: 'light' | 'dark') => void) => Promise<void>;
}

export const useProfileManagement = (): UseProfileManagementReturn => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async (user: User | null) => {
    if (user) {
      const profile = await getUserProfile(user.uid);
      setUserProfile(profile);
      if (profile) {
        setDisplayName(profile.displayName);
        setTheme(profile.theme);
      } else if (user.displayName) {
        setDisplayName(user.displayName);
      }
    }
    setLoading(false);
  }, []);

  const handleProfileUpdate = async (user: User | null, setMode: (theme: 'light' | 'dark') => void) => {
    if (!user || !userProfile) {
      return;
    }
    const updatedProfile: UserProfile = {
      ...userProfile,
      displayName,
      theme,
    };
    await createUserProfile(user.uid, updatedProfile);
    setUserProfile(updatedProfile);
    setMode(theme);
    setEditMode(false);
    
    // Dispatch event to notify other components (like UserAvatar) that profile was updated
    window.dispatchEvent(new CustomEvent('profileUpdated'));
  };

  return {
    userProfile,
    loading,
    editMode,
    displayName,
    theme,
    error,
    setUserProfile,
    setLoading,
    setEditMode,
    setDisplayName,
    setTheme,
    setError,
    fetchProfile,
    handleProfileUpdate,
  };
};