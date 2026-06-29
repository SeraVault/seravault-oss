// @ts-nocheck
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  Chip,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Checkbox,
  IconButton,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Person,
  Group as GroupIcon,
  Settings,
  RemoveCircleOutline,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { type Group, getUserGroups, getUserProfile } from '../firestore';
import { ContactService, type Contact } from '../services/contactService';
import { hexToBytes } from '../crypto/quantumSafeCrypto';
import GroupManagement from './GroupManagement';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  onShare: (recipients: string[]) => void;
  onUnshare?: (recipients: string[]) => void;
  itemType?: 'file' | 'folder';
  itemName?: string;
  currentSharedWith?: string[]; // User IDs currently shared with
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
      id={`share-tabpanel-${index}`}
      aria-labelledby={`share-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

const ShareDialog: React.FC<ShareDialogProps> = ({
  open,
  onClose,
  onShare,
  onUnshare,
  itemType = 'file',
  itemName = 'item',
  currentSharedWith = []
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [tabValue, setTabValue] = useState(0);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [groupManagementOpen, setGroupManagementOpen] = useState(false);
  const [currentShares, setCurrentShares] = useState<{id: string, email: string, displayName: string}[]>([]);
  const [selectedToUnshare, setSelectedToUnshare] = useState<string[]>([]);

  useEffect(() => {
    if (user && open) {
      loadData();
    }
  }, [user, open, currentSharedWith, privateKey]);

  const loadData = async () => {
    if (!user) return;
    console.log('🔄 ShareDialog loadData called:', {
      userId: user.uid,
      currentSharedWithLength: currentSharedWith.length,
      currentSharedWith: currentSharedWith
    });
    
    try {
      // Convert private key string to Uint8Array if available
      const privateKeyBytes = privateKey ? hexToBytes(privateKey) : undefined;
      
      // Load groups
      const userGroups = await getUserGroups(user.uid, privateKeyBytes);
      setGroups(userGroups);
      console.log('📋 Groups loaded:', userGroups.length);
      
      // Subscribe to realtime contacts
      const unsubscribe = ContactService.subscribeToContacts(
        user.uid,
        (userContacts) => {
          setContacts(userContacts);
          console.log('👥 Contacts updated:', userContacts.length);
        }
      );
      
      // Store unsubscribe function to clean up when dialog closes
      return () => unsubscribe();
      
      // Load current share information
      if (currentSharedWith.length > 0) {
        console.log('👥 Processing current shares:', currentSharedWith);
        const filteredUsers = currentSharedWith.filter(userId => userId !== user.uid); // Exclude owner
        console.log('👤 Filtered users (excluding owner):', filteredUsers);
        
        const sharePromises = filteredUsers.map(async (userId) => {
          try {
            console.log(`🔍 Loading profile for user: ${userId}`);
            const profile = await getUserProfile(userId);
            const shareInfo = {
              id: userId,
              email: profile?.email || 'Unknown',
              displayName: profile?.displayName || 'Unknown User'
            };
            console.log(`✅ Profile loaded for ${userId}:`, shareInfo);
            return shareInfo;
          } catch (error) {
            console.warn(`❌ Failed to load profile for ${userId}:`, error);
            return {
              id: userId,
              email: 'Unknown',
              displayName: 'Unknown User'
            };
          }
        });
        
        const shares = await Promise.all(sharePromises);
        console.log('📊 Final shares processed:', shares);
        setCurrentShares(shares);
      } else {
        console.log('📭 No current shares, setting empty array');
        setCurrentShares([]);
      }
    } catch (error) {
      console.error('❌ Error loading sharing data:', error);
    }
  };

  const getContactDisplayInfo = (contact: Contact, currentUserId: string) => {
    const isUser1 = contact.userId1 === currentUserId;
    return {
      name: isUser1 ? contact.user2DisplayName : contact.user1DisplayName,
      email: isUser1 ? contact.user2Email : contact.user1Email,
      userId: isUser1 ? contact.userId2 : contact.userId1,
    };
  };

  const getMemberDisplayNames = (memberIds: string[]) => {
    if (!user) return [];
    return memberIds.map(memberId => {
      const contact = contacts.find(c => 
        (c.userId1 === user.uid && c.userId2 === memberId) ||
        (c.userId2 === user.uid && c.userId1 === memberId)
      );
      if (contact) {
        return getContactDisplayInfo(contact, user.uid).name;
      }
      return 'Unknown User';
    });
  };

  const handleContactToggle = (contactUserId: string) => {
    setSelectedRecipients(prev => 
      prev.includes(contactUserId)
        ? prev.filter(id => id !== contactUserId)
        : [...prev, contactUserId]
    );
  };

  const handleRemoveRecipient = (userId: string) => {
    setSelectedRecipients(selectedRecipients.filter(r => r !== userId));
  };

  const handleGroupToggle = (groupId: string) => {
    setSelectedGroups(prev => 
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const handleUnshareToggle = (userId: string) => {
    setSelectedToUnshare(prev => 
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleUnshare = async () => {
    if (!onUnshare || selectedToUnshare.length === 0) {
      return;
    }

    try {
      onUnshare(selectedToUnshare);
      handleClose();
    } catch (error) {
      console.error('Error unsharing:', error);
    }
  };


  const handleShare = async () => {
    if (!user) return;

    const allRecipients: string[] = [...selectedRecipients];
    
    // Add group members
    for (const groupId of selectedGroups) {
      const group = groups.find(g => g.id === groupId);
      if (group) {
        console.log(`🔍 Processing group ${groupId}:`, {
          name: group.name,
          membersType: typeof group.members,
          membersIsArray: Array.isArray(group.members),
          membersLength: Array.isArray(group.members) ? group.members.length : 0,
          members: Array.isArray(group.members) ? group.members : 'NOT AN ARRAY'
        });
        
        if (Array.isArray(group.members)) {
          const newMembers = group.members.filter(m => !allRecipients.includes(m));
          console.log(`➕ Adding ${newMembers.length} members from group ${groupId}:`, newMembers);
          allRecipients.push(...newMembers);
        } else {
          console.warn(`⚠️ Group ${groupId} members is not an array:`, group.members);
        }
      } else {
        console.warn(`⚠️ Group ${groupId} not found in groups list`);
      }
    }

    console.log(`📤 Final recipients list (${allRecipients.length}):`, allRecipients);

    if (allRecipients.length === 0) {
      return;
    }

    try {
      onShare(allRecipients);
      handleClose();
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleClose = () => {
    setSelectedRecipients([]);
    setSelectedGroups([]);
    setSelectedToUnshare([]);
    setTabValue(0);
    onClose();
  };


  const totalRecipients = selectedRecipients.length + 
    selectedGroups.reduce((acc, groupId) => {
      const group = groups.find(g => g.id === groupId);
      return acc + (group ? group.members.length : 0);
    }, 0);

  return (
    <>
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Share {itemType === 'file' ? 'File' : 'Folder'}{itemName && `: ${itemName}`}</DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            <Tabs
              value={tabValue}
              onChange={(_, newValue) => setTabValue(newValue)}
              aria-label="share options"
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
            >
              <Tab label={t('sharing.tabPeople', 'People')} icon={<Person />} id="share-tab-0" aria-controls="share-tabpanel-0" />
              <Tab label={t('sharing.tabGroups', 'Groups')} icon={<GroupIcon />} id="share-tab-1" aria-controls="share-tabpanel-1" />
              <Tab 
                label={`Current (${currentShares.length})`} 
                icon={<RemoveCircleOutline />} 
                id="share-tab-2" 
                aria-controls="share-tabpanel-2"
              />
            </Tabs>
          </Box>

          <TabPanel value={tabValue} index={0}>
            {contacts.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                No contacts yet. Add contacts to share files with them.
              </Typography>
            ) : (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Select contacts to share with
                </Typography>
                <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
                  {contacts.map((contact) => {
                    const { name, email, userId } = getContactDisplayInfo(contact, user!.uid);
                    return (
                      <ListItem 
                        key={contact.id} 
                        dense 
                        onClick={() => handleContactToggle(userId)}
                        sx={{ cursor: 'pointer', '&:hover': { backgroundColor: 'action.hover' } }}
                      >
                        <ListItemIcon>
                          <Checkbox
                            edge="start"
                            checked={selectedRecipients.includes(userId)}
                            onChange={() => handleContactToggle(userId)}
                            tabIndex={-1}
                            disableRipple
                          />
                        </ListItemIcon>
                        <ListItemText
                          primary={name}
                          secondary={email}
                        />
                      </ListItem>
                    );
                  })}
                </List>
              </>
            )}

            {selectedRecipients.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Selected contacts ({selectedRecipients.length}):
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {selectedRecipients.map((userId) => {
                    const contact = contacts.find(c => 
                      getContactDisplayInfo(c, user!.uid).userId === userId
                    );
                    if (!contact) return null;
                    const { name } = getContactDisplayInfo(contact, user!.uid);
                    return (
                      <Chip
                        key={userId}
                        label={name}
                        onDelete={() => handleRemoveRecipient(userId)}
                        size="small"
                        icon={<Person />}
                      />
                    );
                  })}
                </Box>
              </Box>
            )}
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Select groups to share with all members at once
              </Typography>
              <IconButton
                size="small"
                onClick={() => setGroupManagementOpen(true)}
                title={t('sharing.manageGroups', 'Manage Groups')}
              >
                <Settings />
              </IconButton>
            </Box>

            {groups.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                No groups created yet. Create groups to easily share with multiple people.
              </Typography>
            ) : (
              <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
                {groups.map((group) => (
                  <ListItem 
                    key={group.id} 
                    dense 
                    onClick={() => handleGroupToggle(group.id!)}
                    sx={{ cursor: 'pointer', '&:hover': { backgroundColor: 'action.hover' } }}
                  >
                    <ListItemIcon>
                      <Checkbox
                        edge="start"
                        checked={selectedGroups.includes(group.id!)}
                        onChange={() => handleGroupToggle(group.id!)}
                        tabIndex={-1}
                        disableRipple
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={typeof group.name === 'string' ? group.name : '[Encrypted]'}
                      secondary={`${Array.isArray(group.members) ? group.members.length : 0} member${(Array.isArray(group.members) ? group.members.length : 0) !== 1 ? 's' : ''}: ${Array.isArray(group.members) ? getMemberDisplayNames(group.members).join(', ') : 'No members'}`}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Currently shared with {currentShares.length} {currentShares.length === 1 ? 'person' : 'people'}
              </Typography>
            </Box>

            {currentShares.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                This {itemType} is not shared with anyone yet.
              </Typography>
            ) : (
              <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
                {currentShares.map((share) => (
                  <ListItem 
                    key={share.id} 
                    dense 
                    onClick={() => handleUnshareToggle(share.id)}
                    sx={{ cursor: 'pointer', '&:hover': { backgroundColor: 'action.hover' } }}
                  >
                    <ListItemIcon>
                      <Checkbox
                        edge="start"
                        checked={selectedToUnshare.includes(share.id)}
                        onChange={() => handleUnshareToggle(share.id)}
                        tabIndex={-1}
                        disableRipple
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={share.displayName}
                      secondary={share.email}
                    />
                  </ListItem>
                ))}
              </List>
            )}

            {selectedToUnshare.length > 0 && (
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  {selectedToUnshare.length} selected to unshare
                </Typography>
                <Button 
                  variant="outlined" 
                  color="error" 
                  size="small"
                  onClick={handleUnshare}
                  startIcon={<RemoveCircleOutline />}
                >
                  Unshare
                </Button>
              </Box>
            )}
          </TabPanel>

          {(selectedRecipients.length > 0 || selectedGroups.length > 0) && totalRecipients > 0 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'action.selected', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="body2" color="text.primary">
                Will share with {totalRecipients} recipient{totalRecipients !== 1 ? 's' : ''}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button 
            onClick={handleShare} 
            variant="contained"
            disabled={selectedRecipients.length === 0 && selectedGroups.length === 0}
          >
            Share
          </Button>
        </DialogActions>
      </Dialog>
      
      <GroupManagement 
        open={groupManagementOpen} 
        onClose={() => {
          setGroupManagementOpen(false);
          loadData(); // Refresh groups after management
        }} 
      />
    </>
  );
};

export default ShareDialog;
