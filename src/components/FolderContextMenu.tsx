import React from 'react';
import { Menu, MenuItem, Divider } from '@mui/material';
import {
  FolderOpen,
  CreateNewFolder,
  Edit,
  ContentCut,
  ContentCopy,
  ContentPaste,
  Share,
  Archive,
  Unarchive,
  Delete,
} from '@mui/icons-material';

export interface FolderContextMenuProps {
  open: boolean;
  mouseX: number;
  mouseY: number;
  onClose: () => void;
  onOpen: () => void;
  onNewSubfolder: () => void;
  onRename: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onShare: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete: () => void;
  isArchiveView?: boolean;
  canPaste?: boolean;
}

const FolderContextMenu: React.FC<FolderContextMenuProps> = ({
  open,
  mouseX,
  mouseY,
  onClose,
  onOpen,
  onNewSubfolder,
  onRename,
  onCut,
  onCopy,
  onPaste,
  onShare,
  onArchive,
  onRestore,
  onDelete,
  isArchiveView = false,
  canPaste = false,
}) => {
  const wrap = (fn: () => void) => () => { fn(); onClose(); };

  return (
    <Menu
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={open ? { top: mouseY, left: mouseX } : undefined}
    >
      <MenuItem onClick={wrap(onOpen)}>
        <FolderOpen sx={{ mr: 1, fontSize: 20 }} />
        Open
      </MenuItem>

      <Divider />

      <MenuItem onClick={wrap(onNewSubfolder)}>
        <CreateNewFolder sx={{ mr: 1, fontSize: 20 }} />
        New Subfolder
      </MenuItem>

      <Divider />

      <MenuItem onClick={wrap(onRename)}>
        <Edit sx={{ mr: 1, fontSize: 20 }} />
        Rename
      </MenuItem>
      <MenuItem onClick={wrap(onCut)}>
        <ContentCut sx={{ mr: 1, fontSize: 20 }} />
        Cut
      </MenuItem>
      <MenuItem onClick={wrap(onCopy)}>
        <ContentCopy sx={{ mr: 1, fontSize: 20 }} />
        Copy
      </MenuItem>
      <MenuItem onClick={wrap(onPaste)} disabled={!canPaste}>
        <ContentPaste sx={{ mr: 1, fontSize: 20 }} />
        Paste
      </MenuItem>

      <Divider />

      <MenuItem onClick={wrap(onShare)}>
        <Share sx={{ mr: 1, fontSize: 20 }} />
        Share
      </MenuItem>

      <Divider />

      {isArchiveView && onRestore && (
        <MenuItem onClick={wrap(onRestore)}>
          <Unarchive sx={{ mr: 1, fontSize: 20 }} />
          Restore
        </MenuItem>
      )}
      {!isArchiveView && onArchive && (
        <MenuItem onClick={wrap(onArchive)}>
          <Archive sx={{ mr: 1, fontSize: 20 }} />
          Archive
        </MenuItem>
      )}

      <Divider />

      <MenuItem onClick={wrap(onDelete)} sx={{ color: 'error.main' }}>
        <Delete sx={{ mr: 1, fontSize: 20 }} />
        Delete
      </MenuItem>
    </Menu>
  );
};

export default FolderContextMenu;
