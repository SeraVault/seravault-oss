import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
  Button,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Divider,
  Stack,
} from '@mui/material';
import {
  Share,
  Edit,
  Cancel,
  Notifications,
  MarkEmailRead,
  InsertDriveFile,
  Schedule,
  Storage,
  PersonAdd,
  Person,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { NotificationService, type Notification } from '../services/notificationService';
import { backendService } from '../backend/BackendService';
import type { FileData } from '../files';
import { getOrDecryptMetadata, metadataCache } from '../services/metadataCache';
import { usePassphrase } from '../auth/PassphraseContext';

interface NotificationCenterProps {
  onFileClick?: (fileId: string) => void;
}

interface FileMetadataDisplay {
  name: string;
  size: string;
  lastModified?: string;
  type?: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`notification-tabpanel-${index}`}
      aria-labelledby={`notification-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ py: 2 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ onFileClick }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());
  const [fileMetadata, setFileMetadata] = useState<Map<string, FileMetadataDisplay>>(new Map());

  // Load notifications on component mount
  useEffect(() => {
    if (!user) return;

    const loadNotifications = async () => {
      try {
        setLoading(true);
        setError(null);
        const userNotifications = await NotificationService.getUserNotifications(user.uid, 100);
        setNotifications(userNotifications);
      } catch (err) {
        setError('Failed to load notifications');
        console.error('Error loading notifications:', err);
      } finally {
        setLoading(false);
      }
    };

    loadNotifications();

    // Subscribe to real-time updates
    const unsubscribe = NotificationService.subscribeToUserNotifications(
      user.uid,
      (newNotifications) => {
        setNotifications(newNotifications);
      },
      100
    );

    return unsubscribe;
  }, [user]);

  // Fetch file metadata for notifications with fileId
  useEffect(() => {
    if (!user || !privateKey || notifications.length === 0) {
      console.log(`⏭️ Skipping metadata fetch - user: ${!!user}, privateKey: ${!!privateKey}, notifications: ${notifications.length}`);
      return;
    }

    console.log(`🔔 Processing ${notifications.length} notifications for metadata:`, notifications);

    const fetchFileMetadata = async () => {
      const newMetadata = new Map<string, FileMetadataDisplay>();

      for (const notification of notifications) {
        console.log(`📋 Notification:`, {
          id: notification.id,
          type: notification.type,
          fileId: notification.fileId,
          hasFileId: !!notification.fileId
        });
        
        if (notification.fileId) {
          try {
            console.log(`🔍 Fetching metadata for file: ${notification.fileId}`);
            
            // Try to get from metadata cache first
            const cached = metadataCache.get(notification.fileId);
            if (cached && 'tags' in cached) {
              console.log(`✅ Found in cache: ${cached.decryptedName}`);
              newMetadata.set(notification.fileId, {
                name: cached.decryptedName,
                size: cached.decryptedSize,
              });
              continue;
            }

            // If not in cache, fetch from backend and decrypt
            console.log(`📥 Fetching from backend: ${notification.fileId}`);
            const file = await backendService.files.get(notification.fileId) as FileData;
            if (file) {
              console.log(`🔐 Decrypting metadata for: ${notification.fileId}`, file);
              // Use the getOrDecryptMetadata helper to decrypt the file metadata
              const decryptedMetadata = await getOrDecryptMetadata(file, user.uid, privateKey);
              
              console.log(`✅ Decrypted: ${decryptedMetadata.decryptedName}, Size: ${decryptedMetadata.decryptedSize}`);
              newMetadata.set(notification.fileId, {
                name: decryptedMetadata.decryptedName,
                size: decryptedMetadata.decryptedSize,
                lastModified: file.lastModified ? new Date(file.lastModified).toLocaleDateString() : undefined,
              });
            } else {
              console.warn(`⚠️ File not found for notification: ${notification.fileId}`);
            }
          } catch (error) {
            console.error(`❌ Error fetching metadata for file ${notification.fileId}:`, error);
            // Add fallback metadata on error
            newMetadata.set(notification.fileId, {
              name: '[Unable to decrypt]',
              size: '',
            });
          }
        }
      }

      if (newMetadata.size > 0) {
        console.log(`📊 Setting metadata for ${newMetadata.size} files:`, newMetadata);
        setFileMetadata(newMetadata);
      } else {
        console.log(`⚠️ No metadata to set`);
      }
    };

    fetchFileMetadata();
  }, [notifications, user, privateKey]); // Removed fileMetadata from dependencies to avoid infinite loop

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setSelectedNotifications(new Set());
  };

  const handleNotificationClick = async (notification: Notification) => {
    try {
      if (!notification.isRead) {
        await NotificationService.markAsRead(notification.id!);
      }

      // Handle contact request notifications
      if (notification.type === 'contact_request' || notification.type === 'contact_accepted') {
        navigate('/contacts?tab=requests');
      }
      // Handle user invitation notifications
      else if (notification.type === 'user_invitation') {
        // User is already registered, just show them they were invited
        navigate('/contacts');
      }
      // Handle chat message notifications
      else if (notification.type === 'chat_message' && notification.conversationId) {
        navigate(`/?chat=${notification.conversationId}`);
      }
      // Navigate to file if fileId exists
      else if (notification.fileId) {
        if (onFileClick) {
          onFileClick(notification.fileId);
        } else {
          navigate(`/?file=${notification.fileId}`);
        }
      }
    } catch (error) {
      console.error('Error handling notification click:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    
    try {
      await NotificationService.markAllAsRead(user.uid);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const handleToggleSelect = (notificationId: string) => {
    const newSelected = new Set(selectedNotifications);
    if (newSelected.has(notificationId)) {
      newSelected.delete(notificationId);
    } else {
      newSelected.add(notificationId);
    }
    setSelectedNotifications(newSelected);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'file_shared':
        return <Share color="primary" />;
      case 'file_modified':
        return <Edit color="info" />;
      case 'file_unshared':
        return <Cancel color="warning" />;
      case 'contact_request':
        return <PersonAdd color="primary" />;
      case 'contact_accepted':
        return <Person color="success" />;
      case 'user_invitation':
        return <PersonAdd color="secondary" />;
      case 'chat_message':
        return <Notifications color="info" />;
      default:
        return <Notifications />;
    }
  };

  const formatDateTime = (createdAt: unknown): string => {
    if (!createdAt) return '';
    
    let date: Date;
    if (typeof createdAt === 'object' && createdAt !== null && 'toDate' in createdAt) {
      date = (createdAt as { toDate: () => Date }).toDate();
    } else if (createdAt instanceof Date) {
      date = createdAt;
    } else {
      date = new Date(createdAt as string);
    }
    
    return date.toLocaleString();
  };

  const getFilteredNotifications = () => {
    switch (tabValue) {
      case 0: // All
        return notifications;
      case 1: // Unread
        return notifications.filter(n => !n.isRead);
      case 2: // File Shared
        return notifications.filter(n => n.type === 'file_shared');
      case 3: // File Modified
        return notifications.filter(n => n.type === 'file_modified');
      default:
        return notifications;
    }
  };

  const filteredNotifications = getFilteredNotifications();
  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (!user) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6">Please sign in to view notifications</Typography>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="body1" sx={{ mt: 2 }}>
          Loading notifications...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', maxWidth: 800, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ p: 3, pb: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h4">
            Notifications
          </Typography>
          {unreadCount > 0 && (
            <Button
              onClick={handleMarkAllAsRead}
              startIcon={<MarkEmailRead />}
              variant="outlined"
            >
              Mark all read ({unreadCount})
            </Button>
          )}
        </Box>

        {/* Tabs */}
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="notification tabs"
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
        >
          <Tab label={`All (${notifications.length})`} />
          <Tab label={`Unread (${unreadCount})`} />
          <Tab label={t('notifications.tabShared', 'Shared')} />
          <Tab label={t('notifications.tabModified', 'Modified')} />
        </Tabs>
      </Box>

      <Divider />

      {/* Notification Lists */}
      <TabPanel value={tabValue} index={0}>
        <NotificationList 
          notifications={filteredNotifications}
          onNotificationClick={handleNotificationClick}
          getNotificationIcon={getNotificationIcon}
          formatDateTime={formatDateTime}
          fileMetadata={fileMetadata}
        />
      </TabPanel>
      
      <TabPanel value={tabValue} index={1}>
        <NotificationList 
          notifications={filteredNotifications}
          onNotificationClick={handleNotificationClick}
          getNotificationIcon={getNotificationIcon}
          formatDateTime={formatDateTime}
          fileMetadata={fileMetadata}
        />
      </TabPanel>
      
      <TabPanel value={tabValue} index={2}>
        <NotificationList 
          notifications={filteredNotifications}
          onNotificationClick={handleNotificationClick}
          getNotificationIcon={getNotificationIcon}
          formatDateTime={formatDateTime}
          fileMetadata={fileMetadata}
        />
      </TabPanel>
      
      <TabPanel value={tabValue} index={3}>
        <NotificationList 
          notifications={filteredNotifications}
          onNotificationClick={handleNotificationClick}
          getNotificationIcon={getNotificationIcon}
          formatDateTime={formatDateTime}
          fileMetadata={fileMetadata}
        />
      </TabPanel>
    </Box>
  );
};

// Separate component for the notification list to avoid repetition
interface NotificationListProps {
  notifications: Notification[];
  onNotificationClick: (notification: Notification) => void;
  getNotificationIcon: (type: string) => React.ReactNode;
  formatDateTime: (createdAt: unknown) => string;
  fileMetadata: Map<string, FileMetadataDisplay>;
}

const NotificationList: React.FC<NotificationListProps> = ({
  notifications,
  onNotificationClick,
  getNotificationIcon,
  formatDateTime,
  fileMetadata
}) => {
  if (notifications.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          No notifications to display
        </Typography>
      </Box>
    );
  }

  return (
    <List>
      {notifications.map((notification, index) => {
        const metadata = notification.fileId ? fileMetadata.get(notification.fileId) : undefined;
        
        return (
        <React.Fragment key={notification.id}>
          <ListItemButton
            onClick={() => onNotificationClick(notification)}
            sx={{
              backgroundColor: notification.isRead ? 'transparent' : 'action.hover',
              borderLeft: notification.isRead ? 'none' : '4px solid',
              borderColor: 'primary.main',
              '&:hover': {
                backgroundColor: 'action.selected',
              },
            }}
          >
            <ListItemIcon>
              {getNotificationIcon(notification.type)}
            </ListItemIcon>
            
            <ListItemText
              primary={
                <Typography 
                  variant="subtitle1" 
                  sx={{ 
                    fontWeight: notification.isRead ? 'normal' : 'bold',
                    mb: 0.5
                  }}
                >
                  {notification.title}
                </Typography>
              }
              secondary={
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {notification.message}
                  </Typography>
                  
                  {/* Enhanced file metadata display */}
                  {metadata && (
                    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
                      <Chip
                        icon={<InsertDriveFile fontSize="small" />}
                        label={metadata.name}
                        size="small"
                        variant="outlined"
                        color="primary"
                      />
                      {metadata.size && (
                        <Chip
                          icon={<Storage fontSize="small" />}
                          label={metadata.size}
                          size="small"
                          variant="outlined"
                        />
                      )}
                      {metadata.lastModified && (
                        <Chip
                          icon={<Schedule fontSize="small" />}
                          label={metadata.lastModified}
                          size="small"
                          variant="outlined"
                        />
                      )}
                    </Stack>
                  )}
                  
                  {/* Show loading state if fileId exists but no metadata yet */}
                  {!metadata && notification.fileId && (
                    <Chip
                      label={t('common.loadingFilters', 'Loading file info...')}
                      size="small"
                      variant="outlined"
                      sx={{ mb: 1, mr: 1 }}
                    />
                  )}
                  
                  {/* Only show fileName fallback if it's NOT the encrypted placeholder */}
                  {!metadata && !notification.fileId && notification.fileName && notification.fileName !== '[Encrypted File]' && (
                    <Chip
                      label={notification.fileName}
                      size="small"
                      variant="outlined"
                      sx={{ mb: 1, mr: 1 }}
                    />
                  )}
                  
                  <Typography variant="caption" color="text.secondary">
                    {formatDateTime(notification.createdAt)}
                  </Typography>
                  
                  {notification.senderDisplayName && (
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                      from {notification.senderDisplayName}
                    </Typography>
                  )}
                </Box>
              }
            />
          </ListItemButton>
          {index < notifications.length - 1 && <Divider />}
        </React.Fragment>
      )})}
    </List>
  );
};

export default NotificationCenter;