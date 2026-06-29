import React, { useState, useEffect } from 'react';
import { Box, Button, IconButton, Paper, Typography, Slide } from '@mui/material';
import { Close, GetApp, PhoneAndroid } from '@mui/icons-material';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check if already dismissed this session
    const dismissed = sessionStorage.getItem('pwaInstallDismissed');
    if (dismissed === 'true') {
      return;
    }

    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      console.log('[PWA] beforeinstallprompt event fired');
      // Prevent the default mini-infobar from appearing
      e.preventDefault();
      // Stash the event so it can be triggered later
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for successful installation
    const handleAppInstalled = () => {
      console.log('[PWA] App successfully installed');
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      console.log('[PWA] No deferred prompt available');
      return;
    }

    console.log('[PWA] Showing install prompt');
    // Show the install prompt
    await deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] User response: ${outcome}`);

    if (outcome === 'accepted') {
      console.log('[PWA] User accepted the install prompt');
    } else {
      console.log('[PWA] User dismissed the install prompt');
    }

    // Clear the prompt
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    sessionStorage.setItem('pwaInstallDismissed', 'true');
  };

  if (!showPrompt) {
    return null;
  }

  return (
    <Slide direction="up" in={showPrompt} mountOnEnter unmountOnExit>
      <Paper
        elevation={8}
        sx={{
          position: 'fixed',
          bottom: { xs: 112, sm: 24 },
          left: 16,
          right: { xs: 16, sm: 'auto' },
          maxWidth: { xs: 'calc(100% - 32px)', sm: 380 },
          zIndex: 1300,
          background: (theme) => 
            theme.palette.mode === 'dark'
              ? 'linear-gradient(135deg, rgba(66, 165, 245, 0.15) 0%, rgba(102, 126, 234, 0.15) 100%)'
              : 'linear-gradient(135deg, rgba(66, 165, 245, 0.1) 0%, rgba(102, 126, 234, 0.1) 100%)',
          backdropFilter: 'blur(10px)',
          border: (theme) => `1px solid ${
            theme.palette.mode === 'dark'
              ? 'rgba(66, 165, 245, 0.3)'
              : 'rgba(66, 165, 245, 0.2)'
          }`,
        }}
      >
        <Box sx={{ p: 2, position: 'relative' }}>
          <IconButton
            size="small"
            onClick={handleDismiss}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
            }}
          >
            <Close fontSize="small" />
          </IconButton>

          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 48,
                height: 48,
                borderRadius: 2,
                background: 'linear-gradient(135deg, #00CC00 0%, #00bf5f 100%)',
                color: 'white',
                flexShrink: 0,
              }}
            >
              <PhoneAndroid />
            </Box>

            <Box sx={{ flex: 1, pr: 3 }}>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Install SeraVault
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Install the app for quick access and offline capabilities
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button
              onClick={handleDismiss}
              size="small"
              sx={{ color: 'text.secondary' }}
            >
              Not now
            </Button>
            <Button
              variant="contained"
              onClick={handleInstallClick}
              startIcon={<GetApp />}
              size="small"
            >
              Install
            </Button>
          </Box>
        </Box>
      </Paper>
    </Slide>
  );
};

export default PWAInstallPrompt;
