import React, { useEffect, useState, useMemo } from 'react';
import {
  Collapse,
  Drawer,
  Toolbar,
  List,
  ListItemText,
  ListItemButton,
  useTheme,
  useMediaQuery,
  Box,
  Typography,
  Divider,
  ListItemIcon,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Menu,
  MenuItem,
  Alert,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
  Home,
  Star,
  AccessTime,
  Share,
  CloudSync,
  ChevronLeft,
  ChevronRight,
  People,
  HelpOutline,
  Email,
  Archive,
  CreateNewFolder,
  ContentPaste,
  Upload,
  Description,
  Chat,
  ExpandLess,
  ExpandMore,
  Lock,
  CreditCard,
  AccountBalance,
  Badge,
  StickyNote2,
  Wifi,
  Build,
  InsertDriveFile,
  Folder,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { backendService } from '../backend/BackendService';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { useClipboard } from '../context/ClipboardContext';
import { useContentActions } from '../context/ContentActionsContext';
import FolderTree, { type FolderContextMenuEvent } from './FolderTree';
import FolderContextMenu from './FolderContextMenu';
import RenameDialog from './RenameDialog';
import NewFolderDialog from './NewFolderDialog';
import ShareDialog from './ShareDialog';
import { useFolders } from '../hooks/useFolders';
import { useGlobalFileIndex } from '../hooks/useGlobalFileIndex';
import { useRecents } from '../context/RecentsContext';
import { useSimpleStorageUsage } from '../hooks/useSimpleStorageUsage';
import { updateFolder, createFolder, renameFolderWithEncryption, deleteFolder, archiveFolder, unarchiveFolder, archiveFile } from '../firestore';
import { type Folder as FolderData } from '../firestore';
import { type FileData } from '../files';
import { isFormFile, getFormTypeFromFilename } from '../utils/formFiles';

interface DocTypeInfo {
  key: string;
  label: string;
  icon: React.ReactNode;
  count: number;
}

interface SideNavProps {
  drawerWidth: number;
  mobileOpen: boolean;
  desktopOpen?: boolean;
  handleDrawerToggle: () => void;
  currentFolder: string | null;
  setCurrentFolder: (folderId: string | null) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  userId?: string; // Used in handleMoveItem
  userPrivateKey?: string;
  selectedTags?: string[];
  onTagSelectionChange?: (tags: string[]) => void;
  matchAllTags?: boolean;
  onMatchModeChange?: (matchAll: boolean) => void;
  files?: FileData[];
}

const SideNav: React.FC<SideNavProps> = ({
  drawerWidth,
  mobileOpen,
  desktopOpen = true,
  handleDrawerToggle,
  setCurrentFolder,
  collapsed = false,
  onToggleCollapse,
  userId,
  userPrivateKey,
  files = [],
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const { clipboardItems, clipboardItem, cutItem, copyItem, clearClipboard } = useClipboard();
  const { allFolders: allFoldersRaw } = useFolders();
  const { rawFiles: allRawFiles } = useGlobalFileIndex();
  // Exclude folders archived by the current user from the sidebar tree
  const allFolders = allFoldersRaw.filter(f =>
    !userId || !f.archivedBy || !Array.isArray(f.archivedBy) || !f.archivedBy.includes(userId)
  );
  const hasArchivedItems =
    allFoldersRaw.some(f => userId && Array.isArray(f.archivedBy) && f.archivedBy.includes(userId)) ||
    allRawFiles.some((f: any) => userId && Array.isArray(f.archivedBy) && f.archivedBy.includes(userId));
  const hasSubFolders = allFolders.length > 0;
  const { isRecentsView, setIsRecentsView, isFavoritesView, setIsFavoritesView, isSharedView, setIsSharedView, isArchivedView, setIsArchivedView, selectedDocType, setSelectedDocType } = useRecents();
  
  // Folder tree expand/collapse
  const [foldersOpen, setFoldersOpen] = useState(true);
  // Document type filter section open/closed
  const [docTypeOpen, setDocTypeOpen] = useState(false);

  // Compute available doc types from the files list
  const availableDocTypes = useMemo((): DocTypeInfo[] => {
    if (!files.length) return [];

    const DOC_TYPE_META: Record<string, { label: string; icon: React.ReactNode; order: number }> = {
      chat:         { label: t('docTypes.chats', 'Chats'),          icon: <Chat fontSize="small" />,          order: 0 },
      password:     { label: t('docTypes.passwords', 'Passwords'),  icon: <Lock fontSize="small" />,          order: 1 },
      credit_card:  { label: t('docTypes.creditCards', 'Credit Cards'), icon: <CreditCard fontSize="small" />,  order: 2 },
      bank_account: { label: t('docTypes.bankAccounts', 'Bank Accounts'), icon: <AccountBalance fontSize="small" />, order: 3 },
      identity:     { label: t('docTypes.identities', 'Identities'), icon: <Badge fontSize="small" />,        order: 4 },
      secure_note:  { label: t('docTypes.secureNotes', 'Secure Notes'), icon: <StickyNote2 fontSize="small" />, order: 5 },
      wifi:         { label: t('docTypes.wifi', 'Wi-Fi'),            icon: <Wifi fontSize="small" />,         order: 6 },
      template:     { label: t('docTypes.templates', 'Templates'),   icon: <Description fontSize="small" />,  order: 7 },
      builtin:      { label: t('docTypes.builtinForms', 'Built-in Forms'), icon: <Build fontSize="small" />, order: 8 },
      custom:       { label: t('docTypes.customForms', 'Custom Forms'), icon: <Folder fontSize="small" />,   order: 9 },
      file:         { label: t('docTypes.files', 'Files'),           icon: <InsertDriveFile fontSize="small" />, order: 10 },
    };

    const counts: Record<string, number> = {};
    for (const f of files) {
      if ((f as any).fileType === 'chat') {
        counts.chat = (counts.chat ?? 0) + 1;
      } else if (typeof f.name === 'string' && isFormFile(f.name)) {
        const formType = getFormTypeFromFilename(f.name) ?? 'custom';
        counts[formType] = (counts[formType] ?? 0) + 1;
      } else {
        counts.file = (counts.file ?? 0) + 1;
      }
    }

    return Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => ({
        key,
        label: DOC_TYPE_META[key]?.label ?? key,
        icon: DOC_TYPE_META[key]?.icon ?? <InsertDriveFile fontSize="small" />,
        count,
      }))
      .sort((a, b) => {
        const orderA = DOC_TYPE_META[a.key]?.order ?? 99;
        const orderB = DOC_TYPE_META[b.key]?.order ?? 99;
        return orderA - orderB;
      });
  }, [files, t]);

  // Storage usage
  const { usage: storageUsage, loading: storageLoading, refresh: refreshStorage } = useSimpleStorageUsage();
  

  // Root folder drop zone state
  const [isRootDropZone, setIsRootDropZone] = React.useState(false);

  // Archive drop zone state
  const [isArchiveDropZone, setIsArchiveDropZone] = React.useState(false);

  // Sidebar folder context menu state
  const [folderContextMenu, setFolderContextMenu] = useState<(FolderContextMenuEvent & { folder: FolderData }) | null>(null);
  // Stored separately so dialogs still have access after the menu closes
  const [contextFolder, setContextFolder] = useState<FolderData | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [newSubfolderDialogOpen, setNewSubfolderDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Root "All Files" context menu state
  const [rootContextMenu, setRootContextMenu] = useState<{ mouseX: number; mouseY: number } | null>(null);

  const { onUpload, onNewForm, onNewChat } = useContentActions();

  // ── Sidebar folder context menu handlers ─────────────────────────────────

  const handleFolderContextMenu = (event: FolderContextMenuEvent) => {
    setContextFolder(event.folder);
    setFolderContextMenu(event);
  };

  const handleContextOpen = () => {
    if (!contextFolder) return;
    handleFolderClick(contextFolder.id || null);
  };

  const handleContextNewSubfolder = () => {
    setNewSubfolderDialogOpen(true);
  };

  const handleContextRename = () => {
    setRenameDialogOpen(true);
  };

  const handleContextCut = () => {
    if (!contextFolder) return;
    cutItem('folder', contextFolder);
  };

  const handleContextCopy = () => {
    if (!contextFolder) return;
    copyItem('folder', contextFolder);
  };

  const handleContextPaste = async () => {
    if (clipboardItems.length === 0 || !user) return;
    const targetFolderId = contextFolder?.id ?? null;
    try {
      for (const item of clipboardItems) {
        if (item.type === 'folder') {
          const folder = item.item as FolderData;
          if (item.operation === 'cut') {
            await updateFolder(folder.id!, { parent: targetFolderId });
          }
          // Folder copy is complex (needs re-encryption) — skip for now like MainContent does
        } else if (item.type === 'file') {
          const { moveFileForUser } = await import('../services/userFolderManagement');
          await moveFileForUser(item.item.id!, user.uid, targetFolderId);
        }
      }
      clearClipboard();
    } catch (error) {
      console.error('Paste failed:', error);
    }
  };

  const handleContextShare = () => {
    setShareDialogOpen(true);
  };

  const handleContextArchive = async () => {
    if (!contextFolder?.id || !user) return;
    try {
      await archiveFolder(contextFolder.id, user.uid);
    } catch (error) {
      console.error('Archive failed:', error);
    }
    setFolderContextMenu(null);
  };

  const handleContextRestore = async () => {
    if (!contextFolder?.id || !user) return;
    try {
      await unarchiveFolder(contextFolder.id, user.uid);
    } catch (error) {
      console.error('Restore failed:', error);
    }
    setFolderContextMenu(null);
  };

  const handleContextDelete = () => {
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!contextFolder?.id) return;
    try {
      await deleteFolder(contextFolder.id);
    } catch (error) {
      console.error('Delete failed:', error);
    }
    setDeleteConfirmOpen(false);
    setFolderContextMenu(null);
    setContextFolder(null);
  };

  const handleDoRename = async (newName: string) => {
    if (!contextFolder?.id || !user) return;
    const key = privateKey || userPrivateKey;
    if (!key) return;
    try {
      await renameFolderWithEncryption(contextFolder.id, newName, user.uid);
    } catch (error) {
      console.error('Rename failed:', error);
    }
  };

  const handleCreateSubfolder = async (name: string) => {
    if (!user) return;
    const key = privateKey || userPrivateKey;
    if (!key) return;
    const parentId = contextFolder?.id ?? null;
    try {
      await createFolder(user.uid, name, parentId, key);
    } catch (error) {
      console.error('Create subfolder failed:', error);
    }
  };

  const handleShareFolder = async (recipients: string[]) => {
    if (!contextFolder?.id || !user) return;
    try {
      const { FolderSharingService } = await import('../services/folderSharing');
      await FolderSharingService.shareFolderWithUsers(contextFolder.id, user.uid, privateKey || '', recipients);
    } catch (error) {
      console.error('Share failed:', error);
    }
    setShareDialogOpen(false);
  };

  // ── Root "All Files" context menu handlers ────────────────────────────────

  const handleRootContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setFolderContextMenu(null);
    setContextFolder(null);
    setRootContextMenu({ mouseX: e.clientX, mouseY: e.clientY });
  };

  // ─────────────────────────────────────────────────────────────────────────

  // Helper function to handle navigation and close mobile drawer
  const handleNavigateAndClose = (path: string) => {
    navigate(path);
    if (isMobile) {
      handleDrawerToggle();
    }
  };

  // Helper function to preload route on hover
  const handlePreloadRoute = (path: string) => {
    // Preload the route by creating a prefetch link
    const routeMap: { [key: string]: () => Promise<unknown> } = {
      '/profile': () => import('../pages/ProfilePage'),
      '/contacts': () => import('../pages/ContactsPage'),
      '/templates': () => import('../pages/FormTemplatesPage'),
      '/cleanup': () => import('../pages/CleanupPage'),
      '/help': () => import('../pages/HelpPage'),
    };
    
    const preloadFn = routeMap[path];
    if (preloadFn) {
      preloadFn().catch(() => {
        // Silently fail - will load on click if preload fails
      });
    }
  };

  // Helper function for view navigation (home with query params)
  const handleViewNavigateAndClose = (path: string) => {
    navigate(path);
    if (isMobile) {
      handleDrawerToggle();
    }
  };

  // Handle folder clicks - reset all view states and set folder
  const handleFolderClick = (folderId: string | null) => {
    // Navigate to HomePage with folder parameter using client-side navigation
    const folderParam = folderId ? `?folder=${folderId}` : '';
    navigate(`/${folderParam}`, { replace: false });

    // Close mobile drawer if open
    if (isMobile) {
      handleDrawerToggle();
    }

    setIsRecentsView(false);
    setIsFavoritesView(false);
    setIsSharedView(false);
    setIsArchivedView(false);
    setSelectedDocType(null);
  };

  // Handle moving items (files or folders) to different folders
  const handleMoveItem = async (itemId: string, itemType: 'file' | 'folder', targetFolderId: string | null) => {
    if (!userId) return;
    
    try {
      console.log('🔄 SideNav handleMoveItem called:', { itemId, itemType, targetFolderId });
      
      if (itemType === 'folder') {
        console.log('📁 Updating folder parent...');
        await updateFolder(itemId, { parent: targetFolderId });
        console.log('✅ Folder moved successfully');
      } else if (itemType === 'file') {
        console.log('📄 Moving file for user...');
        // Use per-user folder management instead of updating parent directly
        const { moveFileForUser } = await import('../services/userFolderManagement');
        await moveFileForUser(itemId, userId, targetFolderId);
        console.log('✅ File moved successfully');
      } else {
        console.warn('❌ Unknown item type:', itemType);
      }
    } catch (error) {
      console.error('❌ Error moving item:', error);
      // You could add a toast notification here
    }
  };

  // Root folder drop handlers
  const handleRootDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsRootDropZone(true);
  };

  const handleRootDragLeave = (e: React.DragEvent) => {
    // Only set dragOver to false if we're actually leaving this element
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsRootDropZone(false);
    }
  };

  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsRootDropZone(false);
    
    console.log('🎯 Root folder drop event triggered');
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
      console.log('🎯 Moving to root folder (null parent)');
      
      if (handleMoveItem && data.id) {
        console.log('✅ Calling handleMoveItem with root target');
        handleMoveItem(data.id, data.type, null); // null = root folder
      } else {
        console.warn('❌ handleMoveItem not available or no item ID');
      }
    } catch (error) {
      console.error('❌ Error handling root drop:', error);
    }
  };

  // Archive drop handlers
  const handleArchiveDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsArchiveDropZone(true);
  };

  const handleArchiveDragLeave = (e: React.DragEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      setIsArchiveDropZone(false);
    }
  };

  const handleArchiveDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsArchiveDropZone(false);
    if (!user) return;
    try {
      const dragData = e.dataTransfer.getData('application/json');
      if (!dragData) return;
      const data = JSON.parse(dragData);
      if (!data.id) return;
      if (data.type === 'folder') {
        await archiveFolder(data.id, user.uid);
      } else if (data.type === 'file') {
        await archiveFile(data.id, user.uid);
      }
    } catch (error) {
      console.error('❌ Error archiving dropped item:', error);
    }
  };

  const collapsedWidth = 64;
  const currentWidth = collapsed && !isMobile ? collapsedWidth : drawerWidth;

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar sx={{ display: 'flex', justifyContent: collapsed && !isMobile ? 'center' : 'space-between' }}>
        {!collapsed && !isMobile && (
          <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main' }}>
            SeraVault
          </Typography>
        )}
        {!isMobile && onToggleCollapse && (
          <IconButton
            onClick={onToggleCollapse}
            size="small"
            sx={{ 
              color: 'text.secondary',
              '&:hover': { backgroundColor: 'action.hover' }
            }}
          >
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </IconButton>
        )}
      </Toolbar>
      
      {/* Quick Access Section */}
      {(!collapsed || isMobile) && (
        <Box sx={{ px: 2, pt: 1, pb: 1 }}>
          <Typography 
            variant="caption" 
            sx={{ 
              fontWeight: 600, 
              color: 'text.secondary',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
          >
            {t('navigation.quickAccess', 'Quick Access')}
          </Typography>
        </Box>
      )}
      
      <List dense sx={{ px: 1 }}>
        <ListItemButton 
          onClick={() => {
            handleViewNavigateAndClose('/');
            setCurrentFolder(null);
            setIsRecentsView(false);
            setIsFavoritesView(false);
            setIsSharedView(false);
            setIsArchivedView(false);
            setSelectedDocType(null);
          }}
          selected={!isRecentsView && !isFavoritesView && !isSharedView && !isArchivedView}
          sx={{
            borderRadius: 1,
            mx: 1,
            mb: 0.5,
            justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
            '&:hover': {
              backgroundColor: 'action.hover',
            }
          }}
          title={collapsed && !isMobile ? t('navigation.home') : undefined}
        >
          <ListItemIcon sx={{ minWidth: collapsed && !isMobile ? 'auto' : 32 }}>
            <Home fontSize="small" />
          </ListItemIcon>
          {(!collapsed || isMobile) && (
            <ListItemText 
              primary={t('navigation.home')} 
              primaryTypographyProps={{ fontSize: '14px' }}
            />
          )}
        </ListItemButton>
        
        <ListItemButton
          onClick={() => {
            handleViewNavigateAndClose('/?view=favorites');
            setCurrentFolder(null);
            setIsRecentsView(false);
            setIsFavoritesView(true);
            setIsSharedView(false);
            setIsArchivedView(false);
            setSelectedDocType(null);
          }}
          selected={isFavoritesView}
          sx={{
            borderRadius: 1,
            mx: 1,
            mb: 0.5,
            justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
            '&:hover': {
              backgroundColor: 'action.hover',
            }
          }}
          title={collapsed && !isMobile ? t('navigation.favorites', 'Favorites') : undefined}
        >
          <ListItemIcon sx={{ minWidth: collapsed && !isMobile ? 'auto' : 32 }}>
            <Star fontSize="small" />
          </ListItemIcon>
          {(!collapsed || isMobile) && (
            <ListItemText 
              primary={t('navigation.favorites', 'Favorites')} 
              primaryTypographyProps={{ fontSize: '14px' }}
            />
          )}
        </ListItemButton>
        
        <ListItemButton
          onClick={() => {
            handleViewNavigateAndClose('/?view=recents');
            setCurrentFolder(null);
            setIsRecentsView(true);
            setIsFavoritesView(false);
            setIsSharedView(false);
            setIsArchivedView(false);
            setSelectedDocType(null);
          }}
          selected={isRecentsView}
          sx={{
            borderRadius: 1,
            mx: 1,
            mb: 0.5,
            justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
            '&:hover': {
              backgroundColor: 'action.hover',
            }
          }}
          title={collapsed && !isMobile ? t('navigation.recent', 'Recent') : undefined}
        >
          <ListItemIcon sx={{ minWidth: collapsed && !isMobile ? 'auto' : 32 }}>
            <AccessTime fontSize="small" />
          </ListItemIcon>
          {(!collapsed || isMobile) && (
            <ListItemText 
              primary={t('navigation.recent', 'Recent')} 
              primaryTypographyProps={{ fontSize: '14px' }}
            />
          )}
        </ListItemButton>

        <ListItemButton
          onClick={() => handleNavigateAndClose('/contacts')}
          onMouseEnter={() => handlePreloadRoute('/contacts')}
          sx={{
            borderRadius: 1,
            mx: 1,
            mb: 0.5,
            justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
            '&:hover': { backgroundColor: 'action.hover' },
          }}
          title={collapsed && !isMobile ? t('navigation.contacts', 'Contacts') : undefined}
        >
          <ListItemIcon sx={{ minWidth: collapsed && !isMobile ? 'auto' : 32 }}>
            <People fontSize="small" />
          </ListItemIcon>
          {(!collapsed || isMobile) && (
            <ListItemText
              primary={t('navigation.contacts', 'Contacts')}
              primaryTypographyProps={{ fontSize: '14px' }}
            />
          )}
        </ListItemButton>
        
      </List>
      
      <Divider sx={{ mx: 2, my: 1 }} />
      
      <List dense sx={{ px: 1, flexGrow: 1 }}>
        {/* Library — static section header */}
        {(!collapsed || isMobile) && (
          <Box sx={{ px: 2, pt: 1, pb: 0.5 }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                color: 'text.secondary',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {t('navigation.library', 'Library')}
            </Typography>
          </Box>
        )}

        {/* Home sub-dropdown */}
        {(!collapsed || isMobile) && (
          <Box
            sx={{
              px: 2,
              py: 0.5,
              mx: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              borderRadius: 1,
              backgroundColor: isRootDropZone ? 'action.hover' : 'transparent',
              '&:hover': { backgroundColor: 'action.hover' },
              '&:hover .home-chevron': { opacity: 1 },
            }}
            onClick={() => {
              handleViewNavigateAndClose('/');
              setCurrentFolder(null);
              setIsRecentsView(false);
              setIsFavoritesView(false);
              setIsSharedView(false);
              setIsArchivedView(false);
              setSelectedDocType(null);
            }}
            onContextMenu={handleRootContextMenu}
            onDragOver={handleRootDragOver}
            onDragLeave={handleRootDragLeave}
            onDrop={handleRootDrop}
          >
            <Typography
              sx={{
                fontSize: '14px',
                fontWeight: 500,
                color: 'text.primary',
                userSelect: 'none',
                pl: 0.5,
              }}
            >
              {t('navigation.home')}
            </Typography>
            <Box
              component="span"
              onClick={(e) => { e.stopPropagation(); setFoldersOpen(prev => !prev); }}
              className="home-chevron"
              sx={{ display: hasSubFolders ? 'flex' : 'none', alignItems: 'center', color: 'text.disabled', opacity: 0.7, cursor: 'pointer', '&:hover': { opacity: 1, color: 'text.secondary' } }}
            >
              {foldersOpen ? <ExpandLess sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}
            </Box>
          </Box>
        )}

        <Collapse in={foldersOpen && !selectedDocType} timeout="auto" unmountOnExit>
          <Box sx={{ mx: 1 }}>
            <FolderTree
              folders={allFolders}
              onFolderClick={handleFolderClick}
              onMoveItem={handleMoveItem}
              onContextMenu={handleFolderContextMenu}
            />
          </Box>
        </Collapse>

        {(!collapsed || isMobile) && availableDocTypes.length > 0 && (
          <Divider sx={{ mx: 2, my: 1 }} />
        )}

        {/* By Type sub-dropdown */}
        {(!collapsed || isMobile) && availableDocTypes.length > 0 && (
          <>
            <Box
              sx={{
                px: 2,
                py: 0.5,
                mx: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                borderRadius: 1,
                '&:hover': { backgroundColor: 'action.hover' },
                '&:hover .bytype-chevron': { opacity: 1 },
              }}
              onClick={() => setDocTypeOpen(prev => !prev)}
            >
              <Typography
                sx={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'text.primary',
                  userSelect: 'none',
                  pl: 0.5,
                }}
              >
                {t('navigation.byType', 'By Type')}
              </Typography>
              {docTypeOpen
                ? <ExpandLess className="bytype-chevron" sx={{ fontSize: 16, color: 'text.disabled', opacity: 0.7 }} />
                : <ExpandMore className="bytype-chevron" sx={{ fontSize: 16, color: 'text.disabled', opacity: 0.7 }} />
              }
            </Box>

            <Collapse in={docTypeOpen} timeout="auto" unmountOnExit>
              <List dense sx={{ px: 1 }}>
                {availableDocTypes.map((dt) => (
                  <ListItemButton
                    key={dt.key}
                    selected={selectedDocType === dt.key}
                    onClick={() => {
                      const next = selectedDocType === dt.key ? null : dt.key;
                      setSelectedDocType(next);
                      navigate('/');
                      setCurrentFolder(null);
                      setIsRecentsView(false);
                      setIsFavoritesView(false);
                      setIsSharedView(false);
                      setIsArchivedView(false);
                      if (isMobile) handleDrawerToggle();
                    }}
                    sx={{
                      borderRadius: 1,
                      mx: 1,
                      mb: 0,
                      py: 0.25,
                      minHeight: 32,
                      '&:hover': { backgroundColor: 'action.hover' },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 28 }}>{dt.icon}</ListItemIcon>
                    <ListItemText
                      primary={dt.label}
                      primaryTypographyProps={{ fontSize: '13px', fontWeight: 400, lineHeight: 1.2 }}
                    />
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.disabled',
                        fontSize: '11px',
                        fontWeight: 500,
                        minWidth: 16,
                        textAlign: 'right',
                      }}
                    >
                      {dt.count}
                    </Typography>
                  </ListItemButton>
                ))}
              </List>
            </Collapse>
          </>
        )}

        {hasArchivedItems && <Divider sx={{ mx: 2, my: 1 }} />}

        {hasArchivedItems && <ListItemButton
          onClick={() => {
            handleViewNavigateAndClose('/?view=archive');
            setCurrentFolder(null);
            setIsRecentsView(false);
            setIsFavoritesView(false);
            setIsSharedView(false);
            setIsArchivedView(true);
            setSelectedDocType(null);
          }}
          onDragOver={handleArchiveDragOver}
          onDragLeave={handleArchiveDragLeave}
          onDrop={handleArchiveDrop}
          selected={isArchivedView}
          sx={{
            borderRadius: 1,
            mx: 1,
            mb: 0.5,
            backgroundColor: isArchiveDropZone ? 'warning.light' : 'transparent',
            border: isArchiveDropZone ? '2px dashed' : '2px solid transparent',
            borderColor: isArchiveDropZone ? 'warning.main' : 'transparent',
            '&:hover': {
              backgroundColor: isArchiveDropZone ? 'warning.light' : 'action.hover',
            }
          }}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <Archive fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary={t('navigation.archive', 'Archive')}
            primaryTypographyProps={{ fontSize: '14px' }}
          />
        </ListItemButton>}

        <Divider sx={{ mx: 2, my: 1 }} />

        {(!collapsed || isMobile) && (
          <Box sx={{ px: 2, pt: 1, pb: 0.5 }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                color: 'text.secondary',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {t('navigation.more', 'More')}
            </Typography>
          </Box>
        )}

        <ListItemButton
          onClick={() => handleNavigateAndClose('/help')}
          onMouseEnter={() => handlePreloadRoute('/help')}
          sx={{
            borderRadius: 1,
            mx: 1,
            mb: 0.5,
            justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
            '&:hover': {
              backgroundColor: 'action.hover',
            }
          }}
          title={collapsed && !isMobile ? t('navigation.help', 'Help') : undefined}
        >
          <ListItemIcon sx={{ minWidth: collapsed && !isMobile ? 'auto' : 32 }}>
            <HelpOutline fontSize="small" />
          </ListItemIcon>
          {(!collapsed || isMobile) && (
            <ListItemText 
              primary={t('navigation.help', 'Help') } 
              primaryTypographyProps={{ fontSize: '14px' }}
            />
          )}
        </ListItemButton>

        <ListItemButton
          onClick={() => handleNavigateAndClose('/support')}
          onMouseEnter={() => handlePreloadRoute('/support')}
          sx={{
            borderRadius: 1,
            mx: 1,
            mb: 0.5,
            justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
            '&:hover': {
              backgroundColor: 'action.hover',
            }
          }}
          title={collapsed && !isMobile ? t('navigation.support', 'Support') : undefined}
        >
          <ListItemIcon sx={{ minWidth: collapsed && !isMobile ? 'auto' : 32 }}>
            <Email fontSize="small" />
          </ListItemIcon>
          {(!collapsed || isMobile) && (
            <ListItemText 
              primary={t('navigation.support', 'Support') } 
              primaryTypographyProps={{ fontSize: '14px' }}
            />
          )}
        </ListItemButton>

      </List>
      
      {/* Storage Info */}
      {(!collapsed || isMobile) && (
        <Box sx={{ px: 2, py: 1, borderTop: 1, borderColor: 'divider' }}>
          <Box
            sx={{ display: 'flex', alignItems: 'center', mb: 1, cursor: 'pointer' }}
            onClick={() => {
              refreshStorage();
            }}
          >
            <CloudSync
              fontSize="small"
              sx={{
                mr: 1,
                color: storageLoading ? 'primary.main' : 'text.secondary',
                animation: storageLoading ? 'spin 1s linear infinite' : 'none',
                '@keyframes spin': {
                  '0%': { transform: 'rotate(0deg)' },
                  '100%': { transform: 'rotate(360deg)' }
                }
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
              {storageLoading ? (
                t('storage.calculating', 'Calculating...')
              ) : storageUsage ? (
                <>
                  {storageUsage.usedFormatted}
                  {' used'}
                </>
              ) : (
                <>
                  {t('storage.clickToCalculate', 'Click to calculate')}
                </>
              )}
            </Typography>
          </Box>
        </Box>
      )}
      {/* Sidebar folder context menu */}
      <FolderContextMenu
        open={!!folderContextMenu}
        mouseX={folderContextMenu?.mouseX ?? 0}
        mouseY={folderContextMenu?.mouseY ?? 0}
        onClose={() => setFolderContextMenu(null)}
        onOpen={handleContextOpen}
        onNewSubfolder={handleContextNewSubfolder}
        onRename={handleContextRename}
        onCut={handleContextCut}
        onCopy={handleContextCopy}
        onPaste={handleContextPaste}
        onShare={handleContextShare}
        onArchive={handleContextArchive}
        onRestore={handleContextRestore}
        onDelete={handleContextDelete}
        isArchiveView={isArchivedView}
        canPaste={clipboardItems.length > 0}
      />

      {/* Rename dialog */}
      <RenameDialog
        open={renameDialogOpen}
        onClose={() => { setRenameDialogOpen(false); setFolderContextMenu(null); setContextFolder(null); }}
        onRename={handleDoRename}
        currentName={typeof contextFolder?.name === 'string' ? contextFolder.name : ''}
        itemType="folder"
      />

      {/* New subfolder dialog */}
      <NewFolderDialog
        open={newSubfolderDialogOpen}
        onClose={() => { setNewSubfolderDialogOpen(false); setFolderContextMenu(null); setContextFolder(null); }}
        onCreate={handleCreateSubfolder}
      />

      {/* Share dialog */}
      <ShareDialog
        open={shareDialogOpen}
        onClose={() => { setShareDialogOpen(false); setFolderContextMenu(null); setContextFolder(null); }}
        onShare={handleShareFolder}
        itemType="folder"
        itemName={typeof contextFolder?.name === 'string' ? contextFolder.name : ''}
        currentSharedWith={contextFolder?.sharedWith ?? []}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => { setDeleteConfirmOpen(false); setFolderContextMenu(null); setContextFolder(null); }}>
        <DialogTitle>Delete Folder</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete &ldquo;{typeof contextFolder?.name === 'string' ? contextFolder.name : 'this folder'}&rdquo;? This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteConfirmOpen(false); setFolderContextMenu(null); setContextFolder(null); }}>Cancel</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Root "All Files" context menu */}
      <Menu
        open={!!rootContextMenu}
        onClose={() => setRootContextMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={rootContextMenu ? { top: rootContextMenu.mouseY, left: rootContextMenu.mouseX } : undefined}
      >
        <MenuItem onClick={() => { setRootContextMenu(null); setNewSubfolderDialogOpen(true); }}>
          <CreateNewFolder sx={{ mr: 1, fontSize: 20 }} />
          New Folder
        </MenuItem>
        <MenuItem onClick={() => { setRootContextMenu(null); onUpload?.(); }}>
          <Upload sx={{ mr: 1, fontSize: 20 }} />
          Upload Files
        </MenuItem>
        <MenuItem onClick={() => { setRootContextMenu(null); onNewForm?.(); }}>
          <Description sx={{ mr: 1, fontSize: 20 }} />
          New Form
        </MenuItem>
        <MenuItem onClick={() => { setRootContextMenu(null); onNewChat?.(); }}>
          <Chat sx={{ mr: 1, fontSize: 20 }} />
          New Chat
        </MenuItem>
        <MenuItem
          onClick={() => { setRootContextMenu(null); handleContextPaste(); }}
          disabled={clipboardItems.length === 0}
        >
          <ContentPaste sx={{ mr: 1, fontSize: 20 }} />
          Paste
        </MenuItem>
      </Menu>
    </Box>
  );

  // For desktop, we need to conditionally render or hide the drawer
  if (!isMobile && !desktopOpen) {
    return null; // Hide drawer completely on desktop when hamburger is closed
  }

  return (
    <Drawer
      variant={isMobile ? 'temporary' : 'permanent'}
      open={isMobile ? mobileOpen : true}
      onClose={handleDrawerToggle}
      sx={{
        width: currentWidth,
        flexShrink: 0,
        transition: theme.transitions.create('width', {
          easing: theme.transitions.easing.sharp,
          duration: theme.transitions.duration.enteringScreen,
        }),
        [`& .MuiDrawer-paper`]: { 
          width: currentWidth, 
          boxSizing: 'border-box',
          position: isMobile ? 'fixed' : 'relative',
          height: '100%',
          borderRight: 1,
          borderColor: 'divider',
          backgroundColor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
          overflowX: 'hidden',
          transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
          zIndex: isMobile ? theme.zIndex.drawer : 'auto',
        },
      }}
    >
      {drawerContent}
    </Drawer>
  );
};

export default SideNav;
