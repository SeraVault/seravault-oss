import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  TextField,
  Box,
  Typography,
  Chip,
  Divider,
  Checkbox,
  ListItemAvatar,
  Avatar,
  Paper,
  Alert,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Group as GroupIcon,
  Person,
  Search,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { type Group, createGroup, updateGroup, deleteGroup, getUserGroups } from '../firestore';
import { hexToBytes } from '../crypto/quantumSafeCrypto';
import { ContactService, type Contact } from '../services/contactService';

interface GroupManagementProps {
  open: boolean;
  onClose: () => void;
}

interface GroupFormData {
  name: string;
  description: string;
  members: string[]; // Array of user IDs
}

const GroupManagement: React.FC<GroupManagementProps> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const [groups, setGroups] = useState<Group[]>([]);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<GroupFormData>({
    name: '',
    description: '',
    members: [],
  });
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (user && open) {
      loadGroups();
      loadContacts();
    }
  }, [user, open, privateKey]);

  const loadContacts = async () => {
    if (!user) return;
    try {
      setContactsLoading(true);
      // Subscribe to realtime contacts
      const unsubscribe = ContactService.subscribeToContacts(
        user.uid,
        (userContacts) => {
          setContacts(userContacts);
          setContactsLoading(false);
        }
      );
      
      // Store unsubscribe for cleanup
      return unsubscribe;
    } catch (error) {
      console.error('Error loading contacts:', error);
      setContactsLoading(false);
    }
  };

  const loadGroups = async () => {
    if (!user) return;
    try {
      // Convert private key string to Uint8Array if available
      const privateKeyBytes = privateKey ? hexToBytes(privateKey) : undefined;
      const userGroups = await getUserGroups(user.uid, privateKeyBytes);
      setGroups(userGroups);
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  };

  const handleCreateGroup = () => {
    setEditingGroup(null);
    setFormData({ name: '', description: '', members: [] });
    setSearchQuery('');
    setShowForm(true);
  };

  const handleEditGroup = (group: Group) => {
    setEditingGroup(group);
    setFormData({
      name: typeof group.name === 'string' ? group.name : '[Encrypted]',
      description: typeof group.description === 'string' ? (group.description || '') : '[Encrypted]',
      members: Array.isArray(group.members) ? group.members : [],
    });
    setSearchQuery('');
    setShowForm(true);
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      await deleteGroup(groupId);
      await loadGroups();
    } catch (error) {
      console.error('Error deleting group:', error);
    }
  };

  const handleSaveGroup = async () => {
    if (!user || !formData.name.trim()) return;

    try {
      if (editingGroup) {
        await updateGroup(editingGroup.id!, {
          name: formData.name,
          description: formData.description,
          members: formData.members,
        });
      } else {
        await createGroup(
          user.uid,
          formData.name,
          formData.description,
          formData.members
        );
      }
      await loadGroups();
      setShowForm(false);
      setFormData({ name: '', description: '', members: [] });
      setSearchQuery('');
    } catch (error) {
      console.error('Error saving group:', error);
    }
  };

  const handleToggleContact = (contact: Contact) => {
    if (!user) return;
    
    const { userId } = getContactDisplayInfo(contact, user.uid);
    const isSelected = formData.members.includes(userId);
    
    if (isSelected) {
      setFormData({
        ...formData,
        members: formData.members.filter(m => m !== userId),
      });
    } else {
      setFormData({
        ...formData,
        members: [...formData.members, userId],
      });
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

  const getSelectedContactsInfo = () => {
    if (!user) return [];
    return formData.members.map(memberId => {
      const contact = contacts.find(c => 
        (c.userId1 === user.uid && c.userId2 === memberId) ||
        (c.userId2 === user.uid && c.userId1 === memberId)
      );
      if (contact) {
        return getContactDisplayInfo(contact, user.uid);
      }
      return { name: 'Unknown User', email: 'unknown@example.com', userId: memberId };
    });
  };

  const filteredContacts = contacts.filter(contact => {
    if (!user) return false;
    const { name, email } = getContactDisplayInfo(contact, user.uid);
    const query = searchQuery.toLowerCase();
    return name.toLowerCase().includes(query) || email.toLowerCase().includes(query);
  });

  if (showForm) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingGroup ? t('groups.editGroup', 'Edit Group') : t('groups.createNewGroup', 'Create New Group')}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={t('groups.groupName', 'Group Name')}
            fullWidth
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            variant="outlined"
            sx={{ mb: 2 }}
          />

          <TextField
            margin="dense"
            label={t('groups.descriptionOptional', 'Description (optional)')}
            fullWidth
            multiline
            rows={2}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            variant="outlined"
            sx={{ mb: 2 }}
          />
          
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Select Members from Your Contacts
          </Typography>
          
          {contacts.length === 0 ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              You don't have any contacts yet. Add contacts first to create groups with members.
            </Alert>
          ) : (
            <>
              <TextField
                size="small"
                label={t('groups.searchContacts', 'Search contacts')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                variant="outlined"
                fullWidth
                placeholder={t('groups.searchByNameOrEmail', 'Search by name or email')}
                sx={{ mb: 2 }}
                InputProps={{
                  startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />
                }}
              />
              
              <Paper variant="outlined" sx={{ maxHeight: 200, overflow: 'auto', mb: 2 }}>
                <List dense>
                  {filteredContacts.map((contact) => {
                    if (!user) return null;
                    const { name, email, userId } = getContactDisplayInfo(contact, user.uid);
                    const isSelected = formData.members.includes(userId);
                    
                    return (
                      <ListItem
                        key={contact.id}
                        component="div"
                        onClick={() => handleToggleContact(contact)}
                        divider
                        sx={{ cursor: 'pointer' }}
                      >
                        <ListItemAvatar>
                          <Avatar sx={{ width: 32, height: 32 }}>
                            {name.charAt(0).toUpperCase()}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={name}
                          secondary={email}
                          primaryTypographyProps={{ fontSize: '14px' }}
                          secondaryTypographyProps={{ fontSize: '12px' }}
                        />
                        <Checkbox
                          edge="end"
                          checked={isSelected}
                          tabIndex={-1}
                          disableRipple
                        />
                      </ListItem>
                    );
                  })}
                  {filteredContacts.length === 0 && (
                    <ListItem>
                      <ListItemText 
                        primary="No contacts found"
                        secondary={searchQuery ? "Try a different search term" : "Add contacts to create groups"}
                      />
                    </ListItem>
                  )}
                </List>
              </Paper>
            </>
          )}
          
          {formData.members.length > 0 && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Selected Members ({formData.members.length})
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                {getSelectedContactsInfo().map((memberInfo) => (
                  <Chip
                    key={memberInfo.userId}
                    label={memberInfo.name}
                    onDelete={() => {
                      setFormData({
                        ...formData,
                        members: formData.members.filter(m => m !== memberInfo.userId),
                      });
                    }}
                    size="small"
                    icon={<Person />}
                  />
                ))}
              </Box>
            </>
          )}
          
          {formData.members.length === 0 && contacts.length > 0 && (
            <Typography variant="body2" color="text.secondary">
              Select contacts from the list above to add them to this group.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowForm(false)}>Cancel</Button>
          <Button 
            onClick={handleSaveGroup} 
            variant="contained"
            disabled={!formData.name.trim()}
          >
            {editingGroup ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">Manage Groups</Typography>
          <Button
            startIcon={<Add />}
            variant="contained"
            onClick={handleCreateGroup}
          >
            New Group
          </Button>
        </Box>
      </DialogTitle>
      <DialogContent>
        {groups.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <GroupIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No groups yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Create groups to easily share files with multiple people at once.
            </Typography>
          </Box>
        ) : (
          <List>
            {groups.map((group, index) => (
              <React.Fragment key={group.id}>
                <ListItem>
                  <ListItemText
                    primary={typeof group.name === 'string' ? group.name : '[Encrypted]'}
                    secondary={
                      <Box>
                        {group.description && typeof group.description === 'string' && (
                          <Typography variant="body2" color="text.secondary">
                            {group.description}
                          </Typography>
                        )}
                        {typeof group.description === 'object' && (
                          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                            [Encrypted Description]
                          </Typography>
                        )}
                        <Typography variant="caption" color="text.secondary">
                          {Array.isArray(group.members) ? (
                            <>
                              {(group.members as string[]).length} member{(group.members as string[]).length !== 1 ? 's' : ''}
                              {(group.members as string[]).length > 0 && ': '}
                              {(group.members as string[]).slice(0, 3).map(memberId => {
                                const contact = contacts.find(c => 
                                  (user && c.userId1 === user.uid && c.userId2 === memberId) ||
                                  (user && c.userId2 === user.uid && c.userId1 === memberId)
                                );
                                if (contact && user) {
                                  return getContactDisplayInfo(contact, user.uid).name;
                                }
                                return 'Unknown User';
                              }).join(', ')}
                              {(group.members as string[]).length > 3 && ` and ${(group.members as string[]).length - 3} more`}
                            </>
                          ) : (
                            '[Encrypted Members]'
                          )}
                        </Typography>
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      edge="end"
                      onClick={() => handleEditGroup(group)}
                      sx={{ mr: 1 }}
                    >
                      <Edit />
                    </IconButton>
                    <IconButton
                      edge="end"
                      onClick={() => handleDeleteGroup(group.id!)}
                      color="error"
                    >
                      <Delete />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
                {index < groups.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default GroupManagement;