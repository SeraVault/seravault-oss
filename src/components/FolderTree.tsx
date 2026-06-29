import React from 'react';
import { List, ListItemButton, ListItemText, Collapse, ListItemIcon, IconButton, Box } from '@mui/material';
import { ChevronRight, ExpandMore, Folder, FolderOpen } from '@mui/icons-material';
import { type Folder as FolderData } from '../firestore';

export interface FolderContextMenuEvent {
  mouseX: number;
  mouseY: number;
  folder: FolderData;
}

interface FolderTreeProps {
  folders: FolderData[];
  onFolderClick: (folderId: string | null) => void;
  onMoveItem?: (itemId: string, itemType: 'file' | 'folder', targetFolderId: string | null) => void;
  onContextMenu?: (event: FolderContextMenuEvent) => void;
}

// Shared drag-over tracking — one ID across the whole tree so only one row highlights at a time
let activeDragOverId: string | null = null;
const dragOverListeners = new Set<() => void>();
function setActiveDragOver(id: string | null) {
  activeDragOverId = id;
  dragOverListeners.forEach(fn => fn());
}

const compareFoldersByName = (a: FolderData, b: FolderData) => {
  const getName = (folder: FolderData) => (typeof folder.name === 'string' ? folder.name : '');
  return getName(a).localeCompare(getName(b), undefined, { sensitivity: 'base' });
};

interface FolderTreeItemProps {
  folder: FolderData;
  allFolders: FolderData[];
  onFolderClick: (folderId: string | null) => void;
  onMoveItem?: (itemId: string, itemType: 'file' | 'folder', targetFolderId: string | null) => void;
  onContextMenu?: (event: FolderContextMenuEvent) => void;
  level: number;
}

const FolderTreeItem: React.FC<FolderTreeItemProps> = ({ folder, allFolders, onFolderClick, onMoveItem, onContextMenu, level }) => {
  const [open, setOpen] = React.useState(false);
  const [isDragOver, setIsDragOver] = React.useState(false);

  // Sync with the module-level shared drag-over tracker
  React.useEffect(() => {
    const sync = () => setIsDragOver(activeDragOverId === folder.id);
    dragOverListeners.add(sync);
    return () => { dragOverListeners.delete(sync); };
  }, [folder.id]);

  const handleFolderClick = () => {
    onFolderClick(folder.id || null);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onContextMenu) {
      onContextMenu({ mouseX: e.clientX, mouseY: e.clientY, folder });
    }
  };

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(!open);
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      id: folder.id,
      type: 'folder',
      name: folder.name
    }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setActiveDragOver(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (activeDragOverId !== folder.id) setActiveDragOver(folder.id ?? null);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if the pointer truly left this element (not moved to a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      if (activeDragOverId === folder.id) setActiveDragOver(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveDragOver(null);
    
    console.log('🎯 FolderTree drop event triggered on folder:', folder.name);
    console.log('🎯 Event dataTransfer types:', Array.from(e.dataTransfer.types));
    console.log('🎯 Raw drag data:', e.dataTransfer.getData('application/json'));
    
    try {
      const dragData = e.dataTransfer.getData('application/json');
      if (!dragData) {
        console.warn('❌ No drag data found');
        return;
      }
      
      const data = JSON.parse(dragData);
      console.log('🎯 Parsed drag data:', data);
      console.log('🎯 Target folder:', { id: folder.id, name: folder.name });
      
      // Don't allow dropping a folder into itself or its children
      if (data.type === 'folder' && (data.id === folder.id || isDescendant(data.id, folder.id!))) {
        console.warn('❌ Prevented dropping folder into itself or descendant');
        return;
      }
      
      if (onMoveItem && data.id !== folder.id) {
        console.log('✅ Calling onMoveItem with:', { itemId: data.id, itemType: data.type, targetFolderId: folder.id });
        onMoveItem(data.id, data.type, folder.id || null);
      } else {
        console.warn('❌ onMoveItem not called:', { hasHandler: !!onMoveItem, sameId: data.id === folder.id });
      }
    } catch (error) {
      console.error('❌ Error handling drop:', error);
    }
  };

  // Check if targetId is a descendant of sourceId
  const isDescendant = (sourceId: string, targetId: string): boolean => {
    const findChildren = (parentId: string): string[] => {
      const children = allFolders.filter(f => f.parent === parentId).map(f => f.id!);
      const grandchildren = children.flatMap(childId => findChildren(childId));
      return [...children, ...grandchildren];
    };
    
    const descendants = findChildren(sourceId);
    return descendants.includes(targetId);
  };

  const children = allFolders
    .filter((f) => f.parent === folder.id)
    .sort(compareFoldersByName);

  return (
    <>
      <ListItemButton
        draggable
        onClick={handleFolderClick}
        onContextMenu={handleContextMenu}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        sx={{ 
          pl: level * 1.5 + 1,
          pr: 1,
          py: 0.25,
          borderRadius: 1,
          mb: 0,
          minHeight: 32,
          cursor: 'pointer',
          backgroundColor: isDragOver ? 'primary.light' : 'transparent',
          border: isDragOver ? '2px dashed' : '2px solid transparent',
          borderColor: isDragOver ? 'primary.main' : 'transparent',
          transition: 'background-color 0.2s ease',
          '&:hover': {
            backgroundColor: isDragOver ? 'primary.light' : 'action.hover',
          },
          '&:active': {
            cursor: 'grabbing',
          }
        }}
      >
        {children.length > 0 ? (
          <IconButton
            size="small"
            onClick={handleToggleExpand}
            sx={{ 
              mr: 0.25,
              padding: 0.25,
              width: 18,
              height: 18,
              color: 'text.secondary'
            }}
          >
            {open ? <ExpandMore sx={{ fontSize: 16 }} /> : <ChevronRight sx={{ fontSize: 16 }} />}
          </IconButton>
        ) : (
          <Box sx={{ width: 18, mr: 0.25 }} />
        )}
        <ListItemIcon sx={{ minWidth: 24 }}>
          {open ? <FolderOpen sx={{ fontSize: 18 }} /> : <Folder sx={{ fontSize: 18 }} />}
        </ListItemIcon>
        <ListItemText 
          primary={typeof folder.name === 'string' ? folder.name : '[Encrypted]'} 
          primaryTypographyProps={{ 
            fontSize: '13px',
            fontWeight: 400,
            lineHeight: 1.2
          }}
        />
      </ListItemButton>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <List component="div" disablePadding dense>
          {children.map((child) => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              allFolders={allFolders}
              onFolderClick={onFolderClick}
              onMoveItem={onMoveItem}
              onContextMenu={onContextMenu}
              level={level + 1}
            />
          ))}
        </List>
      </Collapse>
    </>
  );
};

const FolderTree: React.FC<FolderTreeProps> = ({ folders, onFolderClick, onMoveItem, onContextMenu }) => {
  const rootFolders = folders
    .filter((f) => f.parent === null)
    .sort(compareFoldersByName);

  return (
    <List disablePadding>
      {rootFolders.map((folder) => (
        <FolderTreeItem
          key={folder.id}
          folder={folder}
          allFolders={folders}
          onFolderClick={onFolderClick}
          onMoveItem={onMoveItem}
          onContextMenu={onContextMenu}
          level={1}
        />
      ))}
    </List>
  );
};

export default React.memo(FolderTree);
