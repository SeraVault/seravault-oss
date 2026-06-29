import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Switch,
  FormControlLabel,
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
} from '@mui/material';
import { Notifications, NotificationsOff, NotificationsActive } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { FCMService } from '../services/fcmService';
import { IS_IOS_APP } from '../utils/platform';
import { useAuth } from '../auth/AuthContext';

export const NotificationSettings: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Check initial state
  useEffect(() => {
    if (user?.uid) {
      const enabled = localStorage.getItem(`notifications_${user.uid}`) !== 'false';
      setNotificationsEnabled(enabled);
      setPermission(FCMService.getPermissionStatus());
    }
  }, [user]);

  const handleToggle = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!user?.uid) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const enabled = event.target.checked;

      if (enabled) {
        // Enable notifications
        if (!FCMService.isSupported()) {
          setError('Push notifications are not supported in this browser');
          setLoading(false);
          return;
        }

        // Initialize FCM and request permission
        const token = await FCMService.initialize(user.uid);

        if (token) {
          setNotificationsEnabled(true);
          localStorage.setItem(`notifications_${user.uid}`, 'true');
          setPermission('granted');
          setSuccess('Push notifications enabled! You\'ll receive notifications even when the app is closed.');
        } else {
          setError('Failed to enable notifications. Please check your browser permissions.');
        }
      } else {
        // Disable notifications
        await FCMService.unregister(user.uid);
        setNotificationsEnabled(false);
        localStorage.setItem(`notifications_${user.uid}`, 'false');
        setSuccess('Push notifications disabled');
      }
    } catch (err) {
      console.error('Error toggling notifications:', err);
      setError('Failed to update notification settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPermission = async () => {
    if (!user?.uid) return;

    setLoading(true);
    setError(null);

    try {
      const newPermission = await FCMService.requestPermission();
      setPermission(newPermission);

      if (newPermission === 'granted') {
        const token = await FCMService.initialize(user.uid);
        if (token) {
          setNotificationsEnabled(true);
          localStorage.setItem(`notifications_${user.uid}`, 'true');
          setSuccess('Notifications enabled successfully!');
        }
      } else {
        setError('Notification permission was denied. Please enable it in your browser settings.');
      }
    } catch (err) {
      console.error('Error requesting permission:', err);
      setError('Failed to request notification permission');
    } finally {
      setLoading(false);
    }
  };

  if (IS_IOS_APP || !FCMService.isSupported()) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <NotificationsOff color="disabled" />
            <Box>
              <Typography variant="h6">Push Notifications Not Supported</Typography>
              <Typography variant="body2" color="text.secondary">
                {IS_IOS_APP
                  ? 'Push notifications are managed through the iOS app settings'
                  : "Your browser doesn't support push notifications"
                }
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          {notificationsEnabled ? (
            <NotificationsActive color="primary" />
          ) : (
            <Notifications color="action" />
          )}
          
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <Typography variant="h6">Push Notifications</Typography>
              {permission === 'granted' && (
                <Chip label={t('common.enabled', 'Enabled')} color="success" size="small" />
              )}
              {permission === 'denied' && (
                <Chip label={t('common.blocked', 'Blocked')} color="error" size="small" />
              )}
              {permission === 'default' && (
                <Chip label={t('common.notSet', 'Not Set')} size="small" />
              )}
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Receive notifications for new messages even when the app is closed
            </Typography>

            <FormControlLabel
              control={
                <Switch
                  checked={notificationsEnabled}
                  onChange={handleToggle}
                  disabled={loading || permission === 'denied'}
                />
              }
              label={notificationsEnabled ? 'Notifications Enabled' : 'Notifications Disabled'}
            />

            {permission === 'denied' && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                Notifications are blocked in your browser. Please enable them in your browser settings and refresh the page.
              </Alert>
            )}

            {permission === 'default' && !notificationsEnabled && (
              <Box sx={{ mt: 2 }}>
                <Button
                  variant="outlined"
                  onClick={handleRequestPermission}
                  disabled={loading}
                  startIcon={<Notifications />}
                >
                  Enable Push Notifications
                </Button>
              </Box>
            )}

            {error && (
              <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {success && (
              <Alert severity="success" sx={{ mt: 2 }} onClose={() => setSuccess(null)}>
                {success}
              </Alert>
            )}

            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                <strong>How it works:</strong> When enabled, you'll receive browser notifications for new chat messages, 
                even if you have the app closed or minimized. You can click on the notification to open the chat directly.
              </Typography>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};
