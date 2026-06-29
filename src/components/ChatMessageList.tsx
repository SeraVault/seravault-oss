// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Avatar,
  IconButton,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  MoreVert as MoreVertIcon,
  Done as DoneIcon,
  DoneAll as DoneAllIcon,
  AttachFile as AttachFileIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import type { ChatMessage } from '../types/chat';
import { format } from 'date-fns';
import MessageReactions from './MessageReactions';
import { useClipboard } from '../context/ClipboardContext';
// import { FieldValue } from 'firebase/firestore';
import { List, useListRef, type RowComponentProps } from 'react-window';

interface ChatMessageListProps {
  messages: ChatMessage[];
  currentUserId: string;
  conversationId?: string;
  participantNames?: Record<string, string>; // Optional: map of userId -> displayName
  onFileClick?: (message: ChatMessage) => void; // Callback for when a file attachment is clicked
  onMessageDelete?: (messageId: string) => Promise<void>; // Callback for when a message is deleted
}

const ChatMessageList: React.FC<ChatMessageListProps> = ({ 
  messages, 
  currentUserId,
  conversationId,
  participantNames = {},
  onFileClick,
  onMessageDelete
}) => {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const listRef = useListRef();
  const sizeMap = useRef<Map<number, number>>(new Map());
  const { copyItem } = useClipboard();
  const MAX_RENDER_MESSAGES = 500;
  const defaultRowHeight = 140;
  const visibleMessages = useMemo(
    () => messages.slice(-MAX_RENDER_MESSAGES),
    [messages]
  );
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (visibleMessages.length > 0) {
      listRef.current?.scrollToRow({ index: visibleMessages.length - 1 });
    }
  }, [visibleMessages.length]);
  
  const handleMessageMenu = (event: React.MouseEvent<HTMLElement>, message: ChatMessage) => {
    setMenuAnchor(event.currentTarget);
    setSelectedMessage(message);
  };
  
  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return '';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    // Just now (less than 1 minute)
    if (diffInMinutes < 1) {
      return 'Just now';
    }
    
    // Minutes ago (1-59 minutes)
    if (diffInMinutes < 60) {
      return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
    }
    
    // Hours ago (1-23 hours)
    if (diffInHours < 24) {
      return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
    }
    
    // Yesterday with time
    if (diffInDays === 1) {
      return `Yesterday at ${format(date, 'h:mm a')}`;
    }
    
    // This week (2-6 days ago)
    if (diffInDays < 7) {
      return `${format(date, 'EEEE')} at ${format(date, 'h:mm a')}`;
    }
    
    // Older messages (show date and time)
    return format(date, 'MMM d, yyyy at h:mm a');
  };
  
  const isRead = (message: ChatMessage): boolean => {
    if (!message.readBy) return false;
    // Check if all participants except sender have read
    return Object.keys(message.readBy).length > 1;
  };

  const handleCopyMessage = async () => {
    if (!selectedMessage) return;

    try {
      // If it's a file message, copy the file to app clipboard for pasting
      if (selectedMessage.type === 'file' && selectedMessage.fileMetadata) {
        // Create a FileData object from the chat attachment
        // Convert timestamp to Date if it's a Firestore timestamp
        const timestamp = selectedMessage.timestamp instanceof Date 
          ? selectedMessage.timestamp 
          : (selectedMessage.timestamp as { toDate?: () => Date })?.toDate?.() 
          || new Date();

        const fileData = {
          id: selectedMessage.id || '',
          name: selectedMessage.fileMetadata.fileName,
          size: `${selectedMessage.fileMetadata.fileSize} bytes`,
          storagePath: selectedMessage.fileMetadata.storagePath,
          owner: selectedMessage.senderId,
          sharedWith: [],
          encryptedKeys: selectedMessage.fileMetadata.encryptedKeys || {},
          parent: null,
          createdAt: timestamp,
          lastModified: timestamp,
        };

        // Copy to app clipboard for pasting into folders
        copyItem('file', fileData);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } else {
        // For text messages, copy the text to system clipboard
        const content = (selectedMessage as { content?: string }).content || '[Encrypted]';
        await navigator.clipboard.writeText(content);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      }
      setMenuAnchor(null);
    } catch (error) {
      console.error('Failed to copy:', error);
      alert('Failed to copy. Please try again.');
    }
  };

  const handleDownloadFile = async (message: ChatMessage) => {
    if (!message.fileMetadata) return;

    try {
      // Import necessary services
      const { getFile } = await import('../storage');
      
      // Download the encrypted file
      const encryptedData = await getFile(message.fileMetadata.storagePath);
      
      // Create blob and download
      const blob = new Blob([encryptedData], { type: message.fileMetadata.mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = message.fileMetadata.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download file:', error);
      alert('Failed to download file. Please try again.');
    }
  };
  
  interface RowProps {
    messages: ChatMessage[];
    currentUserId: string;
    participantNames: Record<string, string>;
    onMessageMenu: (event: React.MouseEvent<HTMLElement>, message: ChatMessage) => void;
    onFileClick?: (message: ChatMessage) => void;
    handleDownloadFile: (message: ChatMessage) => Promise<void>;
    conversationId?: string;
    formatTimestamp: (timestamp: any) => string;
  }

  const Row = ({ index, style, messages, currentUserId, participantNames, onMessageMenu, onFileClick, handleDownloadFile, conversationId, formatTimestamp }: RowComponentProps<RowProps>) => {
    const message = messages[index];

        const isOwn = message.senderId === currentUserId;
        const showAvatar = index === 0 || messages[index - 1].senderId !== message.senderId;
        const content = (message as { content?: string }).content || '[Encrypted]';
        
        return (
          <Box style={style} sx={{ width: '100%' }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: isOwn ? 'flex-end' : 'flex-start',
                mb: 1,
                alignItems: 'flex-end',
                gap: 1,
                px: 1,
              }}
            >
              {!isOwn && showAvatar && (
                <Avatar sx={{ width: 32, height: 32 }}>
                  {(participantNames[message.senderId] || 'Unknown')[0] || '?'}
                </Avatar>
              )}
              
              {!isOwn && !showAvatar && (
                <Box sx={{ width: 32 }} />
              )}
              
              <Paper
                sx={{
                  p: 1.5,
                  maxWidth: '70%',
                  backgroundColor: isOwn ? 'primary.main' : 'background.paper',
                  color: isOwn ? 'primary.contrastText' : 'text.primary',
                  borderRadius: 2,
                  position: 'relative',
                  '&:hover .message-menu': {
                    opacity: 1,
                  },
                }}
              >
                {!isOwn && showAvatar && (
                  <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                    {participantNames[message.senderId] || 'Unknown'}
                  </Typography>
                )}
                
                {/* File attachment display */}
                {message.type === 'file' && message.fileMetadata && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      p: 1,
                      bgcolor: isOwn ? 'rgba(255,255,255,0.1)' : 'action.hover',
                      borderRadius: 1,
                      mb: 1,
                      cursor: 'pointer',
                      '&:hover': {
                        bgcolor: isOwn ? 'rgba(255,255,255,0.15)' : 'action.selected',
                      },
                    }}
                    onClick={() => {
                      if (onFileClick) {
                        onFileClick(message);
                      } else {
                        // Fallback to download if no callback provided
                        handleDownloadFile(message);
                      }
                    }}
                  >
                    <AttachFileIcon fontSize="small" />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" noWrap>
                        {message.fileMetadata.fileName}
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.7 }}>
                        {(message.fileMetadata.fileSize / 1024).toFixed(1)} KB
                      </Typography>
                    </Box>
                    <DownloadIcon fontSize="small" sx={{ opacity: 0.7 }} />
                  </Box>
                )}
                
                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {content}
                </Typography>
                
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end', mt: 0.5 }}>
                  <Typography variant="caption" sx={{ opacity: 0.7, fontSize: '0.7rem' }}>
                    {formatTimestamp(message.timestamp)}
                  </Typography>
                  
                  {isOwn && (
                    message.readBy && Object.keys(message.readBy).length > 1 ? (
                      <DoneAllIcon sx={{ fontSize: 14, opacity: 0.7 }} />
                    ) : (
                      <DoneIcon sx={{ fontSize: 14, opacity: 0.7 }} />
                    )
                  )}
                </Box>

                {/* Emoji Reactions */}
                {conversationId && (
                  <MessageReactions
                    conversationId={conversationId}
                    message={message}
                    currentUserId={currentUserId}
                    userNames={participantNames}
                  />
                )}
                
                <IconButton
                  className="message-menu"
                  size="small"
                  onClick={(e) => handleMessageMenu(e, message)}
                  sx={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    opacity: 0,
                    transition: 'opacity 0.2s',
                    color: isOwn ? 'primary.contrastText' : 'text.secondary',
                  }}
                >
                  <MoreVertIcon fontSize="small" />
                </IconButton>
              </Paper>
            </Box>
          </Box>
        );
  };

  const rowProps: RowProps = useMemo(
    () => ({
      messages: visibleMessages,
      currentUserId,
      participantNames,
      onMessageMenu: handleMessageMenu,
      onFileClick,
      handleDownloadFile,
      conversationId,
      formatTimestamp,
    }),
    [visibleMessages, currentUserId, participantNames, onFileClick, conversationId]
  );

  const listHeight = Math.min(Math.max(visibleMessages.length * defaultRowHeight, 200), 900);

  return (
    <Box
      sx={{
        flexGrow: 1,
        overflow: 'hidden',
        p: 1,
        backgroundColor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <List
        listRef={listRef}
        style={{ height: listHeight, width: '100%' }}
        rowCount={visibleMessages.length}
        rowHeight={defaultRowHeight}
        rowComponent={Row}
        rowProps={rowProps}
      />
      
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        {[
          <MenuItem key="copy" onClick={handleCopyMessage}>
            {copySuccess ? 'Copied!' : (selectedMessage?.type === 'file' ? 'Copy file to clipboard' : 'Copy text')}
          </MenuItem>,
          ...(selectedMessage?.senderId === currentUserId ? [
            <MenuItem 
              key="delete" 
              onClick={async () => {
                if (selectedMessage && onMessageDelete) {
                  try {
                    await onMessageDelete(selectedMessage.id!);
                    setMenuAnchor(null);
                  } catch (error) {
                    console.error('Failed to delete message:', error);
                    alert('Failed to delete message. Please try again.');
                  }
                }
              }}
            >
              Delete
            </MenuItem>
          ] : [])
        ]}
      </Menu>
    </Box>
  );
};

export default React.memo(ChatMessageList);
