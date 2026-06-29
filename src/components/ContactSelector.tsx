import React, { useState, useEffect, useCallback } from 'react';
import {
  List,
  ListItem,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Checkbox,
  TextField,
  Box,
  Typography,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';
import { Person as PersonIcon, Group as GroupIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { backendService } from '../backend/BackendService';
import { getUserGroups } from '../firestore';
import { hexToBytes } from '../crypto/quantumSafeCrypto';

interface Contact {
  id: string;
  displayName: string;
  email: string;
  publicKey?: string;
}

interface GroupItem {
  id: string;
  name: string;
  memberCount: number;
  memberIds: string[];
}

interface ContactSelectorProps {
  selectedContacts: string[];
  onSelectionChange: (contacts: string[]) => void;
  currentUserId: string;
  privateKey?: string; // Needed to decrypt group names
  includeGroups?: boolean; // Whether to show groups tab
}

const ContactSelector: React.FC<ContactSelectorProps> = ({
  selectedContacts,
  onSelectionChange,
  currentUserId,
  privateKey,
  includeGroups = true,
}) => {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState<'contacts' | 'groups'>('contacts');
  
  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      // Query where user is either userId1 or userId2
      const [snapshot1, snapshot2] = await Promise.all([
        backendService.query.get('contacts', [
          { type: 'where', field: 'userId1', operator: '==', value: currentUserId },
          { type: 'where', field: 'status', operator: '==', value: 'accepted' }
        ]),
        backendService.query.get('contacts', [
          { type: 'where', field: 'userId2', operator: '==', value: currentUserId },
          { type: 'where', field: 'status', operator: '==', value: 'accepted' }
        ])
      ]);

      const loadedContacts: Contact[] = [];
      
      // Process contacts where current user is userId1
      for (const doc of snapshot1) {
        loadedContacts.push({
          id: doc.userId2, // The other user
          displayName: doc.user2DisplayName || 'Unknown',
          email: doc.user2Email || '',
          publicKey: doc.user2PublicKey,
        });
      }
      
      // Process contacts where current user is userId2
      for (const doc of snapshot2) {
        loadedContacts.push({
          id: doc.userId1, // The other user
          displayName: doc.user1DisplayName || 'Unknown',
          email: doc.user1Email || '',
          publicKey: doc.user1PublicKey,
        });
      }
      
      setContacts(loadedContacts);
    } catch (error) {
      console.error('Failed to load contacts:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);
  
  const loadGroups = useCallback(async () => {
    if (!privateKey) return;
    
    try {
      // Convert private key string to Uint8Array
      const privateKeyBytes = hexToBytes(privateKey);
      
      // Use getUserGroups which properly handles encrypted groups
      const userGroups = await getUserGroups(currentUserId, privateKeyBytes);
      
      const loadedGroups: GroupItem[] = userGroups.map(group => {
        let groupName = 'Group';
        let memberIds: string[] = [];
        
        // Get group name (already decrypted by getUserGroups)
        if (typeof group.name === 'string') {
          groupName = group.name;
        }
        
        // Get member IDs
        if (Array.isArray(group.members)) {
          memberIds = group.members;
        }
        
        return {
          id: group.id || '',
          name: groupName,
          memberCount: memberIds.length,
          memberIds,
        };
      });
      
      setGroups(loadedGroups);
    } catch (error) {
      console.error('Failed to load groups:', error);
    }
  }, [currentUserId, privateKey]);
  
  useEffect(() => {
    loadContacts();
    if (includeGroups && privateKey) {
      loadGroups();
    }
  }, [loadContacts, loadGroups, includeGroups, privateKey]);
  
  const handleToggle = (contactId: string) => {
    const currentIndex = selectedContacts.indexOf(contactId);
    const newSelected = [...selectedContacts];
    
    if (currentIndex === -1) {
      newSelected.push(contactId);
    } else {
      newSelected.splice(currentIndex, 1);
    }
    
    onSelectionChange(newSelected);
  };
  
  const filteredContacts = contacts.filter(contact =>
    contact.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.email.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const filteredGroups = groups.filter(group =>
    group.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }
  
  return (
    <Box>
      {includeGroups && (
        <Tabs
          value={currentTab}
          onChange={(_, newValue) => setCurrentTab(newValue)}
          sx={{ mb: 2 }}
        >
          <Tab label={t('contacts.contactsTab', 'Contacts')} value="contacts" />
          <Tab label={t('contacts.groupsTab', 'Groups')} value="groups" />
        </Tabs>
      )}
      
      <TextField
        fullWidth
        size="small"
        placeholder={currentTab === 'contacts' ? "Search contacts..." : "Search groups..."}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        sx={{ mb: 2 }}
      />
      
      {currentTab === 'contacts' ? (
        filteredContacts.length === 0 ? (
          <Typography color="text.secondary" align="center" sx={{ py: 3 }}>
            No contacts found. Add contacts first to start chatting.
          </Typography>
        ) : (
          <List sx={{ maxHeight: 400, overflow: 'auto' }}>
            {filteredContacts.map((contact) => (
              <ListItem key={contact.id} disablePadding>
                <ListItemButton onClick={() => handleToggle(contact.id)} dense>
                  <Checkbox
                    edge="start"
                    checked={selectedContacts.indexOf(contact.id) !== -1}
                    tabIndex={-1}
                    disableRipple
                  />
                  <ListItemAvatar>
                    <Avatar>
                      <PersonIcon />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={contact.displayName}
                    secondary={contact.email}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )
      ) : (
        filteredGroups.length === 0 ? (
          <Typography color="text.secondary" align="center" sx={{ py: 3 }}>
            No groups found. Create a group first to start chatting.
          </Typography>
        ) : (
          <List sx={{ maxHeight: 400, overflow: 'auto' }}>
            {filteredGroups.map((group) => (
              <ListItem key={group.id} disablePadding>
                <ListItemButton onClick={() => handleToggle(group.id)} dense>
                  <Checkbox
                    edge="start"
                    checked={selectedContacts.indexOf(group.id) !== -1}
                    tabIndex={-1}
                    disableRipple
                  />
                  <ListItemAvatar>
                    <Avatar>
                      <GroupIcon />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={group.name}
                    secondary={`${group.memberCount} members`}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )
      )}
    </Box>
  );
};

export default ContactSelector;
