import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  List,
  ListItemButton,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Typography,
  TextField,
  IconButton,
  Divider,
  Badge,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
  AppBar,
  Toolbar,
} from '@mui/material';
import {
  Send as SendIcon,
  Group as GroupIcon,
  Person as PersonIcon,
  MoreVert as MoreVertIcon,
  Search as SearchIcon,
  ArrowBack as ArrowBackIcon,
  AttachFile as AttachFileIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChatService } from '../services/chatService';
import type { Conversation, ChatMessage } from '../types/chat';
import ContactSelector from '../components/ContactSelector';
import ChatMessageList from '../components/ChatMessageList';
import { useTranslation } from 'react-i18next';
import { useFileUpload } from '../hooks/useFileUpload';
import { invalidateStorageUsage } from '../services/simpleStorageUsage';

const ChatPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const navigate = useNavigate();
  const location = useLocation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Use the file upload hook for upload progress and quota handling
  const { uploadFile, uploading } = useFileUpload();
  
  // New chat dialog state
  const [newChatDialogOpen, setNewChatDialogOpen] = useState(false);
  const [newChatType, setNewChatType] = useState<'individual' | 'group'>('individual');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  
  // Menu state
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  
  // Load user's conversations
  useEffect(() => {
    if (!user) {
      console.log('❌ ChatPage: No user, cannot load conversations');
      return;
    }
    
    console.log('📱 ChatPage: Loading conversations for user:', user.uid);
    
    const unsubscribe = ChatService.subscribeToConversations(user.uid, (convos) => {
      console.log('📬 ChatPage: Received conversations:', convos.length, convos);
      setConversations(convos);
    });
    
    return () => {
      console.log('🔌 ChatPage: Unsubscribing from conversations');
      unsubscribe();
    };
  }, [user]);
  
  // Load participant names for all conversations
  useEffect(() => {
    if (!user || conversations.length === 0) return;
    
    const loadParticipantNames = async () => {
      const { getUserProfile } = await import('../firestore');
      const names: Record<string, string> = {};
      
      // Get all unique participant IDs
      const allParticipantIds = new Set<string>();
      conversations.forEach(convo => {
        convo.participants.forEach(participantId => {
          if (participantId !== user.uid) {
            allParticipantIds.add(participantId);
          }
        });
      });
      
      // Fetch profiles for all participants
      for (const participantId of allParticipantIds) {
        try {
          const profile = await getUserProfile(participantId);
          if (profile) {
            names[participantId] = profile.displayName || profile.email || 'Unknown User';
          }
        } catch (error) {
          console.error('Error fetching participant profile:', error);
          names[participantId] = 'Unknown User';
        }
      }
      
      setParticipantNames(names);
    };
    
    loadParticipantNames();
  }, [user, conversations]);
  
  // Handle navigation from file manager - conversation should be passed via state
  useEffect(() => {
    const state = location.state as { conversationId?: string } | null;
    
    if (state?.conversationId && user && privateKey) {
      // Load the specific conversation
      ChatService.getConversation(state.conversationId).then(convo => {
        if (convo) {
          setSelectedConversation(convo);
          
          // Load participant names
          const fetchNames = async () => {
            const { getUserProfile } = await import('../firestore');
            const names: Record<string, string> = {};
            
            for (const participantId of convo.participants) {
              if (participantId !== user.uid) {
                try {
                  const profile = await getUserProfile(participantId);
                  if (profile) {
                    names[participantId] = profile.displayName || profile.email || 'Unknown User';
                  }
                } catch (error) {
                  console.error('Error fetching participant profile:', error);
                  names[participantId] = 'Unknown User';
                }
              }
            }
            
            setParticipantNames(names);
          };
          
          fetchNames();
        }
      }).catch(error => {
        console.error('Failed to load conversation:', error);
      });
      
      // Clear the state
      navigate('/chat', { replace: true, state: {} });
    }
  }, [location.state, user, privateKey, navigate]);
  
  // Load messages when conversation is selected
  useEffect(() => {
    if (!selectedConversation || !user || !privateKey) return;
    
    let refreshInterval: NodeJS.Timeout;
    
    const setupChat = async () => {
      const unsubscribe = ChatService.subscribeToMessages(
        selectedConversation.id!,
        user.uid,
        privateKey,
        (msgs) => {
          setMessages(msgs);
        }
      );
      
      // Mark conversation as read
      ChatService.markConversationAsRead(selectedConversation.id!, user.uid);
      
      // Track active chat session to prevent notifications
      const { ActiveChatSessionService } = await import('../services/activeChatSession');
      await ActiveChatSessionService.setActiveChatSession(user.uid, selectedConversation.id!);
      
      // Refresh session every 3 minutes to keep it active
      refreshInterval = setInterval(async () => {
        await ActiveChatSessionService.refreshActiveChatSession();
      }, 3 * 60 * 1000);
      
      return () => {
        unsubscribe();
        clearInterval(refreshInterval);
        // Clear active session when chat is closed
        ActiveChatSessionService.clearActiveChatSession();
      };
    };
    
    const cleanup = setupChat();
    
    return () => {
      cleanup.then(cleanupFn => cleanupFn?.());
    };
  }, [selectedConversation, user, privateKey]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setAttachedFiles(prev => [...prev, ...Array.from(files)]);
    }
    // Reset input to allow selecting the same file again
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSendFileMessage = async (file: File) => {
    if (!selectedConversation || !user || !privateKey) return;

    try {
      // Get conversation participants
      const participants = selectedConversation.participants || [];

      // Use the upload hook which handles quota checking, progress, and encryption
      const encryptionResult = await uploadFile(file, {
        folderId: null, // No folder for chat attachments
        participants,
        privateKey,
      });

      // Send message with file metadata
      const fileMetadata: ChatMessage['fileMetadata'] = {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        storagePath: encryptionResult.storagePath,
        encryptedKeys: encryptionResult.encryptedKeys,
      };

      await ChatService.sendMessage(
        selectedConversation.id!,
        user.uid,
        privateKey,
        `Shared a file: ${file.name}`,
        'file',
        fileMetadata
      );

      // Invalidate storage cache to update the sidebar widget
      invalidateStorageUsage(user.uid);
    } catch (error) {
      console.error('Failed to send file:', error);
      throw error;
    }
  };

  const handleSendMessage = async () => {
    if (!selectedConversation || !user || !privateKey) return;

    // If there are attached files, send them
    if (attachedFiles.length > 0) {
      setSending(true);
      try {
        // Send all files sequentially
        for (const file of attachedFiles) {
          await handleSendFileMessage(file);
        }
        // Clear attachments after all files sent successfully
        setAttachedFiles([]);
        setMessageInput('');
      } catch {
        alert('Failed to send file. Please try again.');
      } finally {
        setSending(false);
      }
      return;
    }

    // Otherwise send text message
    if (!messageInput.trim()) return;
    
    setSending(true);
    try {
      await ChatService.sendMessage(
        selectedConversation.id!,
        user.uid,
        privateKey,
        messageInput.trim()
      );
      setMessageInput('');
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };
  
  const handleCreateConversation = async () => {
    if (!user || !privateKey || selectedContacts.length === 0) return;
    
    setLoading(true);
    try {
      const conversationId = await ChatService.createConversation(
        user.uid,
        selectedContacts,
        newChatType,
        privateKey,
        newChatType === 'group' ? groupName : undefined,
        newChatType === 'group' ? groupDescription : undefined
      );
      
      // Find and select the new conversation
      const newConvo = conversations.find(c => c.id === conversationId);
      if (newConvo) {
        setSelectedConversation(newConvo);
      }
      
      // Reset dialog
      setNewChatDialogOpen(false);
      setSelectedContacts([]);
      setGroupName('');
      setGroupDescription('');
    } catch (error) {
      console.error('Failed to create conversation:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const getConversationName = (conversation: Conversation): string => {
    if (conversation.type === 'group') {
      return conversation.groupName || 'Group Chat';
    }
    
    // For individual chats, show the other participant's name
    const otherParticipantId = conversation.participants.find(id => id !== user?.uid);
    if (!otherParticipantId) return 'Unknown';
    
    return participantNames[otherParticipantId] || 'Loading...';
  };
  
  const getUnreadCount = (): number => {
    // This would be calculated based on messages read status
    return 0; // Placeholder
  };
  
  if (!user || !privateKey) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Typography>Please log in to access chat</Typography>
      </Box>
    );
  }
  
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Top Navigation Bar */}
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          <IconButton
            edge="start"
            onClick={() => navigate('/')}
            sx={{ mr: 2 }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t('chat.title', 'Chat')}
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Main Chat Container */}
      <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
        {/* Conversations List */}
        <Paper
          sx={{
            width: { xs: '100%', md: 320 },
            borderRight: 1,
            borderColor: 'divider',
            display: {
              xs: selectedConversation ? 'none' : 'flex', // Hide on mobile when chat selected
              md: 'flex' // Always show on desktop
            },
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <TextField
            fullWidth
            size="small"
            placeholder={t('chat.search', 'Search conversations...')}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
            }}
          />
        </Box>
        
        <List sx={{ flexGrow: 1, overflow: 'auto', py: 0 }}>
          {conversations.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {t('chat.noConversations', 'No conversations yet. Start a new chat!')}
              </Typography>
            </Box>
          ) : (
            conversations.map((conversation) => (
            <ListItemButton
              key={conversation.id}
              selected={selectedConversation?.id === conversation.id}
              onClick={() => setSelectedConversation(conversation)}
            >
              <ListItemAvatar>
                <Avatar>
                  {conversation.type === 'group' ? <GroupIcon /> : <PersonIcon />}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body1" noWrap>
                      {getConversationName(conversation)}
                    </Typography>
                    {getUnreadCount() > 0 && (
                      <Badge badgeContent={getUnreadCount()} color="primary" />
                    )}
                  </Box>
                }
                secondary={
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {conversation.lastMessagePreview || 'No messages yet'}
                  </Typography>
                }
              />
            </ListItemButton>
          ))
          )}
        </List>
        
        <Divider />
        
        <Box sx={{ p: 1, display: 'flex', gap: 1 }}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<PersonIcon />}
            onClick={() => {
              setNewChatType('individual');
              setNewChatDialogOpen(true);
            }}
          >
            {t('chat.newChat', 'New Chat')}
          </Button>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<GroupIcon />}
            onClick={() => {
              setNewChatType('group');
              setNewChatDialogOpen(true);
            }}
          >
            {t('chat.newGroup', 'New Group')}
          </Button>
        </Box>
      </Paper>
      
      {/* Chat Area */}
      <Box 
        sx={{ 
          flexGrow: 1, 
          display: {
            xs: selectedConversation ? 'flex' : 'none', // Only show on mobile when chat selected
            md: 'flex' // Always show on desktop
          },
          flexDirection: 'column', 
          overflow: 'hidden',
          width: { xs: '100%', md: 'auto' }
        }}
      >
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <Paper
              sx={{
                p: 2,
                borderBottom: 1,
                borderColor: 'divider',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <IconButton
                  onClick={() => setSelectedConversation(null)}
                  sx={{ 
                    display: { xs: 'inline-flex', md: 'none' } // Only show on mobile
                  }}
                >
                  <ArrowBackIcon />
                </IconButton>
                <Avatar>
                  {selectedConversation.type === 'group' ? <GroupIcon /> : <PersonIcon />}
                </Avatar>
                <Box>
                  <Typography variant="h6">
                    {getConversationName(selectedConversation)}
                  </Typography>
                  {selectedConversation.type === 'group' && (
                    <Typography variant="caption" color="text.secondary">
                      {selectedConversation.participants.length} members
                    </Typography>
                  )}
                </Box>
              </Box>
              
              <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)}>
                <MoreVertIcon />
              </IconButton>
              
              <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => setMenuAnchor(null)}
              >
                <MenuItem onClick={() => setMenuAnchor(null)}>
                  {t('chat.viewInfo', 'View Info')}
                </MenuItem>
                <MenuItem onClick={() => setMenuAnchor(null)}>
                  {t('chat.muteNotifications', 'Mute Notifications')}
                </MenuItem>
                <MenuItem onClick={() => setMenuAnchor(null)}>
                  {t('chat.leaveConversation', 'Leave Conversation')}
                </MenuItem>
              </Menu>
            </Paper>
            
            {/* Messages */}
            <ChatMessageList
              messages={messages}
              currentUserId={user.uid}
              conversationId={selectedConversation?.id}
              participantNames={participantNames}
            />
            
            {/* Message Input */}
            <Paper
              sx={{
                p: 2,
                borderTop: 1,
                borderColor: 'divider',
              }}
            >
              {/* File previews */}
              {attachedFiles.length > 0 && (
                <Box
                  sx={{
                    mb: 2,
                    p: 2,
                    bgcolor: 'action.hover',
                    borderRadius: 2,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                  }}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'medium' }}>
                    {attachedFiles.length} file{attachedFiles.length > 1 ? 's' : ''} attached
                  </Typography>
                  {attachedFiles.map((file, index) => (
                    <Box
                      key={`${file.name}-${index}`}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        p: 1,
                        bgcolor: 'background.paper',
                        borderRadius: 1,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
                        <AttachFileIcon fontSize="small" />
                        <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                          {file.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                          ({(file.size / 1024).toFixed(1)} KB)
                        </Typography>
                      </Box>
                      <IconButton 
                        size="small" 
                        onClick={() => handleRemoveAttachment(index)} 
                        disabled={sending || uploading}
                        sx={{ ml: 1 }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              )}

              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                  multiple
                  accept="*/*"
                />
                <IconButton
                  color="primary"
                  onClick={handleAttachClick}
                  disabled={sending || uploading}
                >
                  <AttachFileIcon />
                </IconButton>
                <TextField
                  fullWidth
                  multiline
                  maxRows={4}
                  placeholder={
                    attachedFiles.length > 0
                      ? t('chat.addCaption', 'Add a caption (optional)...')
                      : t('chat.typeMessage', 'Type a message...')
                  }
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  disabled={sending || uploading}
                />
                <IconButton
                  color="primary"
                  onClick={handleSendMessage}
                  disabled={(!messageInput.trim() && attachedFiles.length === 0) || sending || uploading}
                >
                  {sending || uploading ? <CircularProgress size={24} /> : <SendIcon />}
                </IconButton>
              </Box>
            </Paper>
          </>
        ) : (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
              color: 'text.secondary',
            }}
          >
            <Typography variant="h5" gutterBottom>
              {t('chat.selectConversation', 'Select a conversation')}
            </Typography>
            <Typography variant="body2">
              {t('chat.selectConversationHint', 'Choose a chat from the list or start a new conversation')}
            </Typography>
          </Box>
        )}
      </Box>
      
      {/* New Conversation Dialog */}
      <Dialog
        open={newChatDialogOpen}
        onClose={() => setNewChatDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {newChatType === 'group' ? t('chat.createGroup', 'Create Group Chat') : t('chat.createChat', 'Create Chat')}
        </DialogTitle>
        <DialogContent>
          {newChatType === 'group' && (
            <>
              <TextField
                fullWidth
                label={t('chat.groupName', 'Group Name')}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                sx={{ mb: 2, mt: 1 }}
              />
              <TextField
                fullWidth
                label={t('chat.groupDescription', 'Description (optional)')}
                value={groupDescription}
                onChange={(e) => setGroupDescription(e.target.value)}
                multiline
                rows={2}
                sx={{ mb: 2 }}
              />
            </>
          )}
          
          <Typography variant="subtitle2" gutterBottom>
            {t('chat.selectParticipants', 'Select Participants')}
          </Typography>
          <ContactSelector
            selectedContacts={selectedContacts}
            onSelectionChange={setSelectedContacts}
            currentUserId={user.uid}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewChatDialogOpen(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleCreateConversation}
            variant="contained"
            disabled={selectedContacts.length === 0 || (newChatType === 'group' && !groupName.trim()) || loading}
          >
            {loading ? <CircularProgress size={24} /> : t('common.create', 'Create')}
          </Button>
        </DialogActions>
      </Dialog>
      </Box>
    </Box>
  );
};

export default ChatPage;
