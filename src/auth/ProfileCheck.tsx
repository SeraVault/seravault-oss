import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { getUserProfile } from '../firestore';
import { Navigate, Outlet, useOutletContext } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

const ProfileCheck: React.FC = () => {
  const { user } = useAuth();
  const [hasProfile, setHasProfile] = useState(IS_DEMO);
  const [loading, setLoading] = useState(!IS_DEMO);
  
  // Get context from parent (PersistentLayout) to pass through to children
  const context = useOutletContext();

  useEffect(() => {
    if (IS_DEMO) return; // Demo profile always has keys

    if (!user) {
      setLoading(false);
      return;
    }

    // Use a one-time fetch instead of a realtime subscription.
    // A subscription can fire with stale/cached null data from Firestore's local
    // cache before the server responds, causing a false redirect to /setup.
    let cancelled = false;
    getUserProfile(user.uid).then((profile) => {
      if (cancelled) return;
      console.log('ProfileCheck: Received profile', { 
        exists: !!profile, 
        hasPublicKey: !!profile?.publicKey,
        uid: user.uid 
      });
      setHasProfile(!!(profile && profile.publicKey));
      setLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      console.warn('ProfileCheck: Error fetching profile, will retry', err);
      // On error (e.g. auth token not yet propagated), retry after a short delay
      setTimeout(() => {
        if (cancelled) return;
        getUserProfile(user.uid).then((profile) => {
          if (cancelled) return;
          setHasProfile(!!(profile && profile.publicKey));
          setLoading(false);
        }).catch(() => {
          if (cancelled) return;
          setHasProfile(false);
          setLoading(false);
        });
      }, 1000);
    });

    return () => { cancelled = true; };
  }, [user]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!hasProfile) {
    return <Navigate to="/setup" />;
  }

  // Forward the context to child routes
  return <Outlet context={context} />;
};

export default ProfileCheck;
