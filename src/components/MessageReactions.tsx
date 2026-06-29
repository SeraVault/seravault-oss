import React, { useState, useEffect } from 'react';
import {
  IconButton,
  Popover,
  Box,
  Stack,
  Chip,
  Tooltip,
  Typography
} from '@mui/material';
import {
  AddReaction as AddReactionIcon,
  Favorite as FavoriteIcon,
  ThumbUp as ThumbUpIcon,
  EmojiEmotions as EmojiEmotionsIcon,
  Celebration as CelebrationIcon,
  SentimentVerySatisfied as SmileIcon
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { ChatService } from '../services/chatService';
import type { ChatMessage } from '../types/chat';

interface MessageReactionsProps {
  conversationId: string;
  message: ChatMessage;
  currentUserId: string;
  onReactionUpdate?: () => void;
  userNames?: Record<string, string>; // Optional: map of userId -> displayName
}

const QUICK_EMOJIS = [
  { emoji: '👍', label: 'Thumbs up', icon: ThumbUpIcon },
  { emoji: '❤️', label: 'Heart', icon: FavoriteIcon },
  { emoji: '😂', label: 'Laughing', icon: SmileIcon },
  { emoji: '😮', label: 'Surprised', icon: EmojiEmotionsIcon },
  { emoji: '🎉', label: 'Celebrate', icon: CelebrationIcon },
  { emoji: '👏', label: 'Clap' },
  { emoji: '🔥', label: 'Fire' },
  { emoji: '💯', label: '100' },
];

export const MessageReactions: React.FC<MessageReactionsProps> = ({
  conversationId,
  message,
  currentUserId,
  onReactionUpdate,
  userNames = {}
}) => {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [localUserNames, setLocalUserNames] = useState<Record<string, string>>(userNames);

  // Fetch user names for reactions if not provided
  useEffect(() => {
    const fetchUserNames = async () => {
      if (!message.reactions) return;
      
      const allUserIds = new Set<string>();
      Object.values(message.reactions).forEach(userIds => {
        userIds.forEach(uid => allUserIds.add(uid));
      });

      const { getUserProfile } = await import('../firestore');
      const names: Record<string, string> = { ...userNames };
      
      for (const userId of allUserIds) {
        if (!names[userId]) {
          try {
            const profile = await getUserProfile(userId);
            names[userId] = profile?.displayName || profile?.email || 'Unknown User';
          } catch (error) {
            console.error('Failed to fetch user profile:', error);
            names[userId] = 'Unknown User';
          }
        }
      }
      
      setLocalUserNames(names);
    };

    fetchUserNames();
  }, [message.reactions, userNames]);

  const handleOpenPicker = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClosePicker = () => {
    setAnchorEl(null);
  };

  const handleReaction = async (emoji: string) => {
    if (!message.id) return;
    
    setLoading(true);
    try {
      await ChatService.toggleReaction(
        conversationId,
        message.id,
        currentUserId,
        emoji
      );
      onReactionUpdate?.();
    } catch (error) {
      console.error('Failed to add reaction:', error);
    } finally {
      setLoading(false);
      handleClosePicker();
    }
  };

  const getUsersWhoReacted = (emoji: string): string[] => {
    return message.reactions?.[emoji] || [];
  };

  const hasUserReacted = (emoji: string): boolean => {
    return getUsersWhoReacted(emoji).includes(currentUserId);
  };

  const getReactionTooltip = (_emoji: string, userIds: string[]): string => {
    if (userIds.length === 0) return '';
    
    const names = userIds.map(uid => {
      if (uid === currentUserId) return 'You';
      return localUserNames[uid] || 'Someone';
    });

    if (names.length === 1) {
      return names[0];
    } else if (names.length === 2) {
      return `${names[0]} and ${names[1]}`;
    } else if (names.length === 3) {
      return `${names[0]}, ${names[1]}, and ${names[2]}`;
    } else {
      return `${names[0]}, ${names[1]}, and ${names.length - 2} others`;
    }
  };

  const open = Boolean(anchorEl);
  const reactions = message.reactions || {};
  const hasReactions = Object.keys(reactions).length > 0;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
      {/* Display existing reactions */}
      {hasReactions && Object.entries(reactions).map(([emoji, userIds]) => {
        const count = userIds.length;
        const userReacted = userIds.includes(currentUserId);
        
        return (
          <Tooltip
            key={emoji}
            title={getReactionTooltip(emoji, userIds)}
          >
            <Chip
              size="small"
              label={
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Typography variant="body2">{emoji}</Typography>
                  <Typography variant="caption">{count}</Typography>
                </Stack>
              }
              onClick={() => handleReaction(emoji)}
              disabled={loading}
              sx={{
                height: 24,
                cursor: 'pointer',
                backgroundColor: userReacted ? 'primary.light' : 'background.paper',
                borderColor: userReacted ? 'primary.main' : 'divider',
                '&:hover': {
                  backgroundColor: userReacted ? 'primary.main' : 'action.hover',
                },
              }}
              variant={userReacted ? 'filled' : 'outlined'}
            />
          </Tooltip>
        );
      })}

      {/* Add reaction button */}
      <Tooltip title={t('common.addReaction', 'Add reaction')}>
        <IconButton
          size="small"
          onClick={handleOpenPicker}
          disabled={loading}
          sx={{ 
            width: 24, 
            height: 24,
            opacity: 0.6,
            '&:hover': { opacity: 1 }
          }}
        >
          <AddReactionIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* Emoji picker popover */}
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClosePicker}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
      >
        <Box sx={{ p: 1.5, maxWidth: 280 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            React with emoji
          </Typography>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5}>
            {QUICK_EMOJIS.map(({ emoji, label, icon: Icon }) => (
              <Tooltip key={emoji} title={label}>
                <IconButton
                  size="small"
                  onClick={() => handleReaction(emoji)}
                  disabled={loading}
                  sx={{
                    fontSize: '1.5rem',
                    width: 40,
                    height: 40,
                    backgroundColor: hasUserReacted(emoji) ? 'primary.light' : 'transparent',
                    '&:hover': {
                      backgroundColor: hasUserReacted(emoji) ? 'primary.main' : 'action.hover',
                    },
                  }}
                >
                  {Icon ? <Icon /> : emoji}
                </IconButton>
              </Tooltip>
            ))}
          </Stack>
        </Box>
      </Popover>
    </Box>
  );
};

export default React.memo(MessageReactions);
