import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  TextField,
  IconButton,
  Avatar,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  useTheme,
  useMediaQuery,
  Alert,
  Button,
  LinearProgress,
} from '@mui/material';
import {
  Close,
  Send as SendIcon,
  Group as GroupIcon,
  Person as PersonIcon,
  MoreVert as MoreVertIcon,
  Share as ShareIcon,
  Print as PrintIcon,
  Download as DownloadIcon,
  AttachFile as AttachFileIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { ChatService } from '../services/chatService';
import type { Conversation, ChatMessage } from '../types/chat';
import ChatMessageList from './ChatMessageList';
import FileViewer from './FileViewer';
import { getUserProfile, updateUserProfile } from '../firestore';
import type { FileData } from '../files';
import { useFileUpload } from '../hooks/useFileUpload';
import { invalidateStorageUsage } from '../services/simpleStorageUsage';
import { useClipboard } from '../context/ClipboardContext';
import PrintSecurityWarningDialog from './PrintSecurityWarningDialog';

interface ChatViewerProps {
  open: boolean;
  conversationId: string | null;
  onClose: () => void;
  onShare?: () => void;
}

const ChatViewer: React.FC<ChatViewerProps> = ({
  open,
  conversationId,
  onClose,
  onShare,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { user } = useAuth();
  const { privateKey } = usePassphrase();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [loading, setLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [copySuccess, setCopySuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Use the file upload hook for upload progress and quota handling
  const { uploadFile, uploading, uploadProgress } = useFileUpload();
  const { copyItem } = useClipboard();

  // File viewer state
  const [fileViewerOpen, setFileViewerOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileData | null>(null);
  const [selectedFileContent, setSelectedFileContent] = useState<ArrayBuffer | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [printWarningOpen, setPrintWarningOpen] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ showPrintWarning?: boolean } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load user profile for print warning preference
  useEffect(() => {
    if (!user) return;

    getUserProfile(user.uid)
      .then(profile => {
        if (profile) {
          setCurrentUserProfile(profile);
        }
      })
      .catch(error => {
        console.error('Failed to load user profile:', error);
      });
  }, [user]);

  // Load conversation and participant names
  useEffect(() => {
    if (!conversationId || !user || !privateKey) return;

    setLoading(true);

    ChatService.getConversation(conversationId)
      .then(async (convo) => {
        if (convo) {
          setConversation(convo);

          // Load participant names
          const names: Record<string, string> = {};
          for (const participantId of convo.participants) {
            if (participantId !== user.uid) {
              try {
                const profile = await getUserProfile(participantId);
                if (profile) {
                  names[participantId] = profile.displayName || profile.email || 'Unknown User';
                }
              } catch (error: unknown) {
                console.error('Error fetching participant profile:', error);
                names[participantId] = 'Unknown User';
              }
            }
          }
          setParticipantNames(names);
        }
      })
      .catch((error) => {
        console.error('Failed to load conversation:', error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [conversationId, user, privateKey]);

  // Subscribe to messages
  useEffect(() => {
    if (!conversationId || !user || !privateKey) return;

    let refreshInterval: NodeJS.Timeout;

    const setupChat = async () => {
      const unsubscribe = ChatService.subscribeToMessages(
        conversationId,
        user.uid,
        privateKey,
        (msgs) => {
          setMessages(msgs);
        }
      );

      // Mark as read when opening
      await ChatService.markConversationAsRead(conversationId, user.uid);

      // Track active chat session to prevent notifications
      const { ActiveChatSessionService } = await import('../services/activeChatSession');
      await ActiveChatSessionService.setActiveChatSession(user.uid, conversationId);

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
  }, [conversationId, user, privateKey]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setAttachedFiles(prev => [...prev, ...Array.from(files)]);
    }
    // Reset input to allow selecting the same file again (important for Firefox)
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

  const handleClearAllAttachments = () => {
    setAttachedFiles([]);
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!conversationId || !user) return;
    
    try {
      await ChatService.deleteMessage(conversationId, messageId, user.uid);
      // Invalidate storage cache to update the sidebar widget
      invalidateStorageUsage(user.uid);
    } catch (error) {
      console.error('Failed to delete message:', error);
      throw error; // Re-throw to be handled by caller
    }
  };

  const handleCopyMessage = async (message: ChatMessage) => {
    if (!message) return;

    try {
      // If it's a file message, copy the file to app clipboard for pasting
      if (message.type === 'file' && message.fileMetadata) {
        // Create a FileData object from the chat attachment
        const fileData: FileData = {
          id: message.id || '',
          name: message.fileMetadata.fileName,
          size: `${message.fileMetadata.fileSize} bytes`,
          storagePath: message.fileMetadata.storagePath,
          owner: message.senderId,
          sharedWith: [],
          encryptedKeys: message.fileMetadata.encryptedKeys || {},
          parent: null,
          createdAt: message.timestamp instanceof Date 
            ? message.timestamp 
            : (message.timestamp as any)?.toDate 
              ? (message.timestamp as any).toDate() 
              : new Date(),
          lastModified: message.timestamp instanceof Date 
            ? message.timestamp 
            : (message.timestamp as any)?.toDate 
              ? (message.timestamp as any).toDate() 
              : new Date(),
        };

        // Copy to app clipboard for pasting into folders
        copyItem('file', fileData);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } else {
        // For text messages, copy the text to system clipboard
        const content = (message as { content?: string }).content || '[Encrypted]';
        await navigator.clipboard.writeText(content);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      }
    } catch (error) {
      console.error('Failed to copy:', error);
      alert('Failed to copy. Please try again.');
    }
  };

  const handleSendFileMessage = async (file: File) => {
    if (!conversationId || !user || !privateKey) return;


    try {
      // Get conversation participants
      const participants = conversation?.participants || [];

      // Use the upload hook which handles quota checking, progress, and encryption
      const encryptionResult = await uploadFile(file, {
        folderId: null, // No folder for chat attachments
        participants,
        privateKey,
      });

      // Send message with file metadata including encryption keys
      const fileMetadata: ChatMessage['fileMetadata'] = {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        storagePath: encryptionResult.storagePath,
        encryptedKeys: encryptionResult.encryptedKeys,
      };

      await ChatService.sendMessage(
        conversationId,
        user.uid,
        privateKey,
        `Shared a file: ${file.name}`,
        'file',
        fileMetadata
      );

      // Don't clear attachments here - handled by handleSendMessage after all files sent
    } catch (error) {
      console.error('Failed to send file:', error);
      {
        alert('Failed to send file. Please try again.');
      }
      throw error; // Re-throw to handle in batch send
    }
  };

  const handleSendMessage = async () => {
    if (!conversationId || !user || !privateKey) return;

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
        // Error already handled in handleSendFileMessage
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
        conversationId,
        user.uid,
        privateKey,
        messageInput.trim()
      );
      setMessageInput('');
    } catch (error: unknown) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFileClick = async (message: ChatMessage) => {
    if (!message.fileMetadata || !user || !privateKey) return;

    setLoadingFile(true);
    try {
      // Check if we have encryption keys
      if (!message.fileMetadata.encryptedKeys || !message.fileMetadata.encryptedKeys[user.uid]) {
        alert('You do not have access to decrypt this file.');
        return;
      }

      // Import necessary services
      const { getFile } = await import('../storage');
      const { FileEncryptionService } = await import('../services/fileEncryption');
      
      // Download the encrypted file from storage
      const encryptedData = await getFile(message.fileMetadata.storagePath);
      
      // Decrypt the file using the user's encrypted key
      const decryptedContent = await FileEncryptionService.decryptFile(
        new Uint8Array(encryptedData),
        message.fileMetadata.encryptedKeys[user.uid],
        privateKey
      );
      
      // Convert timestamp to Date
      const timestamp = message.timestamp instanceof Date 
        ? message.timestamp 
        : (message.timestamp as any).toDate 
          ? (message.timestamp as any).toDate() 
          : new Date();

      // Create a minimal FileData object for the viewer
      const fileData: FileData = {
        id: message.id || '',
        name: message.fileMetadata.fileName,
        size: `${message.fileMetadata.fileSize} bytes`,
        storagePath: message.fileMetadata.storagePath,
        owner: message.senderId,
        sharedWith: [],
        encryptedKeys: message.fileMetadata.encryptedKeys,
        parent: null,
        createdAt: timestamp,
        lastModified: timestamp,
      };

      setSelectedFile(fileData);
      setSelectedFileContent(decryptedContent.buffer as ArrayBuffer);
      setFileViewerOpen(true);
    } catch (error) {
      console.error('Failed to load file:', error);
      alert('Failed to load file. Please try again.');
    } finally {
      setLoadingFile(false);
    }
  };

  const getConversationName = (): string => {
    if (!conversation) return 'Loading...';

    if (conversation.type === 'group') {
      return conversation.groupName || 'Group Chat';
    }

    // For individual chats, show the other participant's name
    const otherParticipantId = conversation.participants.find((id) => id !== user?.uid);
    if (!otherParticipantId) return 'Unknown';

    return participantNames[otherParticipantId] || 'Loading...';
  };

  const handleDownload = () => {
    if (!conversation || messages.length === 0) return;

    // Create a formatted text representation of the chat
    const chatName = getConversationName();
    let chatText = `${chatName}\n`;
    chatText += `${'='.repeat(chatName.length)}\n\n`;

    messages.forEach((msg) => {
      const senderName = msg.senderId === user?.uid 
        ? 'You' 
        : participantNames[msg.senderId] || msg.senderName || 'Unknown User';
      
      let timestamp = '';
      if (msg.timestamp instanceof Date) {
        timestamp = msg.timestamp.toLocaleString();
      } else if (msg.timestamp && typeof msg.timestamp === 'object' && 'toDate' in msg.timestamp) {
        timestamp = (msg.timestamp as any).toDate().toLocaleString();
      }
      
      const content = (msg as any).content || '[Encrypted]';
      chatText += `[${timestamp}] ${senderName}:\n${content}\n\n`;
    });

    // Create and download the file
    const blob = new Blob([chatText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${chatName.replace(/[^a-z0-9]/gi, '_')}_chat_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    setMenuAnchor(null);
  };

  const handlePrint = () => {
    if (!conversation || messages.length === 0) return;

    // Check if user wants to see warning (default: true)
    const shouldShowWarning = currentUserProfile?.showPrintWarning !== false;

    if (shouldShowWarning) {
      setPrintWarningOpen(true);
      setMenuAnchor(null);
    } else {
      performPrint();
      setMenuAnchor(null);
    }
  };

  const performPrint = () => {
    if (!conversation || messages.length === 0) return;

    // Create a formatted HTML representation of the chat
    const chatName = getConversationName();
    let chatHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${chatName}</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 20px auto; padding: 20px; }
          h1 { border-bottom: 2px solid #333; padding-bottom: 10px; }
          .message { margin: 15px 0; padding: 10px; border-left: 3px solid #1976d2; }
          .message-header { font-weight: bold; color: #1976d2; margin-bottom: 5px; }
          .message-time { font-size: 0.85em; color: #666; }
          .message-content { margin-top: 5px; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <h1>${chatName}</h1>
    `;

    messages.forEach((msg) => {
      const senderName = msg.senderId === user?.uid 
        ? 'You' 
        : participantNames[msg.senderId] || msg.senderName || 'Unknown User';
      
      let timestamp = '';
      if (msg.timestamp instanceof Date) {
        timestamp = msg.timestamp.toLocaleString();
      } else if (msg.timestamp && typeof msg.timestamp === 'object' && 'toDate' in msg.timestamp) {
        timestamp = (msg.timestamp as any).toDate().toLocaleString();
      }
      
      const content = (msg as any).content || '[Encrypted]';
      const escapedContent = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      
      chatHtml += `
        <div class="message">
          <div class="message-header">${senderName}</div>
          <div class="message-time">${timestamp}</div>
          <div class="message-content">${escapedContent}</div>
        </div>
      `;
    });

    chatHtml += `
      </body>
      </html>
    `;

    // Open print window
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(chatHtml);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  const handleNeverShowPrintWarning = async () => {
    if (user?.uid) {
      try {
        await updateUserProfile(user.uid, { showPrintWarning: false });
        setCurrentUserProfile({ ...currentUserProfile, showPrintWarning: false });
      } catch (error) {
        console.error('Failed to update print warning preference:', error);
      }
    }
  };

  if (!user || !privateKey) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          height: isMobile ? '100%' : '80vh',
          maxHeight: isMobile ? '100%' : '80vh',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* Header */}
      <DialogTitle
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: 1,
          borderColor: 'divider',
          py: 2,
          px: 3,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, minWidth: 0 }}>
          <Avatar>
            {conversation?.type === 'group' ? <GroupIcon /> : <PersonIcon />}
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="h6" noWrap>
              {getConversationName()}
            </Typography>
            {conversation?.type === 'group' && (
              <Typography variant="caption" color="text.secondary">
                {conversation.participants.length} members
              </Typography>
            )}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          {onShare && (
            <IconButton onClick={onShare} size="small">
              <ShareIcon />
            </IconButton>
          )}
          <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)} size="small">
            <MoreVertIcon />
          </IconButton>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Box>

        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
        >
          <MenuItem onClick={handleDownload}>
            <ListItemIcon>
              <DownloadIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Download Chat</ListItemText>
          </MenuItem>
          <MenuItem onClick={handlePrint}>
            <ListItemIcon>
              <PrintIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Print Chat</ListItemText>
          </MenuItem>
        </Menu>
      </DialogTitle>

      {/* Messages Area */}
      <DialogContent
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {loading ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              flex: 1,
            }}
          >
            <Typography color="text.secondary">Loading conversation...</Typography>
          </Box>
        ) : conversation ? (
          <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 2 }}>
            <ChatMessageList
              messages={messages}
              currentUserId={user.uid}
              participantNames={participantNames}
              conversationId={conversationId || undefined}
              onFileClick={handleFileClick}
              onMessageDelete={handleDeleteMessage}
            />
            {copySuccess && (
              <Box
                sx={{
                  position: 'fixed',
                  bottom: 100,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  bgcolor: 'success.main',
                  color: 'white',
                  px: 3,
                  py: 1,
                  borderRadius: 2,
                  zIndex: 9999,
                  boxShadow: 3,
                }}
              >
                <Typography>Copied to clipboard!</Typography>
              </Box>
            )}
            <div ref={messagesEndRef} />
          </Box>
        ) : (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              flex: 1,
            }}
          >
            <Typography color="text.secondary">Conversation not found</Typography>
          </Box>
        )}
      </DialogContent>

      <Divider />

      {/* Message Input */}
      <DialogActions
        sx={{
          p: 2,
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 1,
        }}
      >
        {/* File previews */}
        {attachedFiles.length > 0 && (
          <Box
            sx={{
              p: 2,
              bgcolor: 'action.hover',
              borderRadius: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            {/* Header with count and clear all button */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'medium' }}>
                {attachedFiles.length} file{attachedFiles.length > 1 ? 's' : ''} attached
              </Typography>
              <Button
                size="small"
                onClick={handleClearAllAttachments}
                disabled={uploading}
                sx={{ minWidth: 'auto', p: 0.5 }}
              >
                Clear all
              </Button>
            </Box>
            
            {/* List of files */}
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
                  disabled={uploading}
                  sx={{ ml: 1 }}
                >
                  <Close fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Box>
        )}

        {/* Upload progress */}
        {uploading && uploadProgress.stage && (
          <Box sx={{ width: '100%', p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                {uploadProgress.fileName && `Uploading: ${uploadProgress.fileName}`}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {uploadProgress.fileSize}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                {uploadProgress.stage}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {Math.round(uploadProgress.progress)}%
              </Typography>
            </Box>
            <LinearProgress 
              variant="determinate" 
              value={uploadProgress.progress}
              sx={{ borderRadius: 1 }}
            />
          </Box>
        )}

        {/* Input row */}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            multiple
          />
          <IconButton
            color="primary"
            onClick={handleAttachClick}
            disabled={sending || uploading || !conversation}
            sx={{ flexShrink: 0 }}
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
            onKeyPress={handleKeyPress}
            disabled={sending || uploading || !conversation}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 3,
              },
            }}
          />
          <IconButton
            color="primary"
            onClick={handleSendMessage}
            disabled={(!messageInput.trim() && attachedFiles.length === 0) || sending || uploading || !conversation}
            sx={{
              flexShrink: 0,
              bgcolor: 'primary.main',
              color: 'white',
              '&:hover': {
                bgcolor: 'primary.dark',
              },
              '&.Mui-disabled': {
                bgcolor: 'action.disabledBackground',
              },
            }}
          >
            <SendIcon />
          </IconButton>
        </Box>
      </DialogActions>


      {/* File Viewer for attachments */}
      <FileViewer
        open={fileViewerOpen}
        file={selectedFile}
        fileContent={selectedFileContent}
        loading={loadingFile}
        onClose={() => {
          setFileViewerOpen(false);
          setSelectedFile(null);
          setSelectedFileContent(null);
        }}
        onDownload={() => {
          if (!selectedFile || !selectedFileContent) return;
          const blob = new Blob([selectedFileContent]);
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = typeof selectedFile.name === 'string' ? selectedFile.name : 'file';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }}
        userId={user.uid}
      />

      {/* Print Security Warning Dialog */}
      <PrintSecurityWarningDialog
        open={printWarningOpen}
        onClose={() => setPrintWarningOpen(false)}
        onConfirm={() => {
          setPrintWarningOpen(false);
          performPrint();
        }}
        onNeverShowAgain={() => {
          setPrintWarningOpen(false);
          handleNeverShowPrintWarning();
          performPrint();
        }}
        fileName={getConversationName()}
        isForm={false}
      />
    </Dialog>
  );
};

export default ChatViewer;
