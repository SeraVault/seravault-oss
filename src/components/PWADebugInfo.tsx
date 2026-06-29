import React, { useState, useEffect } from 'react';
import { Alert, AlertTitle, Box, Typography, Button } from '@mui/material';

interface DebugInfo {
  isStandalone: boolean;
  hasServiceWorker: boolean;
  swRegistration: any;
  manifestLink: string | null;
  https: boolean;
  url: string;
  manifestContent?: any;
}

const PWADebugInfo: React.FC = () => {
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    const checkPWAStatus = async () => {
      const info: Partial<DebugInfo> = {
        isStandalone: window.matchMedia('(display-mode: standalone)').matches,
        hasServiceWorker: 'serviceWorker' in navigator,
        swRegistration: null,
        manifestLink: null,
        https: window.location.protocol === 'https:',
        url: window.location.href,
      };

      // Check service worker registration
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          info.swRegistration = {
            active: !!registration?.active,
            scope: registration?.scope,
            updateViaCache: registration?.updateViaCache,
          };
        } catch (e) {
          info.swRegistration = { error: String(e) };
        }
      }

      // Check manifest link
      const manifestLink = document.querySelector('link[rel="manifest"]');
      info.manifestLink = manifestLink ? (manifestLink as HTMLLinkElement).href : 'NOT FOUND';

      // Try to fetch manifest
      if (info.manifestLink && info.manifestLink !== 'NOT FOUND') {
        try {
          const response = await fetch(info.manifestLink);
          if (response.ok) {
            info.manifestContent = await response.json();
          } else {
            info.manifestContent = { error: `HTTP ${response.status}` };
          }
        } catch (e) {
          info.manifestContent = { error: String(e) };
        }
      }

      setDebugInfo(info as DebugInfo);
      console.log('[PWA Debug Info]', info);
    };

    checkPWAStatus();
  }, []);

  if (!debugInfo) return null;

  return (
    <>
      <Button
        onClick={() => setShowDebug(!showDebug)}
        sx={{ 
          position: 'fixed', 
          bottom: 16, 
          left: 16, 
          zIndex: 9999,
          opacity: showDebug ? 1 : 0.3,
          fontSize: '10px',
        }}
      >
        PWA Debug
      </Button>
      
      {showDebug && (
        <Box
          sx={{
            position: 'fixed',
            bottom: 60,
            left: 16,
            maxWidth: 400,
            zIndex: 9999,
            backgroundColor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            p: 2,
            maxHeight: '70vh',
            overflow: 'auto',
          }}
        >
          <Typography variant="h6" gutterBottom>PWA Status</Typography>
          
          <Alert severity={debugInfo.isStandalone ? 'success' : 'info'} sx={{ mb: 2 }}>
            <AlertTitle>Installation Status</AlertTitle>
            {debugInfo.isStandalone ? 'App is installed' : 'Running in browser'}
          </Alert>

          <Typography variant="body2" component="div" sx={{ mb: 1 }}>
            <strong>HTTPS:</strong> {debugInfo.https ? '✅' : '❌'}
          </Typography>

          <Typography variant="body2" component="div" sx={{ mb: 1 }}>
            <strong>Service Worker:</strong> {debugInfo.swRegistration?.active ? '✅ Active' : '❌ Not Active'}
          </Typography>

          <Typography variant="body2" component="div" sx={{ mb: 1 }}>
            <strong>Manifest:</strong> {debugInfo.manifestLink !== 'NOT FOUND' ? '✅' : '❌'}
          </Typography>

          {debugInfo.manifestContent && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" component="div" sx={{ mb: 1 }}>
                <strong>Manifest Details:</strong>
              </Typography>
              <pre style={{ fontSize: '10px', overflow: 'auto', maxHeight: '200px' }}>
                {JSON.stringify(debugInfo.manifestContent, null, 2)}
              </pre>
            </Box>
          )}

          {!debugInfo.isStandalone && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              <AlertTitle>Install Criteria</AlertTitle>
              Chrome requires:
              <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                <li>HTTPS connection</li>
                <li>Valid manifest with icons</li>
                <li>Registered service worker</li>
                <li>User engagement (multiple visits)</li>
              </ul>
              Check DevTools → Application → Manifest for errors.
            </Alert>
          )}
        </Box>
      )}
    </>
  );
};

export default PWADebugInfo;
