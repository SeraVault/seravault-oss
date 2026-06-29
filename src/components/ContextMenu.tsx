import React from 'react';
import { Menu, MenuItem, Divider } from '@mui/material';
import { Edit, ContentCut, ContentCopy, Delete, Share, Archive, Unarchive } from '@mui/icons-material';

export interface ContextMenuProps {
  open: boolean;
  mouseX: number;
  mouseY: number;
  onClose: () => void;
  onRename: () => void;
  onEditForm?: () => void;
  onCut: () => void;
  onCopy: () => void;
  onShare?: () => void;
  onDelete: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  itemType: 'file' | 'folder';
  hideCopy?: boolean; // Hide copy option (e.g., for chat files)
  isArchiveView?: boolean; // Whether we're currently in the archive view
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  open,
  mouseX,
  mouseY,
  onClose,
  onRename,
  onCut,
  onCopy,
  onShare,
  onDelete,
  onArchive,
  onRestore,
  itemType,
  hideCopy = false,
  isArchiveView = false,
}) => {
  return (
    <Menu
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={open ? { top: mouseY, left: mouseX } : undefined}
    >
      <MenuItem onClick={onRename}>
        <Edit sx={{ mr: 1 }} />
        Rename
      </MenuItem>
      <Divider />
      <MenuItem onClick={onCut}>
        <ContentCut sx={{ mr: 1 }} />
        Cut
      </MenuItem>
      {!hideCopy && (
        <MenuItem onClick={onCopy}>
          <ContentCopy sx={{ mr: 1 }} />
          Copy
        </MenuItem>
      )}
      
      {onShare && itemType === 'file' && <Divider />}
      {onShare && itemType === 'file' && (
        <MenuItem onClick={onShare}>
          <Share sx={{ mr: 1 }} />
          Share
        </MenuItem>
      )}
      
      <Divider />
      {isArchiveView && onRestore && (
        <MenuItem onClick={onRestore}>
          <Unarchive sx={{ mr: 1 }} />
          Restore
        </MenuItem>
      )}
      {!isArchiveView && onArchive && (
        <MenuItem onClick={onArchive}>
          <Archive sx={{ mr: 1 }} />
          Archive
        </MenuItem>
      )}
      <Divider />
      <MenuItem onClick={onDelete} sx={{ color: 'error.main' }}>
        <Delete sx={{ mr: 1 }} />
        Delete
      </MenuItem>
    </Menu>
  );
};

export default ContextMenu;