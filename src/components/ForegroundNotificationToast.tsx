import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Snackbar, Typography } from '@mui/material';
import { NotificationService } from '../services/notificationService';

interface NotificationEvent {
  title: string;
  body: string;
  url: string;
  type: string;
  data: Record<string, string>;
}

/**
 * Shows an in-app toast banner when an FCM message arrives while the app tab
 * is visible and in the foreground.  When the tab is hidden the service worker
 * fires a native browser notification instead (see fcmService.ts).
 */
const ForegroundNotificationToast: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<NotificationEvent | null>(null);
  // Queue subsequent notifications that arrive while the toast is showing
  const [queue, setQueue] = useState<NotificationEvent[]>([]);

  const showNext = useCallback((evt: NotificationEvent) => {
    setCurrent(evt);
    setOpen(true);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<NotificationEvent>).detail;
      setQueue(prev => {
        if (!open && prev.length === 0) {
          // Nothing queued and nothing showing — display immediately
          showNext(detail);
          return prev;
        }
        return [...prev, detail];
      });
    };

    window.addEventListener('seravault:notification', handler);
    return () => window.removeEventListener('seravault:notification', handler);
  }, [open, showNext]);

  // When the current toast closes, dequeue the next one (with a brief gap)
  const handleClose = (_event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') return;
    setOpen(false);
    setTimeout(() => {
      setQueue(prev => {
        if (prev.length > 0) {
          const [next, ...rest] = prev;
          showNext(next);
          return rest;
        }
        return prev;
      });
    }, 300);
  };

  const handleNavigate = () => {
    if (current?.url) {
      navigate(current.url);
    }
    if (current?.data?.notificationId) {
      NotificationService.markAsRead(current.data.notificationId).catch(() => {});
    }
    handleClose();
  };

  if (!current) return null;

  return (
    <Snackbar
      open={open}
      autoHideDuration={6000}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      sx={{ mt: { xs: 7, sm: 8 } }} // clear the top app bar
    >
      <Alert
        onClose={handleClose}
        severity="info"
        variant="filled"
        sx={{ width: '100%', maxWidth: 360, alignItems: 'flex-start' }}
        action={
          current.url && current.url !== '/' ? (
            <Button
              color="inherit"
              size="small"
              onClick={handleNavigate}
              sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              View
            </Button>
          ) : undefined
        }
      >
        <Typography variant="subtitle2" fontWeight={600} lineHeight={1.3}>
          {current.title}
        </Typography>
        {current.body ? (
          <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.25 }}>
            {current.body}
          </Typography>
        ) : null}
      </Alert>
    </Snackbar>
  );
};

export default ForegroundNotificationToast;
