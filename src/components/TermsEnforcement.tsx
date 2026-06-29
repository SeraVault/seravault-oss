// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { subscribeToUserProfile, updateUserProfile } from '../firestore';
import { backendService } from '../backend/BackendService';
import { useLocation } from 'react-router-dom';
import TermsAcceptanceDialog from './TermsAcceptanceDialog';

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

/**
 * This component checks if the current user has accepted the latest terms.
 * If not, it shows the terms acceptance dialog on app load.
 * This ensures existing users also accept terms after they've been introduced.
 */
const TermsEnforcement: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();
  const [showTermsDialog, setShowTermsDialog] = useState(false);

  useEffect(() => {
    // Demo mode: terms always accepted
    if (IS_DEMO) return;
    // Don't check on login/signup/setup pages or if no user
    // The setup/profile page is where users generate their keys, so they legitimately won't have keys yet
    if (!user || 
        location.pathname === '/login' || 
        location.pathname === '/signup' ||
        location.pathname === '/profile') {
      return;
    }

    const unsubscribe = subscribeToUserProfile(user.uid, (profile) => {
      console.warn('[TermsEnforcement] Profile update:', {
        uid: user.uid,
        profileExists: !!profile,
        profileData: profile,
        hasTermsAccepted: !!profile?.termsAcceptedAt,
        termsAcceptedAt: profile?.termsAcceptedAt,
        hasPublicKey: !!profile?.publicKey,
        publicKey: profile?.publicKey ? 'exists' : 'missing',
        willShowDialog: profile ? (!profile.termsAcceptedAt && !profile.publicKey) : false
      });
      
      // If profile doesn't exist, don't show dialog - let auth flow handle it
      if (!profile) {
        return;
      }
      
      // Grandfather existing users: if they have encryption keys, they already went through signup
      // Only require terms acceptance for users without keys (new users in signup flow)
      if (!profile.termsAcceptedAt && !profile.publicKey) {
        setShowTermsDialog(true);
      } else {
        // Hide dialog if terms were accepted or user has keys
        setShowTermsDialog(false);
      }
    });

    return () => unsubscribe();
  }, [user, location.pathname]);

  const handleTermsAccept = async () => {
    if (!user) return;

    try {
      // Update user profile with terms acceptance
      await updateUserProfile(user.uid, {
        termsAcceptedAt: new Date().toISOString(),
      });
      
      setShowTermsDialog(false);
    } catch (error) {
      console.error('Error updating terms acceptance:', error);
    }
  };

  const handleTermsDecline = async () => {
    // If user declines, log them out
    await auth.signOut();
    setShowTermsDialog(false);
  };

  return (
    <>
      <TermsAcceptanceDialog
        open={showTermsDialog}
        onAccept={handleTermsAccept}
        onDecline={handleTermsDecline}
      />
      {children}
    </>
  );
};

export default TermsEnforcement;
