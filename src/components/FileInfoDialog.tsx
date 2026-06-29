import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Divider,
  Chip,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  Folder,
  InsertDriveFile,
  Person,
  CalendarToday,
  Storage,
  Share,
  Star,
  Chat,
  Assignment,
} from '@mui/icons-material';
import type { FileData } from '../files';
import type { Folder as FolderData } from '../firestore';

interface FileInfoDialogProps {
  open: boolean;
  onClose: () => void;
  item: FileData | FolderData | null;
  itemType: 'file' | 'folder';
  ownerName?: string;
  isFavorite?: boolean;
}

const FileInfoDialog: React.FC<FileInfoDialogProps> = ({
  open,
  onClose,
  item,
  itemType,
  ownerName,
  isFavorite = false,
}) => {
  const { t } = useTranslation();

  if (!item) return null;

  const name = typeof item.name === 'string' ? item.name : '[Encrypted]';
  const itemAsAny = item as unknown as Record<string, unknown>;
  const isChat = itemType === 'file' && itemAsAny?.fileType === 'chat';
  const isForm = itemType === 'file' && name.endsWith('.form.json');

  const formatFileSize = (sizeStr: string | number): string => {
    if (typeof sizeStr === 'number') {
      const bytes = sizeStr;
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return sizeStr;
  };

  const formatDate = (date: unknown): string => {
    if (!date) return '—';
    
    if (typeof date === 'object' && date !== null && 'toDate' in date && typeof (date as {toDate: () => Date}).toDate === 'function') {
      return (date as {toDate: () => Date}).toDate().toLocaleString();
    }
    if (date instanceof Date) {
      return date.toLocaleString();
    }
    if (typeof date === 'string') {
      return new Date(date).toLocaleString();
    }
    return '—';
  };

  const fileData = item as FileData;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
        },
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {itemType === 'folder' ? (
            <Folder color="primary" />
          ) : isChat ? (
            <Chat color="primary" />
          ) : isForm ? (
            <Assignment color="primary" />
          ) : (
            <InsertDriveFile color="primary" />
          )}
          <Typography variant="h6" component="span" noWrap sx={{ flex: 1 }}>
            {name}
          </Typography>
          {isFavorite && <Star sx={{ color: 'warning.main' }} />}
        </Box>
      </DialogTitle>
      
      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Type */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              {t('common.type', 'Type')}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
              {itemType === 'folder' ? (
                <Chip label={t('common.folder', 'Folder')} size="small" />
              ) : isChat ? (
                <Chip label={t('common.conversation', 'Conversation')} size="small" />
              ) : isForm ? (
                <Chip label={t('common.form', 'Form')} size="small" />
              ) : (
                <Chip label={t('common.file', 'File')} size="small" />
              )}
            </Box>
          </Box>

          <Divider />

          {/* Size (files only) */}
          {itemType === 'file' && !isChat && (
            <>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Storage fontSize="small" />
                  {t('common.size', 'Size')}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {typeof fileData.size === 'string' ? formatFileSize(fileData.size) : '[Encrypted]'}
                </Typography>
              </Box>
              <Divider />
            </>
          )}

          {/* Owner */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Person fontSize="small" />
              {t('common.owner', 'Owner')}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {ownerName || item.owner || '—'}
            </Typography>
          </Box>

          <Divider />

          {/* Shared with */}
          {(itemType === 'file' && Array.isArray(fileData.sharedWith) && fileData.sharedWith.length > 0) && (
            <>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Share fontSize="small" />
                  {t('common.sharedWith', 'Shared With')}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {`${fileData.sharedWith?.length || 0} ${fileData.sharedWith?.length === 1 ? t('common.person', 'person') : t('common.people', 'people')}`}
                </Typography>
              </Box>
              <Divider />
            </>
          )}

          {/* Created date */}
          {itemType === 'file' && fileData.createdAt && (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CalendarToday fontSize="small" />
                {t('common.created', 'Created')}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {formatDate(fileData.createdAt)}
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="contained">
          {t('common.close', 'Close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FileInfoDialog;
