import React, { useState, useEffect } from 'react';
import { Box, Button, IconButton, Paper, Typography, Slide } from '@mui/material';
import { Close, NotificationsActive } from '@mui/icons-material';
import { FCMService } from '../services/fcmService';
import { IS_IOS_APP } from '../utils/platform';
import { useAuth } from '../auth/AuthContext';

const DISMISSED_KEY = 'sv_notif_prompt_dismissed';

const NotificationPromptBanner: React.FC = () => {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    if (IS_IOS_APP) return; // FCM web push not supported in iOS WKWebView
    if (!FCMService.isSupported()) return;
    // Only show when permission hasn't been decided yet
    if (FCMService.getPermissionStatus() !== 'default') return;
    // Don't show if the user already dismissed it
    if (localStorage.getItem(DISMISSED_KEY)) return;
    // Don't show if the user already has notifications enabled
    if (localStorage.getItem(`notifications_${user.uid}`) === 'true') return;

    // Small delay so it doesn't flash immediately on load
    const t = setTimeout(() => setShow(true), 2000);
    return () => clearTimeout(t);
  }, [user]);

  const handleEnable = async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const token = await FCMService.initialize(user.uid);
      if (token) {
        localStorage.setItem(`notifications_${user.uid}`, 'true');
      }
    } catch {
      // Permission denied or error — user can enable later from Profile
    } finally {
      setLoading(false);
      setShow(false);
    }
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem(DISMISSED_KEY, '1');
  };

  if (!show) return null;

  return (
    <Slide direction="down" in={show} mountOnEnter unmountOnExit>
      <Paper
        elevation={6}
        sx={{
          position: 'fixed',
          top: { xs: 64, sm: 72 },
          left: { xs: 16, sm: '50%' },
          right: { xs: 16, sm: 'auto' },
          transform: { xs: 'none', sm: 'translateX(-50%)' },
          width: { xs: 'auto', sm: 420 },
          maxWidth: 'calc(100vw - 32px)',
          zIndex: 1300,
          background: (theme) =>
            theme.palette.mode === 'dark'
              ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%)'
              : 'linear-gradient(135deg, rgba(102, 126, 234, 0.12) 0%, rgba(118, 75, 162, 0.12) 100%)',
          backdropFilter: 'blur(12px)',
          border: (theme) =>
            `1px solid ${
              theme.palette.mode === 'dark'
                ? 'rgba(102, 126, 234, 0.4)'
                : 'rgba(102, 126, 234, 0.25)'
            }`,
          borderRadius: 2,
        }}
      >
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <NotificationsActive sx={{ color: 'white', fontSize: 20 }} />
          </Box>

          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" fontWeight={600}>
              Enable push notifications
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Get notified about messages, shared files, and contact requests
            </Typography>
          </Box>

          <IconButton size="small" onClick={handleDismiss} sx={{ flexShrink: 0 }}>
            <Close fontSize="small" />
          </IconButton>
        </Box>

        <Box sx={{ px: 2, pb: 2, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button size="small" onClick={handleDismiss} color="inherit">
            Not now
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={handleEnable}
            disabled={loading}
            sx={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              '&:hover': { background: 'linear-gradient(135deg, #5a6fd6 0%, #6a3f9a 100%)' },
            }}
          >
            {loading ? 'Enabling…' : 'Enable'}
          </Button>
        </Box>
      </Paper>
    </Slide>
  );
};

export default NotificationPromptBanner;
