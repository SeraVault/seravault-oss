import React from 'react';
import {
  Drawer,
  List,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Typography,
  Divider,
  Box,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  Edit,
  ContentCut,
  ContentCopy,
  Delete,
  Share,
  Folder,
  InsertDriveFile,
  Visibility,
  Download,
  Star,
  StarBorder,
  Info,
  Archive,
  Unarchive,
} from '@mui/icons-material';

interface MobileActionMenuProps {
  open: boolean;
  onClose: () => void;
  itemName: string;
  itemType: 'file' | 'folder';
  hideCopy?: boolean; // Hide copy option (e.g., for chat files)
  isFavorite?: boolean; // Is this file marked as favorite?
  onOpen?: () => void;
  onDownload?: () => void;
  onToggleFavorite?: () => void; // Toggle favorite status for files
  onShowInfo?: () => void; // Show detailed file/folder information
  onRename: () => void;
  onCut: () => void;
  onCopy: () => void;
  onShare?: () => void;
  onDelete: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  isArchiveView?: boolean;
}

const MobileActionMenu: React.FC<MobileActionMenuProps> = ({
  open,
  onClose,
  itemName,
  itemType,
  hideCopy = false,
  isFavorite = false,
  onOpen,
  onDownload,
  onToggleFavorite,
  onShowInfo,
  onRename,
  onCut,
  onCopy,
  onShare,
  onDelete,
  onArchive,
  onRestore,
  isArchiveView = false,
}) => {
  const { t } = useTranslation();
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          maxHeight: '60vh',
        },
      }}
    >
      <Box sx={{ p: 2, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          {itemType === 'folder' ? (
            <Folder sx={{ mr: 1, color: 'text.secondary' }} />
          ) : (
            <InsertDriveFile sx={{ mr: 1, color: 'text.secondary' }} />
          )}
          <Typography variant="subtitle1" noWrap>
            {itemName}
          </Typography>
        </Box>
        <List disablePadding>
          {itemType === 'file' && onOpen && (
            <ListItemButton onClick={onOpen} sx={{ borderRadius: 1, mb: 1 }}>
              <ListItemIcon>
                <Visibility />
              </ListItemIcon>
              <ListItemText primary={t('contextMenu.open')} />
            </ListItemButton>
          )}
          
          {itemType === 'file' && onDownload && (
            <ListItemButton onClick={onDownload} sx={{ borderRadius: 1, mb: 1 }}>
              <ListItemIcon>
                <Download />
              </ListItemIcon>
              <ListItemText primary={t('contextMenu.download')} />
            </ListItemButton>
          )}
          
          {itemType === 'file' && onToggleFavorite && (
            <ListItemButton onClick={onToggleFavorite} sx={{ borderRadius: 1, mb: 1 }}>
              <ListItemIcon>
                {isFavorite ? <Star sx={{ color: 'warning.main' }} /> : <StarBorder />}
              </ListItemIcon>
              <ListItemText primary={isFavorite ? t('contextMenu.removeFromFavorites', 'Remove from Favorites') : t('contextMenu.addToFavorites', 'Add to Favorites')} />
            </ListItemButton>
          )}
          
          {onShowInfo && (
            <ListItemButton onClick={onShowInfo} sx={{ borderRadius: 1, mb: 1 }}>
              <ListItemIcon>
                <Info />
              </ListItemIcon>
              <ListItemText primary={t('contextMenu.showInfo', 'Show Info')} />
            </ListItemButton>
          )}
          
          {(onOpen || onDownload || onToggleFavorite || onShowInfo) && <Divider sx={{ my: 1 }} />}
          
          <ListItemButton onClick={onRename} sx={{ borderRadius: 1, mb: 1 }}>
            <ListItemIcon>
              <Edit />
            </ListItemIcon>
            <ListItemText primary={t('contextMenu.rename')} />
          </ListItemButton>

          <Divider sx={{ my: 1 }} />
          
          <ListItemButton onClick={onCut} sx={{ borderRadius: 1, mb: 1 }}>
            <ListItemIcon>
              <ContentCut />
            </ListItemIcon>
            <ListItemText primary={t('contextMenu.cut')} />
          </ListItemButton>
          
          {!hideCopy && (
            <ListItemButton onClick={onCopy} sx={{ borderRadius: 1, mb: 1 }}>
              <ListItemIcon>
                <ContentCopy />
              </ListItemIcon>
              <ListItemText primary={t('contextMenu.copy')} />
            </ListItemButton>
          )}
          
          {onShare && (
            <ListItemButton onClick={onShare} sx={{ borderRadius: 1, mb: 1 }}>
              <ListItemIcon>
                <Share />
              </ListItemIcon>
              <ListItemText primary={t('contextMenu.share')} />
            </ListItemButton>
          )}
          
          <Divider sx={{ my: 1 }} />

          {isArchiveView && onRestore && (
            <ListItemButton onClick={onRestore} sx={{ borderRadius: 1, mb: 1 }}>
              <ListItemIcon>
                <Unarchive />
              </ListItemIcon>
              <ListItemText primary={t('contextMenu.restore', 'Restore')} />
            </ListItemButton>
          )}

          {!isArchiveView && onArchive && (
            <ListItemButton onClick={onArchive} sx={{ borderRadius: 1, mb: 1 }}>
              <ListItemIcon>
                <Archive />
              </ListItemIcon>
              <ListItemText primary={t('contextMenu.archive', 'Archive')} />
            </ListItemButton>
          )}

          <Divider sx={{ my: 1 }} />

          <ListItemButton
            onClick={onDelete}
            sx={{ borderRadius: 1, mb: 1, color: 'error.main' }}
          >
            <ListItemIcon>
              <Delete sx={{ color: 'error.main' }} />
            </ListItemIcon>
            <ListItemText primary={t('contextMenu.delete')} />
          </ListItemButton>
        </List>
      </Box>
    </Drawer>
  );
};

export default MobileActionMenu;