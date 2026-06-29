import React, { useState, useEffect } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import { GetApp } from '@mui/icons-material';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const InstallButton: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    console.log('[PWA Install Button] Component mounted, listening for install prompt');
    
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('[PWA Install Button] App is already installed');
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      console.log('[PWA Install Button] ✅ beforeinstallprompt event fired!');
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      console.log('[PWA Install Button] ✅ App successfully installed');
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Log after a delay to see if event fires
    setTimeout(() => {
      if (!deferredPrompt) {
        console.log('[PWA Install Button] ❌ 5 seconds passed - beforeinstallprompt has NOT fired');
        console.log('[PWA Install Button] Possible reasons:');
        console.log('  - App already installed (check chrome://apps)');
        console.log('  - Not enough user engagement (visit page multiple times)');
        console.log('  - Service worker not registered properly');
        console.log('  - Manifest has validation errors (check Application tab)');
      } else {
        console.log('[PWA Install Button] ✅ beforeinstallprompt has fired');
      }
    }, 5000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [deferredPrompt]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      console.log('[PWA Install Button] No deferred prompt available');
      return;
    }

    console.log('[PWA Install Button] Showing install prompt');
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA Install Button] User response: ${outcome}`);

    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  if (!isInstallable) {
    return null;
  }

  return (
    <Tooltip title="Install App">
      <IconButton
        color="inherit"
        onClick={handleInstallClick}
        sx={{ 
          display: { xs: 'none', sm: 'inline-flex' },
          animation: 'pulse 2s infinite',
          '@keyframes pulse': {
            '0%, 100%': { opacity: 1 },
            '50%': { opacity: 0.7 },
          },
        }}
      >
        <GetApp />
      </IconButton>
    </Tooltip>
  );
};

export default InstallButton;
