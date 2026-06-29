import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  IconButton,
  Badge,
  Menu,
  MenuItem,
  Typography,
  Divider,
  Box,
  ListItemIcon,
  ListItemText,
  Chip,
  Button,
  Tooltip,
} from '@mui/material';
import {
  Notifications,
  NotificationsNone,
  Share,
  Edit,
  Cancel,
  MarkEmailRead,
  PersonAdd,
  Person,
  Security,
  Chat,
  Close,
} from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';
import { NotificationService, type Notification } from '../services/notificationService';

// Swipeable wrapper for individual notification items
interface SwipeableMenuItemProps {
  onClick: () => void;
  onSwipeDismiss: () => void;
  onDismiss: () => void;
  sx?: object;
  children: React.ReactNode;
}

const SwipeableMenuItem: React.FC<SwipeableMenuItemProps> = ({ onClick, onSwipeDismiss, onDismiss, sx, children }) => {
  const [touchStart, setTouchStart] = useState<{ x: number; y: number; time: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY, time: Date.now() });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = Math.abs(touch.clientY - touchStart.y);
    if (Math.abs(deltaX) > deltaY) {
      setSwipeOffset(deltaX);
      if (Math.abs(deltaX) > 20) e.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    if (!touchStart) {
      setSwipeOffset(0);
      return;
    }
    const swipeDistance = Math.abs(swipeOffset);
    const swipeVelocity = swipeDistance / (Date.now() - touchStart.time);
    if (swipeDistance > 80 || (swipeDistance > 40 && swipeVelocity > 0.5)) {
      onSwipeDismiss();
    }
    setSwipeOffset(0);
    setTouchStart(null);
  };

  return (
    <MenuItem
      onClick={onClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      sx={{
        ...sx,
        transform: swipeOffset !== 0 ? `translateX(${swipeOffset}px)` : 'none',
        opacity: swipeOffset !== 0 ? Math.max(1 - Math.abs(swipeOffset) / 250, 0.15) : 1,
        transition: touchStart ? 'none' : 'transform 0.25s ease, opacity 0.25s ease',
        pr: 1,
        '&:hover .notification-dismiss-btn': { opacity: 1 },
      }}
    >
      {children}
      <Tooltip title={t('common.dismiss', 'Dismiss')}>
        <IconButton
          className="notification-dismiss-btn"
          size="small"
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          sx={{
            opacity: 0,
            ml: 1,
            flexShrink: 0,
            alignSelf: 'flex-start',
            mt: 0.25,
            transition: 'opacity 0.15s',
            '@media (hover: none)': { display: 'none' }, // hide on touch devices — use swipe instead
          }}
        >
          <Close fontSize="small" />
        </IconButton>
      </Tooltip>
    </MenuItem>
  );
};

interface NotificationBellProps {
  className?: string;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ className }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [displayCount, setDisplayCount] = useState(15);

  const open = Boolean(anchorEl);

  // Subscribe to real-time notifications
  useEffect(() => {
    if (!user) return;

    const unsubscribe = NotificationService.subscribeToUserNotifications(
      user.uid,
      (newNotifications) => {
        console.log('📬 Received notifications update:', newNotifications.length);
        // All notifications are already unread from the query
        setNotifications(newNotifications);
        setUnreadCount(newNotifications.length);
      },
      100 // Subscribe to up to 100 most recent unread notifications
    );

    return unsubscribe;
  }, [user]);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleShowMore = () => {
    setDisplayCount(prev => prev + 15);
  };

    const handleNotificationClick = async (notification: Notification) => {
    // Close the menu immediately to prevent rapid clicks and race conditions
    handleClose();

    try {
      console.log('Notification clicked:', notification);

      // Mark as read and update local state for responsive UI
      if (!notification.isRead && notification.id) {
        console.log(`Deleting notification ${notification.id}...`);

        // Remove from local state immediately for responsive UI
        setNotifications(prev => prev.filter(n => n.id !== notification.id));
        setUnreadCount(prev => Math.max(0, prev - 1));

        // Mark as read in background (don't block navigation)
        NotificationService.markAsRead(notification.id)
          .then(() => console.log(`Successfully deleted notification ${notification.id}`))
          .catch(err => console.error('Error marking notification as read:', err));
      } else if (!notification.id) {
        console.warn('Notification has no ID, cannot mark as read');
      } else {
        console.log('Notification already read');
      }

      // Navigate to file or perform relevant action based on notification type
      console.log('Notification details:', {
        type: notification.type,
        fileId: notification.fileId,
        fileName: notification.fileName,
        conversationId: notification.conversationId,
        contactRequestId: notification.contactRequestId
      });

      // Handle contact request notifications
      if (notification.type === 'contact_request' || notification.type === 'contact_accepted') {
        console.log(`Navigating to contacts page for ${notification.type}`);
        navigate('/contacts?tab=requests');
      }
      // Handle user invitation notifications
      else if (notification.type === 'user_invitation') {
        console.log('User invitation notification');
        navigate('/contacts');
      }
      // Handle chat message notifications
      else if (notification.type === 'chat_message' && notification.conversationId) {
        console.log(`Opening chat: ${notification.conversationId}`);
        navigate(`/?chat=${notification.conversationId}`);
      }
      // Navigate to file if fileId exists
      else if (notification.fileId) {
        console.log(`Navigating to file: ${notification.fileId}`);
        navigate(`/?file=${notification.fileId}`);
      }
    } catch (error) {
      console.error('Error handling notification click:', error);
    }
  };


  const handleSwipeDismiss = (notification: Notification) => {
    if (!notification.id) return;
    setNotifications(prev => prev.filter(n => n.id !== notification.id));
    setUnreadCount(prev => Math.max(0, prev - 1));
    NotificationService.markAsRead(notification.id)
      .catch(err => console.error('Error dismissing notification:', err));
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;

    const previousNotifications = notifications;
    const previousUnreadCount = unreadCount;
    const ids = notifications.map(n => n.id).filter(Boolean) as string[];

    // Clear React state immediately so the bell is empty right away
    setNotifications([]);
    setUnreadCount(0);
    handleClose();

    try {
      // Client-side batch write: marks docs isRead=true in the local Firestore cache
      // immediately. The isRead==false subscription fires from cache → empty list →
      // bell stays clear even before the server responds.
      await NotificationService.markAllAsReadClientSide(ids);

      // Cloud function deletes the documents server-side (fire-and-forget cleanup)
      NotificationService.markAllAsRead(user.uid).catch(err =>
        console.error('Error deleting notifications via cloud function:', err)
      );
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'file_shared':
        return <Share fontSize="small" color="primary" />;
      case 'file_modified':
        return <Edit fontSize="small" color="info" />;
      case 'file_unshared':
        return <Cancel fontSize="small" color="warning" />;
      case 'contact_request':
        return <PersonAdd fontSize="small" color="primary" />;
      case 'contact_accepted':
        return <Person fontSize="small" color="success" />;
      case 'file_share_request':
        return <Security fontSize="small" color="warning" />;
      case 'chat_message':
        return <Chat fontSize="small" color="primary" />;
      default:
        return <Notifications fontSize="small" />;
    }
  };

  const formatTimeAgo = (createdAt: { seconds: number; nanoseconds: number } | undefined): string => {
    if (!createdAt || !createdAt.seconds) return '';
    
    // Firestore Timestamp object has seconds and nanoseconds
    const date = new Date(createdAt.seconds * 1000 + createdAt.nanoseconds / 1000000);
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('notifications.justNow', 'Just now');
    if (diffMins < 60) return t('notifications.minutesAgo', '{{minutes}}m ago', { minutes: diffMins });
    if (diffHours < 24) return t('notifications.hoursAgo', '{{hours}}h ago', { hours: diffHours });
    if (diffDays < 7) return t('notifications.daysAgo', '{{days}}d ago', { days: diffDays });
    return date.toLocaleDateString();
  };

  if (!user) {
    return null;
  }

  return (
    <>
      <Tooltip title={t('notifications.notifications', 'Notifications')}>
        <IconButton
          onClick={handleClick}
          className={className}
          color="inherit"
          size="large"
        >
          <Badge badgeContent={unreadCount} color="error">
            {unreadCount > 0 ? <Notifications /> : <NotificationsNone />}
          </Badge>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          sx: {
            width: 400,
            maxWidth: '90vw',
            maxHeight: 500,
            overflow: 'auto',
          },
        }}
      >
        {/* Header */}
        <Box sx={{ p: 2, pb: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              {t('notifications.notifications', 'Notifications')}
            </Typography>
            {unreadCount > 0 && (
              <Button
                size="small"
                onClick={handleMarkAllAsRead}
                startIcon={<MarkEmailRead />}
              >
                {t('notifications.markAllRead', 'Mark all read')}
              </Button>
            )}
          </Box>
          {unreadCount > 0 && (
            <Typography variant="body2" color="text.secondary">
              {t('notifications.unreadCount', '{{count}} unread', { count: unreadCount })}
            </Typography>
          )}
        </Box>

        <Divider />

        {/* Notifications list - all are unread from query */}
        {notifications.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <NotificationsNone sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              {t('notifications.noUnread', 'No unread notifications')}
            </Typography>
          </Box>
        ) : (
          notifications.slice(0, displayCount).map((notification) => (
            <SwipeableMenuItem
              key={notification.id}
              onClick={() => handleNotificationClick(notification)}
              onSwipeDismiss={() => handleSwipeDismiss(notification)}
              onDismiss={() => handleSwipeDismiss(notification)}
              sx={{
                py: 1.5,
                px: 2,
                borderLeft: notification.isRead ? 'none' : '3px solid',
                borderColor: 'primary.main',
                backgroundColor: notification.isRead ? 'transparent' : 'action.hover',
                '&:hover': {
                  backgroundColor: 'action.selected',
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                {getNotificationIcon(notification.type)}
              </ListItemIcon>
              
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: notification.isRead ? 'normal' : 'bold' }}>
                      {notification.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1, flexShrink: 0 }}>
                      {formatTimeAgo(notification.createdAt as unknown as { seconds: number; nanoseconds: number })}
                    </Typography>
                  </Box>
                }
                secondary={
                  <Box 
                    sx={{ 
                      mt: 0.5,
                      wordWrap: 'break-word',
                      whiteSpace: 'normal',
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      fontSize: '0.875rem',
                      color: 'text.secondary'
                    }}
                  >
                    {notification.message}
                    {notification.fileName && (
                      <Chip
                        label={notification.fileName}
                        size="small"
                        variant="outlined"
                        sx={{ 
                          mt: 1, 
                          maxWidth: 200,
                          display: 'block',
                          '& .MuiChip-label': {
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }
                        }}
                      />
                    )}
                  </Box>
                }
                secondaryTypographyProps={{ component: 'div' }}
              />
            </SwipeableMenuItem>
          ))
        )}

        {/* Show more button if there are hidden notifications */}
        {notifications.length > displayCount && (
          <>
            <Divider />
            <MenuItem onClick={handleShowMore} sx={{ justifyContent: 'center' }}>
              <Typography variant="body2" color="primary">
                {t('notifications.showMore', `Show 15 more (${notifications.length - displayCount} remaining)`)}
              </Typography>
            </MenuItem>
          </>
        )}
      </Menu>
    </>
  );
};

export default NotificationBell;