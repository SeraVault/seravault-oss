// @ts-nocheck
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { useClipboard } from '../context/ClipboardContext';
import { useContentActions } from '../context/ContentActionsContext';
import { useGlobalLoading } from '../context/LoadingContext';
import { useRecents } from '../context/RecentsContext';
import { useFolders } from '../hooks/useFolders';
import { useGlobalFileIndex } from '../hooks/useGlobalFileIndex';
import { type FileData } from '../files';
import { type Folder as FolderData } from '../firestore';
import React, { useState, useEffect, useMemo, forwardRef, useImperativeHandle, lazy, Suspense } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import AccessTime from '@mui/icons-material/AccessTime';
import Star from '@mui/icons-material/Star';
import Share from '@mui/icons-material/Share';
import ContentPaste from '@mui/icons-material/ContentPaste';
import ContentCopy from '@mui/icons-material/ContentCopy';
import ContentCut from '@mui/icons-material/ContentCut';
import Delete from '@mui/icons-material/Delete';
import Clear from '@mui/icons-material/Clear';
import LockOutlined from '@mui/icons-material/LockOutlined';
import HelpOutline from '@mui/icons-material/HelpOutline';
import { isFormFile, type SecureFormData, getFormTypeFromFilename } from '../utils/formFiles';
import { FileAccessService } from '../services/fileAccess';
import { FileOperationsService } from '../services/fileOperations';
import { backendService } from '../backend/BackendService';
import { deleteFile } from '../files';
import { getUserPublicProfile, getUserByEmail, deleteFolder, createFolder, updateFolder, renameFolderWithEncryption } from '../firestore';
import { metadataCache, getOrDecryptMetadata } from '../services/metadataCache';

// New components
import FileUploadArea from './FileUploadArea';
import SearchBar from './SearchBar';
import DeepSearchIndexer from './DeepSearchIndexer';
import FileTable from './FileTable';
import { EmptyState } from './EmptyState';

// Existing dialogs
import NewFolderDialog from './NewFolderDialog';
import ShareDialog from './ShareDialog';
import ContextMenu from './ContextMenu';
import RenameDialog from './RenameDialog';
import MobileActionMenu from './MobileActionMenu';
import FileInfoDialog from './FileInfoDialog';
import CreationFAB from './CreationFAB';
import ContactSelector from './ContactSelector';

// Lazy load heavy components
const FormFileViewer = lazy(() => import('./FormFileViewer'));
const FormInstanceFiller = lazy(() => import('./FormInstanceFiller'));
const FormBuilder = lazy(() => import('./FormBuilder'));
const FileViewer = lazy(() => import('./FileViewer'));
const ChatViewer = lazy(() => import('./ChatViewer'));

interface MainContentProps {
  currentFolder: string | null;
  setCurrentFolder: (folderId: string | null) => void;
  // Tag filtering props (received from HomePage, used for filtering)
  selectedTags?: string[];
  onTagSelectionChange?: (tags: string[]) => void;
  matchAllTags?: boolean;
  onMatchModeChange?: (matchAll: boolean) => void;
  onFilesChange?: (files: FileData[]) => void;
  // File opening from notification
  fileIdToOpen?: string | null;
  onFileOpened?: () => void;
}

interface MainContentRef {
}


const MainContentComponent = (props: MainContentProps, ref: React.Ref<MainContentRef>) => {
  const { 
    currentFolder, 
    setCurrentFolder, 
    selectedTags = [],
    onFilesChange,
    fileIdToOpen,
    onFileOpened
  } = props;
  const { t } = useTranslation();
  const { user } = useAuth();
  const { privateKey, requestUnlock } = usePassphrase();
  const navigate = useNavigate();
  const { 
    clipboardItem, 
    clipboardItems, 
    hasMultipleItems, 
    cutItem, 
    copyItem, 
    cutItems, 
    copyItems, 
    clearClipboard 
  } = useClipboard();
  const { isDataLoading, setIsDataLoading } = useGlobalLoading();
  const {
    isRecentsView,
    isFavoritesView,
    isSharedView,
    isArchivedView,
    addRecentItem,
    recentItems,
    clearRecents,
    selectedDocType,
    setSelectedDocType,
  } = useRecents();
  const { getFoldersByParent, buildFolderPath, allFolders } = useFolders();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { 
    entries: globalFileIndex, 
    deepIndexProgress, 
    startDeepIndexing,
    indexSingleForm,
    hasDeepIndex 
  } = useGlobalFileIndex();

  // State management
  const [files, setFiles] = useState<FileData[]>([]);
  const [allArchivedFiles, setAllArchivedFiles] = useState<FileData[]>([]);
  const [allArchivedFolders, setAllArchivedFolders] = useState<FolderData[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredFiles, setFilteredFiles] = useState<FileData[]>([]);

  // Clear search when the user navigates to a different section or folder
  useEffect(() => {
    setSearchQuery('');
  }, [currentFolder, isRecentsView, isFavoritesView, isSharedView, isArchivedView, selectedDocType]);
  const [globalSearchResults, setGlobalSearchResults] = useState<FileData[] | null>(null);
  const globalIndexMap = useMemo(() => {
    const map = new Map<string, (typeof globalFileIndex)[number]>();
    globalFileIndex.forEach((entry) => map.set(entry.fileId, entry));
    return map;
  }, [globalFileIndex]);
  
  // Bulk selection state
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  // Dialog states
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [fileToShare, setFileToShare] = useState<FileData | null>(null);
  const [folderToShare, setFolderToShare] = useState<FolderData | null>(null);
  const [shareItemType, setShareItemType] = useState<'file' | 'folder'>('file');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [singleDeleteConfirmOpen, setSingleDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ item: FileData | FolderData; type: 'file' | 'folder' } | null>(null);
  const [copyOptionsOpen, setCopyOptionsOpen] = useState(false);
  const [itemToCopy, setItemToCopy] = useState<{ item: FileData | FolderData; type: 'file' | 'folder' } | null>(null);
  const [preserveSharing, setPreserveSharing] = useState(false);
  
  // New chat dialog state
  const [newChatDialogOpen, setNewChatDialogOpen] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [hasContacts, setHasContacts] = useState(false);
  



  // Background (canvas) context menu

  // Context menu and mobile action menu
  const [contextMenu, setContextMenu] = useState<{ 
    mouseX: number; 
    mouseY: number; 
    item: FileData | FolderData; 
    type: 'file' | 'folder' 
  } | null>(null);
  const [mobileActionMenu, setMobileActionMenu] = useState<{ 
    open: boolean; 
    item: FileData | FolderData | null; 
    type: 'file' | 'folder' 
  }>({ open: false, item: null, type: 'file' });
  const [fileInfoDialog, setFileInfoDialog] = useState<{
    open: boolean;
    item: FileData | FolderData | null;
    type: 'file' | 'folder';
  }>({ open: false, item: null, type: 'file' });
  const [renameDialog, setRenameDialog] = useState<{ 
    open: boolean; 
    item: FileData | FolderData | null; 
    type: 'file' | 'folder';
    currentName: string;
  }>({ open: false, item: null, type: 'file', currentName: '' });
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [archiveHelpOpen, setArchiveHelpOpen] = useState(false);

  // Session timeout cleanup
  useEffect(() => {
    const handleSessionTimeout = () => {
      // Clear all decrypted file data
      setFiles([]);
      setFilteredFiles([]);
      // TODO: Clear metadata cache since user session is ending
      // metadataCache.clear();
      // Close any open viewers/dialogs
      setFileViewerOpen(false);
      setSelectedFile(null);
      setFileContent(null);
      setFormViewerOpen(false);
      setSelectedFormFile(null);
      setFormEditorOpen(false);
      setFormFillerOpen(false);
      setSelectedFormData(null);
      // setIsEditingForm(false); // Removed unused state
      // Close any open dialogs
      setNewFolderDialogOpen(false);
      setFormBuilderOpen(false);
      setShareDialogOpen(false);
      setFileToShare(null);
      setFolderToShare(null);
      setRenameDialog({ open: false, item: null, type: 'file', currentName: '' });
      setMobileActionMenu({ open: false, item: null, type: 'file' });
      setContextMenu(null);
      // Clear search
      setSearchQuery('');
    };

    // Listen for session timeout events
    window.addEventListener('sessionTimeout', handleSessionTimeout as EventListener);

    return () => {
      window.removeEventListener('sessionTimeout', handleSessionTimeout as EventListener);
    };
  }, []);

  // Handle back button on mobile - prevent accidental logout


  // Form-related state
  const [formBuilderOpen, setFormBuilderOpen] = useState(false);
  const [formEditorOpen, setFormEditorOpen] = useState(false);
  const [unsavedFormData, setUnsavedFormData] = useState<SecureFormData | null>(null);
  const [formViewerOpen, setFormViewerOpen] = useState(false);
  const [formFillerOpen, setFormFillerOpen] = useState(false);
  
  // Handle URL query params for creating forms from templates
  const [searchParams, setSearchParams] = useSearchParams();
  
  useEffect(() => {
    const createFormTemplate = searchParams.get('createForm');
    if (createFormTemplate) {
      // Open form builder with template pre-selected
      setFormBuilderOpen(true);
      // Remove the query param
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Handle URL query params for opening chat from notifications
  useEffect(() => {
    const chatId = searchParams.get('chat');
    if (chatId) {
      // Open chat viewer with the specified conversation
      setSelectedConversationId(chatId);
      setChatViewerOpen(true);
      // Remove the query param
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Expose methods to parent component via ref
  useImperativeHandle(ref, () => ({}));
  const [selectedFormFile, setSelectedFormFile] = useState<FileData | null>(null);
  const [selectedFormData, setSelectedFormData] = useState<any>(null);
  const [isEditingForm, setIsEditingForm] = useState(false);

  // File viewer state
  const [fileViewerOpen, setFileViewerOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileData | null>(null);
  const [fileContent, setFileContent] = useState<ArrayBuffer | null>(null);
  const [fileContentLoading, setFileContentLoading] = useState(false);
  
  // Chat viewer state
  const [chatViewerOpen, setChatViewerOpen] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  // Get folders for current directory from shared hook
  const folders = getFoldersByParent(currentFolder);
  const breadcrumbs = buildFolderPath(currentFolder);

  // Check if user has contacts
  useEffect(() => {
    if (!user) {
      setHasContacts(false);
      return;
    }

    let unsubscribe: (() => void) | undefined;

    const setupContactsListener = async () => {
      try {
        const { ContactService } = await import('../services/contactService');
        // Use realtime subscription instead of one-time fetch
        unsubscribe = ContactService.subscribeToContacts(
          user.uid,
          (contacts) => {
            setHasContacts(contacts.length > 0);
          }
        );
      } catch (error) {
        console.error('Error setting up contacts listener:', error);
        setHasContacts(false);
      }
    };

    setupContactsListener();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  // Filter folders based on search - only search in current folder
  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) {
      return folders;
    }
    // When searching, only show folders in the current folder that match
    return folders.filter(folder => {
      const folderName = typeof folder.name === 'string' ? folder.name.toLowerCase() : '';
      return folderName.includes(searchQuery.toLowerCase());
    });
  }, [folders, searchQuery]);

  // Derive current-level folders and files from the full archived set, respecting folder navigation
  const archivedFolders = useMemo(() => {
    if (!isArchivedView) return [];
    const archivedFolderIds = new Set(allArchivedFolders.map(f => f.id));
    if (currentFolder === null) {
      // At archive root: show only top-level archived folders
      // (those whose parent is not itself an archived folder)
      return allArchivedFolders.filter(f => !f.parent || !archivedFolderIds.has(f.parent));
    }
    // Inside a folder: show sub-folders of currentFolder
    return allArchivedFolders.filter(f => f.parent === currentFolder);
  }, [isArchivedView, allArchivedFolders, currentFolder]);

  const archivedFiles = useMemo(() => {
    if (!isArchivedView) return [];
    const archivedFolderIds = new Set(allArchivedFolders.map(f => f.id));
    return allArchivedFiles.filter(f => {
      const folderForUser = f.userFolders?.[user?.uid ?? ''] ?? f.parent ?? null;
      if (currentFolder === null) {
        // At archive root: show files not inside any archived folder
        return !folderForUser || !archivedFolderIds.has(folderForUser);
      }
      return folderForUser === currentFolder;
    });
  }, [isArchivedView, allArchivedFiles, allArchivedFolders, currentFolder, user?.uid]);

  // Build global search results from the preloaded index for recursive searches
  useEffect(() => {
    if (!searchQuery.trim()) {
      setGlobalSearchResults(null);
      return;
    }

    const normalized = searchQuery.toLowerCase();
    const results = globalFileIndex
      .filter((entry) => {
        if (entry.searchableName.includes(normalized)) {
          return true;
        }
        if (entry.searchableTags.some((tag) => tag.includes(normalized))) {
          return true;
        }
        if (entry.searchableFormText && entry.searchableFormText.includes(normalized)) {
          return true;
        }
        return false;
      })
      .map((entry) => {
        const resultFile = { ...entry.indexedFile } as FileData & { searchMatchFolderId?: string | null };
        (resultFile as any).searchMatchFolderId = entry.folderId ?? null;
        return resultFile;
      });

    setGlobalSearchResults(results);
  }, [searchQuery, globalFileIndex]);

  // Debounced search and filtering with cached metadata
  useEffect(() => {
    let isMounted = true;

    const updateFilteredFiles = async () => {
      try {
        const hasSearchQuery = Boolean(searchQuery.trim());
        const hasTagFilters = selectedTags.length > 0;
        const searchTerm = searchQuery.toLowerCase();

        // Local (current folder) search fallback while the global index loads
        let localSearchResult = files;
        if (hasSearchQuery) {
          localSearchResult = files.filter((file) => {
            const fileName = typeof file.name === 'string' ? file.name.toLowerCase() : '';
            if (fileName.includes(searchTerm)) {
              return true;
            }

            const cached = metadataCache.get(file.id!);
            if (cached && 'tags' in cached && cached.tags) {
              return cached.tags.some((tag: string) => tag.toLowerCase().includes(searchTerm));
            }

            return false;
          });
        }

        let result: FileData[];

        if (hasSearchQuery) {
          result = globalSearchResults ?? localSearchResult;
        } else if (hasTagFilters && globalFileIndex.length > 0) {
          result = globalFileIndex.map((entry) => entry.indexedFile);
        } else {
          result = localSearchResult;
        }

        if (hasTagFilters && user?.uid && privateKey) {
          const normalizedSelectedTags = selectedTags.map(tag => tag.toLowerCase());
          result = result.filter(file => {
            const fromIndex = file.id ? globalIndexMap.get(file.id) : undefined;
            if (fromIndex) {
              return normalizedSelectedTags.some(tag => fromIndex.searchableTags.includes(tag));
            }

            const cached = metadataCache.get(file.id!);
            if (cached && 'tags' in cached && cached.tags.length > 0) {
              const normalizedFileTags = cached.tags.map((tag: string) => tag.toLowerCase());
              return normalizedSelectedTags.some(tag => normalizedFileTags.includes(tag));
            }
            return false;
          });
        }

        // Apply document type filter from sidebar
        if (selectedDocType) {
          result = result.filter(file => {
            if (selectedDocType === 'chat') {
              return (file as any).fileType === 'chat';
            }
            if (selectedDocType === 'file') {
              const name = typeof file.name === 'string' ? file.name : '';
              return (file as any).fileType !== 'chat' && !isFormFile(name);
            }
            // Form sub-type
            const name = typeof file.name === 'string' ? file.name : '';
            if (!isFormFile(name)) return false;
            const formType = getFormTypeFromFilename(name) ?? 'custom';
            return formType === selectedDocType;
          });
        }

        if (isMounted) {
          setFilteredFiles(result);
        }
      } catch (error) {
        console.error('Filtering error:', error);
        if (isMounted) {
          setFilteredFiles([]);
        }
      }
    };

    updateFilteredFiles();

    return () => {
      isMounted = false;
    };
  }, [files, searchQuery, selectedTags, selectedDocType, user?.uid, privateKey, globalSearchResults, globalFileIndex, globalIndexMap]);

  // Notify parent layout when file list changes (for sidebar filtering)
  useEffect(() => {
    onFilesChange?.(files);
  }, [files, onFilesChange]);

  // Cleanup long press timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
      }
    };
  }, [longPressTimer]);

  // Bulk selection handlers
  const toggleFolderSelection = (folderId: string) => {
    setSelectedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  const selectAllFolders = () => {
    const currentFolders = getFoldersByParent(currentFolder);
    setSelectedFolders(new Set(currentFolders.map(f => f.id!)));
  };

  const clearAllSelections = () => {
    setSelectedFolders(new Set());
    setSelectedFiles(new Set());
  };

  const selectAll = () => {
    const currentFolders = getFoldersByParent(currentFolder);
    setSelectedFolders(new Set(currentFolders.map(f => f.id!)));
    setSelectedFiles(new Set(filteredFiles.map(f => f.id!)));
  };

  // Bulk operations
  const showDeleteConfirmation = () => {
    const totalItems = selectedFolders.size + selectedFiles.size;
    if (!user || totalItems === 0) return;
    setDeleteConfirmOpen(true);
  };

  const confirmBulkDelete = async () => {
    setDeleteConfirmOpen(false);
    const totalItems = selectedFolders.size + selectedFiles.size;

    try {
      const promises = [];
      
      // Delete folders
      if (selectedFolders.size > 0) {
        const { deleteFolder } = await import('../firestore');
        const folderPromises = Array.from(selectedFolders).map((folderId) => 
          deleteFolder(folderId)
        );
        promises.push(...folderPromises);
      }

      // Handle files - delete owned files, unshare shared files
      if (selectedFiles.size > 0) {
        const selectedFilesList = Array.from(selectedFiles).map(fileId =>
          files.find(f => f.id === fileId)
        ).filter(Boolean) as FileData[];

        // Separate owned files from shared files
        const ownedFiles = selectedFilesList.filter(file => file.owner === user.uid);
        const sharedFiles = selectedFilesList.filter(file => file.owner !== user.uid);

        console.log(`🗑️ Bulk operation: ${ownedFiles.length} owned files to delete, ${sharedFiles.length} shared files to unshare`);

        // Delete owned files completely
        if (ownedFiles.length > 0) {
          const deletePromises = ownedFiles.map(file => deleteFile(file.id!, user.uid, privateKey));
          promises.push(...deletePromises);
        }

        // Unshare shared files (remove user from sharedWith)
        if (sharedFiles.length > 0) {
          const { ChatService } = await import('../services/chatService');
          const unsharePromises = sharedFiles.map(file =>
            file.fileType === 'chat'
              ? ChatService.leaveConversation(file.id!, user.uid)
              : backendService.files.update(file.id!, {
                  sharedWith: file.sharedWith.filter(uid => uid !== user.uid)
                })
          );
          promises.push(...unsharePromises);
        }
      }

      await Promise.all(promises);
      
      // Immediately update local state to reflect the deletions
      if (selectedFiles.size > 0) {
        setFiles(prevFiles => prevFiles.filter(file => !selectedFiles.has(file.id!)));
        setFilteredFiles(prevFiles => prevFiles.filter(file => !selectedFiles.has(file.id!)));
      }
      
      // Clear selections after successful deletion
      clearAllSelections();
      
      
    } catch (error) {
      console.error('Error deleting items:', error);
    }
  };

  const showSingleDeleteConfirmation = (item: FileData | FolderData, type: 'file' | 'folder') => {
    setItemToDelete({ item, type });
    setSingleDeleteConfirmOpen(true);
  };

  const confirmSingleDelete = async () => {
    if (!itemToDelete || !user || !privateKey) return;

    setSingleDeleteConfirmOpen(false);

    try {
      if (itemToDelete.type === 'file') {
        const file = itemToDelete.item as FileData;

        if (file.owner === user.uid) {
          // User owns the file - delete completely
          console.log('🗑️ Deleting owned file:', file.id);
          await deleteFile(file.id!, user.uid, privateKey);
        } else {
          // User doesn't own the file - remove self from sharing
          console.log('📤 Removing self from shared file:', file.id);

          if (file.fileType === 'chat') {
            const { ChatService } = await import('../services/chatService');
            await ChatService.leaveConversation(file.id!, user.uid);
          } else {
            await backendService.files.update(file.id!, {
              sharedWith: file.sharedWith.filter(uid => uid !== user.uid)
            });
          }
        }
      } else {
        // Folders are always owned by the user, so delete completely
        await deleteFolder(itemToDelete.item.id!);
      }

      // Update archive state immediately if in archive view (no real-time listener there)
      if (isArchivedView) {
        if (itemToDelete.type === 'file') {
          setAllArchivedFiles(prev => prev.filter(f => f.id !== itemToDelete.item.id));
        } else {
          // Collect folder and all its descendants so their files are also removed
          const removeIds = new Set<string>();
          const collectDescendants = (id: string) => {
            removeIds.add(id);
            allArchivedFolders.forEach(f => { if (f.parent === id) collectDescendants(f.id!); });
          };
          collectDescendants(itemToDelete.item.id!);
          setAllArchivedFolders(prev => prev.filter(f => !removeIds.has(f.id!)));
          setAllArchivedFiles(prev => prev.filter(f => {
            const folderId = f.userFolders?.[user.uid] ?? f.parent ?? null;
            return !folderId || !removeIds.has(folderId);
          }));
        }
      }

      // Clear any open menus
      setContextMenu(null);
      setMobileActionMenu({ open: false, item: null, type: 'file' });

    } catch (error) {
      console.error('Delete operation failed:', error);
    } finally {
      setItemToDelete(null);
    }
  };

  const bulkUnshare = async () => {
    const totalFiles = selectedFiles.size;
    if (!user || totalFiles === 0) return;

    // Unshare all selected files

    try {
      const { backendService } = await import('../backend/BackendService');
      
      const unsharePromises = Array.from(selectedFiles).map((fileId) => 
        backendService.documents.update('files', fileId, {
          sharedWith: [user.uid] // Only keep owner access
        })
      );

      await Promise.all(unsharePromises);
      clearAllSelections();
    } catch (error) {
      console.error('Error unsharing files:', error);
    }
  };

  const bulkShare = async () => {
    const totalItems = selectedFiles.size + selectedFolders.size;
    if (totalItems === 0) return;

    // For now, open sharing dialog for the first selected file with a note about bulk sharing
    // TODO: Implement true bulk sharing that shares all selected files with the same recipients
    if (selectedFiles.size > 0) {
      const firstFile = files.find(f => selectedFiles.has(f.id));
      if (firstFile) {
        setFileToShare(firstFile);
        setFolderToShare(null);
        setShareItemType('file');
        setShareDialogOpen(true);
      }
    } else if (selectedFolders.size > 0) {
      const firstFolder = folders.find(f => selectedFolders.has(f.id));
      if (firstFolder) {
        setFolderToShare(firstFolder);
        setFileToShare(null);
        setShareItemType('folder');
        setShareDialogOpen(true);
      }
    }
  };

  // True bulk sharing function that shares all selected files with the same recipients
  const bulkShareFiles = async (recipients: string[]) => {
    if (!user || !privateKey || selectedFiles.size === 0 || recipients.length === 0) {
      console.error('Missing required parameters for bulk sharing:', { 
        user: !!user, 
        privateKey: !!privateKey, 
        selectedFiles: selectedFiles.size, 
        recipients 
      });
      return;
    }

    const selectedFilesList = Array.from(selectedFiles).map(fileId => 
      files.find(f => f.id === fileId)
    ).filter(Boolean) as FileData[];

    let successCount = 0;
    let errorCount = 0;

    try {
      // Process recipients to validate and convert email/userID to user IDs (same logic as handleShareFile)
      const recipientUserIds: string[] = [];

      for (const recipient of recipients) {
        try {
          let userProfile;
          let userId;
          
          // Check if recipient looks like a user ID (not an email)
          const isUserId = !recipient.includes('@');
          
          if (isUserId) {
            console.log(`🔍 Looking up user by ID: ${recipient}`);
            userProfile = await getUserPublicProfile(recipient);
            userId = recipient;
            
            if (!userProfile) {
              console.warn(`❌ User ${recipient} not found in database`);
              continue;
            }
            console.log(`✅ Found user ${recipient} with profile:`, userProfile.displayName);
          } else {
            console.log(`🔍 Looking up user by email: ${recipient}`);
            const userWithProfile = await getUserByEmail(recipient);
            
            if (!userWithProfile) {
              console.warn(`❌ User ${recipient} not found in database`);
              continue;
            }
            
            userProfile = userWithProfile.profile;
            userId = userWithProfile.id;
            console.log(`✅ Found user ${recipient} with ID: ${userId}`);
          }
          
          if (!userProfile.publicKey) {
            console.warn(`User ${recipient} does not have a public key`);
            continue;
          }

          recipientUserIds.push(userId);
        } catch (error) {
          console.error(`Error processing recipient ${recipient}:`, error);
        }
      }

      if (recipientUserIds.length === 0) {
        console.warn('No valid recipients found for bulk sharing');
        return;
      }

      console.log(`📤 Bulk sharing with ${selectedFilesList.length} files to user IDs:`, recipientUserIds);

      // Share each selected file with all recipients using the same service as individual sharing
      for (const file of selectedFilesList) {
        try {
          // Filter out recipients who already have access to this file
          const newRecipients = recipientUserIds.filter(userId => !file.sharedWith.includes(userId));
          
          if (newRecipients.length === 0) {
            console.log(`File ${file.name} already shared with all recipients, skipping`);
            continue;
          }

          // Use the centralized FileOperationsService to share the file (same as individual sharing)
          await FileOperationsService.shareFileWithUsers(
            file,
            user.uid,
            privateKey,
            newRecipients
          );
          
          successCount++;
          console.log(`✅ Successfully shared file: ${file.name}`);
        } catch (error) {
          console.error(`❌ Error sharing file ${file.name}:`, error);
          errorCount++;
        }
      }

      console.log(`🎉 Bulk sharing completed: ${successCount} files shared, ${errorCount} errors`);
      
      // Clear selections after successful bulk operation
      if (successCount > 0) {
        setSelectedFiles(new Set());
        setShareDialogOpen(false);
      }
      
    } catch (error) {
      console.error('Failed to bulk share files:', error);
    }
  };

  const bulkCopy = () => {
    const totalItems = selectedFiles.size + selectedFolders.size;
    if (totalItems === 0) return;

    // Collect all selected items for bulk copy
    const itemsToCopy: Array<{ type: 'file' | 'folder', item: FileData | FolderData }> = [];
    let skippedChatCount = 0;
    
    // Add selected files (excluding chat files)
    Array.from(selectedFiles).forEach(fileId => {
      const file = files.find(f => f.id === fileId);
      if (file) {
        // Skip chat files - they can't be copied, only moved
        const isChatFile = (file as any).fileType === 'chat';
        const isAttachment = (file as any).fileType === 'attachment';
        if (isChatFile || isAttachment) {
          skippedChatCount++;
          return;
        }
        itemsToCopy.push({ type: 'file', item: file });
      }
    });
    
    // Add selected folders
    Array.from(selectedFolders).forEach(folderId => {
      const folder = folders.find(f => f.id === folderId);
      if (folder) {
        itemsToCopy.push({ type: 'folder', item: folder });
      }
    });

    if (itemsToCopy.length > 0) {
      const itemsWithOperation = itemsToCopy.map(item => ({ ...item, operation: 'copy' as const }));
      copyItems(itemsWithOperation);
      clearAllSelections();
      
      // Notify user if any chats were skipped
      if (skippedChatCount > 0) {
        console.warn(`Skipped ${skippedChatCount} chat conversation(s) - use cut/paste to move chats instead`);
      }
    } else if (skippedChatCount > 0) {
      console.warn('Cannot copy chat conversations - use cut/paste to move them instead');
    }
  };

  const bulkCut = () => {
    const totalItems = selectedFiles.size + selectedFolders.size;
    if (totalItems === 0) return;

    // Collect all selected items for bulk cut
    const itemsToCut: Array<{ type: 'file' | 'folder', item: FileData | FolderData }> = [];

    // Add selected files
    Array.from(selectedFiles).forEach(fileId => {
      const file = files.find(f => f.id === fileId);
      if (file) {
        itemsToCut.push({ type: 'file', item: file });
      }
    });

    // Add selected folders
    Array.from(selectedFolders).forEach(folderId => {
      const folder = folders.find(f => f.id === folderId);
      if (folder) {
        itemsToCut.push({ type: 'folder', item: folder });
      }
    });

    if (itemsToCut.length > 0) {
      const itemsWithOperation = itemsToCut.map(item => ({ ...item, operation: 'cut' as const }));
      cutItems(itemsWithOperation);
      clearAllSelections();
    }
  };

  // Cached function to process and decrypt files
  const processFiles = async (rawFiles: any[]): Promise<FileData[]> => {
    if (!user || !privateKey) {
      return [];
    }

    const filesMap = new Map<string, FileData>();

    // Invalidate cache entries for files that have been modified
    for (const fileData of rawFiles) {
      if (fileData.lastModified) {
        const modifiedTime = fileData.lastModified.toDate ? fileData.lastModified.toDate().getTime() : Date.now();
        metadataCache.invalidateIfModified(fileData.id, modifiedTime);
      }
    }

    // Batch check cache for all files
    const fileIds = rawFiles.map(f => f.id);
    const cachedEntries = metadataCache.getBatch(fileIds);

    console.log(`📊 Cache stats: ${cachedEntries.size}/${rawFiles.length} files cached`);

    // Separate files into cached and uncached
    const uncachedFiles = [];

    for (const fileData of rawFiles) {
      if (!fileData.encryptedKeys || !fileData.encryptedKeys[user.uid]) {
        filesMap.set(fileData.id, { ...fileData, name: '[No Access]', size: '' });
        continue;
      }

      const cached = cachedEntries.get(fileData.id);
      if (cached) {
        // Use cached metadata - instant performance!
        filesMap.set(fileData.id, {
          ...fileData,
          name: cached.decryptedName,
          size: cached.decryptedSize,
        });
      } else {
        uncachedFiles.push(fileData);
      }
    }

    // Process uncached files in smaller batches to avoid blocking UI
    const batchSize = 5;
    for (let i = 0; i < uncachedFiles.length; i += batchSize) {
      const batch = uncachedFiles.slice(i, i + batchSize);

      if (batch.length > 0) {
        console.log(`🔓 Decrypting metadata for ${batch.length} files (batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(uncachedFiles.length/batchSize)})`);
      }

      await Promise.all(
        batch.map(async (fileData) => {
          try {
            const userEncryptedKey = fileData.encryptedKeys?.[user.uid];
            if (!userEncryptedKey || !privateKey || !fileData.encryptedKeys) {
              console.warn('Missing encrypted key for file:', {
                fileId: fileData.id,
                fileName: fileData.name,
                userId: user.uid,
                hasEncryptedKeys: !!fileData.encryptedKeys,
                encryptedKeysKeys: fileData.encryptedKeys ? Object.keys(fileData.encryptedKeys) : [],
                userHasKey: fileData.encryptedKeys ? user.uid in fileData.encryptedKeys : false
              });
              filesMap.set(fileData.id, { ...fileData, name: '[No Access]', size: '' });
              return;
            }

            // Use cached metadata service - this will decrypt and cache
            const metadata = await getOrDecryptMetadata(fileData, user.uid, privateKey);

            filesMap.set(fileData.id, {
              ...fileData,
              name: metadata.decryptedName,
              size: metadata.decryptedSize,
            });
          } catch (error) {
            console.error('Error decrypting file metadata:', error);
            filesMap.set(fileData.id, { ...fileData, name: '[Encrypted File]', size: '' });
          }
        })
      );
    }

    return Array.from(filesMap.values());
  };

  // Sync cache timeout with passphrase timeout preference
  useEffect(() => {
    // Check if user has "remember longer" preference by checking localStorage
    const hasLongerPreference = localStorage.getItem(`rememberChoice_${user?.uid}`) === 'true';
    metadataCache.setTimeoutPreference(hasLongerPreference);
  }, [user?.uid]);

  // Load files for current folder
  // Subscribe to files with real-time updates
  useEffect(() => {
    
    if (!user || !privateKey || isRecentsView || isFavoritesView || isSharedView || isArchivedView) {
      console.log('🔧 MainContent early exit:', {
        noUser: !user,
        noPrivateKey: !privateKey,
        isRecentsView,
        isFavoritesView,
        isSharedView,
        isArchivedView
      });
      setIsDataLoading(false);
      setHasLoadedOnce(true); // Mark as loaded even if we exit early
      return;
    }

    setIsDataLoading(true);

    const handleFilesUpdate = async (rawFiles: any[]) => {
      try {
        const stack = new Error().stack;
        const chatCountInRaw = rawFiles.filter((f: any) => f.fileType === 'chat').length;
        console.log(`🔄 Loading ${rawFiles.length} files (${chatCountInRaw} chats)...`, stack?.split('\n')[2]);

        // Immediately clear loading state to prevent infinite loading
        // We'll process files in the background
        setIsDataLoading(false);
        setHasLoadedOnce(true);

        // Invalidate cache entries for files that have been modified (BEFORE checking cache)
        for (const fileData of rawFiles) {
          if (fileData.lastModified) {
            const modifiedTime = fileData.lastModified.toDate ? fileData.lastModified.toDate().getTime() : Date.now();
            metadataCache.invalidateIfModified(fileData.id, modifiedTime);
          }
        }

        // Check if all files are cached for instant loading
        const fileIds = rawFiles.map(f => f.id);
        const cachedEntries = metadataCache.getBatch(fileIds);

        let processedFiles: FileData[];

        if (cachedEntries.size === rawFiles.length) {
          // All files are cached - instant loading!
          console.log(`⚡ All ${rawFiles.length} files cached - instant load!`);
          processedFiles = metadataCache.buildFileDataFromCache(fileIds, rawFiles);
        } else {
          // Some files need processing - this will also update the cache
          console.log(`🔓 ${rawFiles.length - cachedEntries.size}/${rawFiles.length} files need processing`);
          processedFiles = await processFiles(rawFiles);
          console.log(`📊 Cache now contains ${metadataCache.getStats().size} files after processing`);
        }

        console.log(`✅ Finished loading ${processedFiles.length} files`);
        const sortedFiles = processedFiles.sort((a, b) => {
          // Convert to Date objects for comparison
          const dateA = a.lastModified instanceof Date ? a.lastModified : new Date(a.lastModified);
          const dateB = b.lastModified instanceof Date ? b.lastModified : new Date(b.lastModified);
          return dateB.getTime() - dateA.getTime(); // Sort by most recent first
        });
        
        // Filter out attachment files (form attachments) and archived files from main view
        const visibleFiles = sortedFiles.filter((f: any) => {
          if (f.fileType === 'attachment') return false;
          if (user && f.archivedBy && Array.isArray(f.archivedBy) && f.archivedBy.includes(user.uid)) return false;
          return true;
        });
        
        const chatCount = visibleFiles.filter((f: any) => f.fileType === 'chat').length;
        const attachmentCount = sortedFiles.length - visibleFiles.length;
        console.log(`📁 Setting files state: ${visibleFiles.length} visible (${chatCount} chats, ${attachmentCount} attachments hidden)`);
        
        setFiles(visibleFiles);
        
        // Apply search filter immediately to prevent visual flash
        let displayFiles = sortedFiles;
        if (searchQuery.trim()) {
          const searchTerm = searchQuery.toLowerCase();
          displayFiles = sortedFiles.filter(file => {
            const fileName = typeof file.name === 'string' ? file.name.toLowerCase() : '';
            if (fileName.includes(searchTerm)) return true;
            
            const cached = metadataCache.get(file.id!);
            if (cached && 'tags' in cached && cached.tags) {
              return cached.tags.some((tag: string) => tag.toLowerCase().includes(searchTerm));
            }
            return false;
          });
        }
        
        setFilteredFiles(displayFiles);
      } catch (error) {
        console.error('Error processing files:', error);
        setFiles([]);
        setFilteredFiles([]);
        setHasLoadedOnce(true);
        setIsDataLoading(false);
      }
    };

    // Set up real-time subscription
    let unsubscribe: (() => void) | null = null;
    let subscriptionTimeout: NodeJS.Timeout;
    
    const setupSubscription = async () => {
      try {
        console.log(`🔌 Setting up file subscription for folder: ${currentFolder || 'root'}`);

        // Set a timeout to prevent infinite loading
        subscriptionTimeout = setTimeout(() => {
          console.warn('⚠️ File subscription taking too long, clearing loading state');
          setIsDataLoading(false);
          setHasLoadedOnce(true);
        }, 10000); // 10 second timeout

        // Use backend service for reactive file subscriptions
        // When filtering by doc type, subscribe to all files across all folders
        unsubscribe = selectedDocType
          ? backendService.files.subscribeAll(user.uid, handleFilesUpdate)
          : backendService.files.subscribe(user.uid, currentFolder, handleFilesUpdate);

        console.log('✅ File subscription established successfully');

        // Clear timeout if subscription was successful
        if (subscriptionTimeout) {
          clearTimeout(subscriptionTimeout);
        }
      } catch (error) {
        console.error('Error setting up files subscription:', error);
        setIsDataLoading(false);
        setHasLoadedOnce(true);
        if (subscriptionTimeout) {
          clearTimeout(subscriptionTimeout);
        }
      }
    };

    setupSubscription();

    // Cleanup subscription on unmount or dependency change
    return () => {
      console.log(`🔌 Cleaning up file subscription for folder: ${currentFolder || 'root'}`);
      if (unsubscribe) {
        unsubscribe();
      }
      if (subscriptionTimeout) {
        clearTimeout(subscriptionTimeout);
      }
    };
  }, [currentFolder, user, privateKey, isRecentsView, isFavoritesView, isSharedView, selectedDocType]);

  // Handle opening a file from notification
  useEffect(() => {
    if (!fileIdToOpen || !user || !privateKey) {
      return;
    }

    console.log(`📂 Attempting to open file from notification: ${fileIdToOpen}`);
    
    // Don't wait for files to load - try to load directly
    const loadAndOpenFile = async () => {
      try {
        // First check if file is already in the current files list
        const fileInList = files.find(f => f.id === fileIdToOpen);
        
        if (fileInList) {
          console.log(`✅ Found file in current list, opening:`, fileInList);
          await handleFormFileClick(fileInList);
        } else {
          // File not in current folder - load it directly
          console.log(`⚠️ File not in current folder, loading directly...`);
          const file = await FileAccessService.loadFileById(fileIdToOpen, user.uid, privateKey);
          console.log(`✅ Loaded file directly:`, file);
          
          // Now open it using handleFormFileClick
          await handleFormFileClick(file);
        }
        
        // Notify that the file was opened
        if (onFileOpened) {
          onFileOpened();
        }
      } catch (error) {
        console.error(`❌ Error loading file ${fileIdToOpen}:`, error);
        if (onFileOpened) {
          onFileOpened(); // Clear the fileIdToOpen even on error
        }
      }
    };

    loadAndOpenFile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileIdToOpen, user?.uid, !!privateKey]); // Re-run when auth/key become available after fileIdToOpen is set

  // Load recent files when in recents view
  useEffect(() => {
    if (!isRecentsView || !user || !privateKey) {
      console.log('⏭️ Skipping recents view effect:', { isRecentsView, hasUser: !!user, hasPrivateKey: !!privateKey });
      return;
    }

    console.log('📅 Loading recents view...');
    const loadRecentFiles = async () => {
      setIsDataLoading(true);

      try {
        // Check cache status for all recent files
        const fileIds = recentItems.map(item => item.id);
        const cachedEntries = metadataCache.getBatch(fileIds);
        console.log(`📊 Recent files cache: ${cachedEntries.size}/${recentItems.length} files cached`);

        const recentFilePromises = recentItems.map(async (item) => {
          try {
            return await FileAccessService.loadFileById(item.id, user.uid, privateKey);
          } catch (error) {
            console.error(`Error loading recent file ${item.id}:`, error);
            return null;
          }
        });

        const recentFiles = await Promise.all(recentFilePromises);
        const validFiles = recentFiles.filter((file): file is FileData => file !== null);
        
        setFiles(validFiles);
      } catch (error) {
        console.error('Error loading recent files:', error);
        setFiles([]);
      } finally {
        setIsDataLoading(false);
      }
    };

    loadRecentFiles();
  }, [isRecentsView, recentItems, user, privateKey]);

  // Load favorite files when in favorites view
  useEffect(() => {
    if (!isFavoritesView || !user || !privateKey) {
      console.log('⏭️ Skipping favorites view effect:', { isFavoritesView, hasUser: !!user, hasPrivateKey: !!privateKey });
      return;
    }

    console.log('⭐ Loading favorites view...');
    const loadFavoriteFiles = async () => {
      setIsDataLoading(true);

      try {
        // Get all files the user has access to using backend service
        const [ownedFiles, sharedFiles] = await Promise.all([
          backendService.files.getUserFiles(user.uid),
          backendService.files.getSharedFiles(user.uid)
        ]);

        // Combine and deduplicate files
        const allUserFiles = new Map<string, any>();

        ownedFiles.forEach(file => {
          allUserFiles.set(file.id!, file);
        });

        sharedFiles.forEach(file => {
          if (!allUserFiles.has(file.id!)) {
            allUserFiles.set(file.id!, file);
          }
        });

        const allFiles = Array.from(allUserFiles.values());

        // Filter files that are favorites for this user
        const { getUserFavoriteStatus } = await import('../services/userFavoritesManagement');
        console.log(`⭐ Checking ${allFiles.length} files for favorite status...`);
        const favoriteFiles = allFiles.filter((file: any) => {
          const isFavorite = getUserFavoriteStatus(file, user.uid);
          if (isFavorite) {
            console.log(`⭐ Found favorite file: ${file.id}`);
          }
          return isFavorite;
        });
        console.log(`⭐ Found ${favoriteFiles.length} favorite files out of ${allFiles.length} total`);
        
        // Optimize favorite files loading with cache
        const fileIds = favoriteFiles.map(f => f.id);
        const cachedEntries = metadataCache.getBatch(fileIds);

        let processedFiles: FileData[];

        if (cachedEntries.size === favoriteFiles.length) {
          // All favorite files are cached - instant loading!
          console.log(`⚡ All ${favoriteFiles.length} favorite files cached - instant load!`);
          processedFiles = metadataCache.buildFileDataFromCache(fileIds, favoriteFiles);
        } else {
          // Some files need processing
          console.log(`🔓 ${favoriteFiles.length - cachedEntries.size}/${favoriteFiles.length} favorite files need processing`);
          processedFiles = await processFiles(favoriteFiles);
        }
        const sortedFiles = processedFiles.sort((a, b) => {
          // Convert to Date objects for comparison
          const dateA = a.lastModified instanceof Date ? a.lastModified : new Date(a.lastModified);
          const dateB = b.lastModified instanceof Date ? b.lastModified : new Date(b.lastModified);
          return dateB.getTime() - dateA.getTime(); // Sort by most recent first
        });
        
        setFiles(sortedFiles);
        setFilteredFiles(sortedFiles);
        setIsDataLoading(false);
      } catch (error) {
        console.error('Error loading favorite files:', error);
        setFiles([]);
        setFilteredFiles([]);
        setIsDataLoading(false);
      }
    };

    loadFavoriteFiles();
  }, [isFavoritesView, user, privateKey]);

  // Load shared files when in shared view
  useEffect(() => {
    if (!isSharedView || !user || !privateKey) {
      console.log('⏭️ Skipping shared view effect:', { isSharedView, hasUser: !!user, hasPrivateKey: !!privateKey });
      return;
    }

    console.log('🤝 Loading shared view...');
    const loadSharedFiles = async () => {
      setIsDataLoading(true);

      try {
        // Get files shared with user using backend service
        const sharedFiles = await backendService.files.getSharedFiles(user.uid);

        // Filter out files owned by the user (only show files shared BY others)
        const actuallySharedFiles = sharedFiles.filter((file: any) => file.owner !== user.uid);

        // Process shared files with cache
        const processedFiles = await processFiles(actuallySharedFiles);

        setFiles(processedFiles);
        setFilteredFiles(processedFiles);
        setIsDataLoading(false);
      } catch (error) {
        console.error('Error loading shared files:', error);
        setFiles([]);
        setFilteredFiles([]);
        setIsDataLoading(false);
      }
    };

    loadSharedFiles();
  }, [isSharedView, user, privateKey]);

  // Load all archived files + folders when in archive view
  useEffect(() => {
    if (!isArchivedView || !user || !privateKey) {
      if (!isArchivedView) {
        setAllArchivedFiles([]);
        setAllArchivedFolders([]);
      }
      return;
    }

    console.log('🗄️ Loading archive view...');
    const loadArchivedFiles = async () => {
      setIsDataLoading(true);

      try {
        const { getArchivedFiles, getArchivedFolders } = await import('../firestore');
        const [archivedFiles, rawArchivedFolders] = await Promise.all([
          getArchivedFiles(user.uid),
          getArchivedFolders(user.uid),
        ]);

        // Decrypt folder names using the same logic as useFolders
        const { decryptData, decryptSymmetric, hexToBytes } = await import('../crypto/quantumSafeCrypto');
        const decryptedFolders: FolderData[] = await Promise.all(
          rawArchivedFolders.map(async (folder) => {
            try {
              if (typeof folder.name === 'object' && 'ciphertext' in folder.name && folder.encryptedKeys) {
                const userEncryptedKey = folder.encryptedKeys[user.uid];
                if (!userEncryptedKey) return { ...folder, name: '[No Access]' };
                const privateKeyBytes = hexToBytes(privateKey);
                const keyData = hexToBytes(userEncryptedKey);
                const iv = keyData.slice(0, 12);
                const encapsulatedKey = keyData.slice(12, 12 + 1088);
                const ciphertext = keyData.slice(12 + 1088);
                const sharedSecret = await decryptData({ iv, encapsulatedKey, ciphertext }, privateKeyBytes);
                const nonce = hexToBytes((folder.name as any).nonce);
                const encryptedNameBytes = hexToBytes((folder.name as any).ciphertext);
                const nameBytes = await decryptSymmetric(encryptedNameBytes, sharedSecret, nonce);
                return { ...folder, name: new TextDecoder().decode(nameBytes) };
              }
              return folder;
            } catch {
              return { ...folder, name: '[Decryption Error]' };
            }
          })
        );

        setAllArchivedFolders(decryptedFolders);

        const processedFiles = await processFiles(archivedFiles);
        setAllArchivedFiles(processedFiles);
        setIsDataLoading(false);
        setHasLoadedOnce(true);
      } catch (error) {
        console.error('Error loading archived files:', error);
        setAllArchivedFiles([]);
        setAllArchivedFolders([]);
        setIsDataLoading(false);
      }
    };

    loadArchivedFiles();
  }, [isArchivedView, user, privateKey]);

  // Event handlers
  const handleCreateFolder = async (name: string) => {
    if (!user || !privateKey) {
      console.error('Cannot create folder: user or privateKey not available');
      return;
    }
    await createFolder(user.uid, name, currentFolder, privateKey);
    setNewFolderDialogOpen(false);
  };

  const handleFormFileClick = async (fileInfo: FileData | { id: string; name?: string; parent?: string | null }) => {
    console.log('handleFormFileClick called with:', fileInfo);
    // Don't allow file operations if private key isn't available
    if (!user || !privateKey) {
      console.warn('Cannot open file: User or private key not available');
      return;
    }

    // Check if this is a chat file
    const isChat = 'fileType' in fileInfo && (fileInfo as any).fileType === 'chat';
    if (isChat && fileInfo.id) {
      // Open chat viewer modal
      setSelectedConversationId(fileInfo.id);
      setChatViewerOpen(true);
      return;
    }

    // Track recent access (only store non-sensitive metadata)
    const fileName = 'name' in fileInfo && fileInfo.name 
      ? (typeof fileInfo.name === 'string' ? fileInfo.name : '')
      : '';
    
    addRecentItem({
      id: fileInfo.id,
      type: isFormFile(fileName) ? 'form' : 'file',
      parent: 'parent' in fileInfo ? fileInfo.parent : null,
    });

    // Set loading state for file content
    setFileContentLoading(true);
    
    // Use centralized file access service
    await FileAccessService.openFile(fileInfo, user.uid, privateKey, {
      onFormOpen: (file: FileData, formData?: any) => {
        setFileContentLoading(false); // Clear loading state for forms too
        setSelectedFormFile(file);
        
        if (formData) {
          // Check if form has any data - if all fields are empty, open in edit mode
          const hasData = formData.data && Object.values(formData.data).some((value: any) => 
            value !== null && value !== undefined && value !== ''
          );
          
          if (!hasData) {
            // Form is empty, open directly in edit mode
            setSelectedFormData(formData);
            setIsEditingForm(true);
            setFormFillerOpen(true);
          } else {
            // Form has data, open in view mode
            setFormViewerOpen(true);
          }
        } else {
          // Fallback to view mode if no form data
          setFormViewerOpen(true);
        }
      },
      onFileOpen: (file: FileData, content: ArrayBuffer) => {
        // For regular files, open in file viewer
        setSelectedFile(file);
        setFileContent(content);
        setFileContentLoading(false); // Ensure loading state is cleared
        setFileViewerOpen(true);
      },
      onError: (error: string) => {
        console.error('Error opening file:', error);
        setFileContentLoading(false); // Clear loading state on error
      }
    });
  };


  const handleDownloadFile = async () => {
    if (!selectedFile || !fileContent) return;
    
    try {
      const fileName = typeof selectedFile.name === 'string' ? selectedFile.name : `file_${selectedFile.id}`;
      const blob = new Blob([fileContent]);
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  };

  const handleDownloadFormFile = async () => {
    if (!selectedFormFile || !user || !privateKey) return;
    
    try {
      const content = await FileAccessService.loadFileContent(selectedFormFile, user.uid, privateKey);
      const fileName = typeof selectedFormFile.name === 'string' ? selectedFormFile.name : `form_${selectedFormFile.id}`;
      const blob = new Blob([content]);
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading form file:', error);
    }
  };

  const handleCloseFileViewer = () => {
    setFileViewerOpen(false);
    setSelectedFile(null);
    setFileContent(null);
  };
  
  const handleCloseChatViewer = () => {
    setChatViewerOpen(false);
    setSelectedConversationId(null);
  };
  
  const handleShareChat = () => {
    if (!selectedConversationId) return;
    
    // Find the conversation file to share
    const conversationFile = files.find(f => f.id === selectedConversationId);
    if (conversationFile) {
      setFileToShare(conversationFile);
      setFolderToShare(null);
      setShareItemType('file');
      setShareDialogOpen(true);
    }
  };

  const handleCreateNewChat = async () => {
    if (!user || !privateKey || selectedContacts.length === 0) return;

    try {
      const { ChatService } = await import('../services/chatService');
      
      // Create a new conversation
      const conversationId = await ChatService.createConversation(
        user.uid,
        selectedContacts,
        'individual', // For now, always create individual chats from FAB
        privateKey
      );

      // Close the contact selector dialog
      setNewChatDialogOpen(false);
      setSelectedContacts([]);

      // Open the new chat in ChatViewer
      setSelectedConversationId(conversationId);
      setChatViewerOpen(true);
    } catch (error) {
      console.error('Error creating chat:', error);
      alert(`Failed to create chat: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleEditForm = async () => {
    if (!selectedFormFile || !user || !privateKey) return;
    
    try {
      setFormViewerOpen(false);
      
      // CRITICAL: Fetch fresh file data from backend to get the latest storagePath and metadata
      // This ensures we load the most recent version, not cached state
      console.log('🔄 Fetching fresh file data for editing:', selectedFormFile.id);
      const freshFileData = await backendService.files.get(selectedFormFile.id);
      
      if (!freshFileData) {
        throw new Error('File not found');
      }
      
      console.log('✅ Fresh file data loaded, storagePath:', freshFileData.storagePath);
      
      // Force bypass cache by downloading directly from the fresh storagePath
      const { getFile } = await import('../storage');
      const encryptedContent = await getFile(freshFileData.storagePath);
      
      // Decrypt using FileEncryptionService
      const { FileEncryptionService } = await import('../services/fileEncryption');
      const decryptedContentBuffer = await FileEncryptionService.decryptFile(
        new Uint8Array(encryptedContent),
        freshFileData.encryptedKeys[user.uid],
        privateKey
      );
      
      const decryptedContent = new TextDecoder().decode(decryptedContentBuffer);
      const formData = JSON.parse(decryptedContent);
      
      setSelectedFormData(formData);
      setIsEditingForm(true);
      setFormFillerOpen(true);
      
    } catch (error) {
      console.error('Error loading form for editing:', error);
    }
  };

  const handleFormSave = async (fileId?: string) => {
    setFormEditorOpen(false);
    setFormFillerOpen(false);
    setSelectedFormFile(null);
    setSelectedFormData(null);
    setIsEditingForm(false);

    // Auto-index the form for search if fileId is provided
    if (fileId) {
      indexSingleForm(fileId);
      
      // Update the local files state with fresh metadata
      try {
        const file = await backendService.files.get(fileId, true);
        if (file && user?.privateKey) {
          const { getOrDecryptMetadata } = await import('../services/metadataCache');
          const metadata = await getOrDecryptMetadata(file, user.uid, user.privateKey);
          
          setFiles(prevFiles => 
            prevFiles.map(f => 
              f.id === fileId 
                ? { ...f, name: metadata.decryptedName, size: metadata.decryptedSize, lastModified: file.lastModified }
                : f
            )
          );
        }
      } catch (error) {
        console.warn('Failed to update local files state:', error);
      }
    }

    // WORKAROUND: Force a small delay to ensure Firestore has propagated the write
    // The subscription should handle this automatically, but adding this as safety
    setTimeout(() => {
      console.log('⏰ Post-save timeout complete, subscription should have updated by now');
    }, 1000);
  };

  const handleFormCancel = () => {
    setFormEditorOpen(false);
    setFormViewerOpen(false);
    setFormFillerOpen(false);
    setSelectedFormFile(null);
    setSelectedFormData(null);
    setIsEditingForm(false);
    // Also close file viewer if open
    setFileViewerOpen(false);
    setSelectedFile(null);
    setFileContent(null);
  };

  const handleRightClick = (event: React.MouseEvent, item: FileData | FolderData, type: 'file' | 'folder') => {
    event.preventDefault();
    event.stopPropagation(); // prevent background context menu from also opening
    setContextMenu({ mouseX: event.clientX - 2, mouseY: event.clientY - 4, item, type });
  };

  const handleLongPressStart = (item: FileData | FolderData, type: 'file' | 'folder') => {
    const timer = setTimeout(() => {
      setMobileActionMenu({ open: true, item, type });
    }, 500);
    setLongPressTimer(timer);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handleOpenMobileActionMenu = (item: FileData | FolderData, type: 'file' | 'folder') => {
    setMobileActionMenu({ open: true, item, type });
  };

  const copyFile = async (originalFile: FileData, preserveSharing: boolean = true) => {
    if (!user || !privateKey) return;

    try {
      await FileOperationsService.copyFile(
        originalFile,
        user.uid,
        privateKey,
        {
          preserveSharing,
          newParentFolder: currentFolder,
          allowContentDeduplication: true // Allow sharing same storage path for efficiency
        }
      );
      
      console.log('File copied successfully');
    } catch (error) {
      console.error('Failed to copy file:', error);
      throw error;
    }
  };

  const copyFolder = async (originalFolder: FolderData) => {
    if (!user || !privateKey) {
      console.error('Cannot copy folder: user or privateKey not available');
      return;
    }

    try {
      await FileOperationsService.copyFolder(
        originalFolder,
        user.uid,
        privateKey,
        {
          newParentFolder: currentFolder
        }
      );
      
      console.log('Folder copied successfully');
    } catch (error) {
      console.error('Failed to copy folder:', error);
      throw error;
    }
  };

  const handlePaste = async () => {
    if (clipboardItems.length === 0 || !user) return;

    try {
      // For multiple items, process each one
      for (const item of clipboardItems) {
        if (item.type === 'folder') {
          const folder = item.item as FolderData;
          
          if (item.operation === 'cut') {
            await updateFolder(folder.id!, { parent: currentFolder });
          } else if (item.operation === 'copy') {
            // For now, copy folder without dialog for bulk operations
            // TODO: Could be enhanced to show a single dialog for all items
            await copyFolder(folder);
          }
        } else if (item.type === 'file') {
          const file = item.item as FileData;
          
          if (item.operation === 'cut') {
            // Use the new per-user folder management system
            const { moveFileForUser } = await import('../services/userFolderManagement');
            await moveFileForUser(file.id!, user!.uid, currentFolder, file);
          } else if (item.operation === 'copy') {
            // Check if this is a chat file
            const isChatFile = (file as any).fileType === 'chat';
            
            if (isChatFile) {
              // Chat files can't be copied, only moved
              // Skip this item with a warning
              console.warn('Cannot copy chat conversation - use cut/paste to move it instead');
              continue;
            }
            
            // For single items, show dialog; for multiple items, copy without dialog
            if (clipboardItems.length === 1) {
              setItemToCopy({ item: file, type: 'file' });
              setCopyOptionsOpen(true);
              return; // Exit early to show dialog
            } else {
              // Bulk copy without dialog - don't preserve sharing by default
              await copyFile(file, false);
            }
          }
        }
      }
      
      // Clear clipboard after successful paste
      clearClipboard();
      
      // Clear selections to close bulk action menu
      setSelectedFiles(new Set());
      setSelectedFolders(new Set());
    } catch (error) {
      console.error('Paste operation failed:', error);
    }
  };

  const handleUploadClick = () => {
    // This will be handled by FileUploadArea's internal file input
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  };

  const { setActions } = useContentActions();
  useEffect(() => {
    setActions({
      onNewFolder: () => setNewFolderDialogOpen(true),
      onUpload: handleUploadClick,
      onNewForm: () => setFormBuilderOpen(true),
      onNewChat: () => setNewChatDialogOpen(true),
    });
    return () => setActions({ onNewFolder: null, onUpload: null, onNewForm: null, onNewChat: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleFavorite = async (fileId: string) => {
    if (!user) return;
    
    try {
      // Find the file in the current files list
      const file = files.find(f => f.id === fileId);
      if (!file) {
        console.error('File not found for favorite toggle');
        return;
      }
      
      // Use the new per-user favorites system
      const { toggleUserFavorite } = await import('../services/userFavoritesManagement');
      const newStatus = await toggleUserFavorite(file, user.uid);
      
      // Update the local state immediately for better UX
      const updatedFiles = files.map(f => {
        if (f.id === fileId) {
          const updatedUserFavorites = { ...f.userFavorites };
          updatedUserFavorites[user.uid] = newStatus;
          return { ...f, userFavorites: updatedUserFavorites };
        }
        return f;
      });
      
      setFiles(updatedFiles);
      setFilteredFiles(filteredFiles.map(f => {
        if (f.id === fileId) {
          const updatedUserFavorites = { ...f.userFavorites };
          updatedUserFavorites[user.uid] = newStatus;
          return { ...f, userFavorites: updatedUserFavorites };
        }
        return f;
      }));
      
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const handleUnshareFile = async (userIdsToUnshare: string[]) => {
    // Handle folder unsharing
    if (shareItemType === 'folder' && folderToShare) {
      await handleUnshareFolder(userIdsToUnshare);
      return;
    }

    // Handle file unsharing
    if (!user || !fileToShare || userIdsToUnshare.length === 0) {
      console.error('Missing required parameters for unsharing:', { user: !!user, fileToShare: !!fileToShare, userIdsToUnshare });
      return;
    }

    try {
      // Use the FileOperationsService for proper unsharing with notifications
      await FileOperationsService.removeFileSharing(
        fileToShare,
        userIdsToUnshare,
        user.uid // Pass current user ID for notifications
      );

      setShareDialogOpen(false);
      
    } catch (error) {
      console.error('Error unsharing file:', error);
    }
  };

  const handleUnshareFolder = async (userIdsToUnshare: string[]) => {
    if (!user || !folderToShare || userIdsToUnshare.length === 0) {
      console.error('Missing required parameters for unsharing folder');
      return;
    }

    try {
      console.log(`📁 Unsharing folder ${folderToShare.id} from users:`, userIdsToUnshare);

      // Use the FolderSharingService to unshare the folder and all its files
      const { FolderSharingService } = await import('../services/folderSharing');
      await FolderSharingService.unshareFolderFromUsers(
        folderToShare.id!,
        userIdsToUnshare
      );

      // Update folderToShare state
      setFolderToShare(prevFolder => prevFolder ? {
        ...prevFolder,
        sharedWith: (prevFolder.sharedWith || []).filter(uid => !userIdsToUnshare.includes(uid))
      } : null);

      setShareDialogOpen(false);
      console.log('✅ Folder unshared successfully');
      
    } catch (error) {
      console.error('Error unsharing folder:', error);
    }
  };

  const handleShareFile = async (recipients: string[]) => {
    if (!user || !privateKey || !fileToShare || recipients.length === 0) {
      console.error('Missing required parameters for sharing:', { user: !!user, privateKey: !!privateKey, fileToShare: !!fileToShare, recipients });
      return;
    }

    try {
      const recipientUserIds: string[] = [];

      // Process each recipient to validate and convert email/userID to user ID
      for (const recipient of recipients) {
        try {
          let userProfile;
          let userId;
          
          // Check if recipient looks like a user ID (not an email)
          const isUserId = !recipient.includes('@');
          
          if (isUserId) {
            console.log(`🔍 Looking up user by ID: ${recipient}`);
            userProfile = await getUserPublicProfile(recipient);
            userId = recipient;
            
            if (!userProfile) {
              console.warn(`❌ User ${recipient} not found in database`);
              continue;
            }
            console.log(`✅ Found user ${recipient} with profile:`, userProfile.displayName);
          } else {
            console.log(`🔍 Looking up user by email: ${recipient}`);
            const userWithProfile = await getUserByEmail(recipient);
            
            if (!userWithProfile) {
              console.warn(`❌ User ${recipient} not found in database`);
              continue;
            }
            
            userProfile = userWithProfile.profile;
            userId = userWithProfile.id;
            console.log(`✅ Found user ${recipient} with ID: ${userId}`);
          }
          
          if (!userProfile.publicKey) {
            console.warn(`User ${recipient} does not have a public key`);
            continue;
          }

          // Skip if already shared with this user
          if (fileToShare.sharedWith.includes(userId)) {
            console.log(`File already shared with ${recipient}`);
            continue;
          }

          recipientUserIds.push(userId);

        } catch (error) {
          console.error(`Error processing recipient ${recipient}:`, error);
        }
      }

      if (recipientUserIds.length === 0) {
        return;
      }

      console.log(`📤 Sharing file with user IDs:`, recipientUserIds);
      console.log(`📄 File to share:`, { id: fileToShare.id, name: fileToShare.name, sharedWith: fileToShare.sharedWith });

      // Use the centralized FileOperationsService to share the file
      await FileOperationsService.shareFileWithUsers(
        fileToShare,
        user.uid,
        privateKey,
        recipientUserIds
      );

      // Update fileToShare state with new shared users so ShareDialog shows updated list when reopened
      setFileToShare(prevFile => prevFile ? {
        ...prevFile,
        sharedWith: [...prevFile.sharedWith, ...recipientUserIds]
      } : null);

      setShareDialogOpen(false);
      
    } catch (error) {
      console.error('Failed to share file:', error);
    }
  };


  // Handler for file sharing
  const handleShare = async (recipients: string[]) => {
    // Handle folder sharing
    if (shareItemType === 'folder' && folderToShare) {
      console.log(`📁 Sharing folder ${folderToShare.id} with recipients:`, recipients);
      await handleShareFolder(recipients);
      return;
    }

    // Check if multiple files are selected for bulk sharing
    if (selectedFiles.size > 1) {
      console.log(`🔄 Bulk sharing ${selectedFiles.size} files`);
      await bulkShareFiles(recipients);
    } else {
      // Single file sharing (existing behavior)
      await handleShareFile(recipients);
    }
  };

  // Handler for folder sharing
  const handleShareFolder = async (recipients: string[]) => {
    if (!user || !privateKey || !folderToShare || recipients.length === 0) {
      console.error('Cannot share folder: missing required data');
      return;
    }

    try {
      // Convert email addresses to user IDs if needed
      const recipientUserIds: string[] = [];
      
      for (const recipient of recipients) {
        try {
          let userId: string;
          let userProfile: any;

          // Check if recipient is already a user ID (not an email)
          if (!recipient.includes('@')) {
            // It's already a user ID
            const { getUserProfile } = await import('../firestore');
            userProfile = await getUserProfile(recipient);
            userId = recipient;
            
            if (!userProfile) {
              console.warn(`❌ User ${recipient} not found in database`);
              continue;
            }
          } else {
            // It's an email, look up the user
            const { getUserByEmail } = await import('../firestore');
            const userWithProfile = await getUserByEmail(recipient);
            
            if (!userWithProfile) {
              console.warn(`❌ User ${recipient} not found in database`);
              continue;
            }
            
            userProfile = userWithProfile.profile;
            userId = userWithProfile.id;
          }
          
          if (!userProfile.publicKey) {
            console.warn(`User ${recipient} does not have a public key`);
            continue;
          }

          recipientUserIds.push(userId);

        } catch (error) {
          console.error(`Error processing recipient ${recipient}:`, error);
        }
      }

      if (recipientUserIds.length === 0) {
        console.warn('No valid recipients found');
        return;
      }

      console.log(`📤 Sharing folder with user IDs:`, recipientUserIds);

      // Use the FolderSharingService to share the folder and all its files
      const { FolderSharingService } = await import('../services/folderSharing');
      await FolderSharingService.shareFolderWithUsers(
        folderToShare.id!,
        user.uid,
        privateKey,
        recipientUserIds
      );

      // Update folderToShare state with new shared users
      setFolderToShare(prevFolder => prevFolder ? {
        ...prevFolder,
        sharedWith: [...(prevFolder.sharedWith || []), ...recipientUserIds]
      } : null);

      setShareDialogOpen(false);
      console.log('✅ Folder shared successfully');
      
    } catch (error) {
      console.error('Failed to share folder:', error);
    }
  };

  // Handler for moving items (files or folders) to different folders
  const handleMoveItem = async (itemId: string, itemType: 'file' | 'folder', targetFolderId: string | null) => {
    if (!user) return;
    
    try {
      if (itemType === 'folder') {
        // Use the FolderSharingService to handle per-user folder locations
        const { FolderSharingService } = await import('../services/folderSharing');
        await FolderSharingService.moveFolderForUser(itemId, user.uid, targetFolderId);
      } else if (itemType === 'file') {
        // Use the new per-user folder management system
        const { moveFileForUser } = await import('../services/userFolderManagement');
        await moveFileForUser(itemId, user.uid, targetFolderId);
      }
    } catch (error) {
      console.error('Error moving item:', error);
      // You could add a toast notification here
    }
  };

  // Archive/restore handlers
  const handleArchiveItem = async (item: FileData | FolderData, type: 'file' | 'folder') => {
    if (!user) return;
    try {
      if (type === 'file') {
        const { archiveFile } = await import('../firestore');
        await archiveFile(item.id!, user.uid);
        // Remove from local state immediately
        setFiles(prev => prev.filter(f => f.id !== item.id));
        setFilteredFiles(prev => prev.filter(f => f.id !== item.id));
      } else {
        const { archiveFolder } = await import('../firestore');
        await archiveFolder(item.id!, user.uid);
      }
      setContextMenu(null);
      setMobileActionMenu({ open: false, item: null, type: 'file' });
    } catch (error) {
      console.error('Error archiving item:', error);
    }
  };

  const handleRestoreItem = async (item: FileData | FolderData, type: 'file' | 'folder') => {
    if (!user) return;
    try {
      if (type === 'file') {
        const { unarchiveFile } = await import('../firestore');
        await unarchiveFile(item.id!, user.uid);
        setAllArchivedFiles(prev => prev.filter(f => f.id !== item.id));
      } else {
        const { unarchiveFolder } = await import('../firestore');
        await unarchiveFolder(item.id!, user.uid);
        // Remove the folder and all its descendants from the archived set
        const removeIds = new Set<string>();
        const collectDescendants = (id: string) => {
          removeIds.add(id);
          allArchivedFolders.forEach(f => { if (f.parent === id) collectDescendants(f.id!); });
        };
        collectDescendants(item.id!);
        setAllArchivedFolders(prev => prev.filter(f => !removeIds.has(f.id!)));
        setAllArchivedFiles(prev => prev.filter(f => {
          const folderId = f.userFolders?.[user.uid] ?? f.parent ?? null;
          return !folderId || !removeIds.has(folderId);
        }));
      }
      setContextMenu(null);
      setMobileActionMenu({ open: false, item: null, type: 'file' });
    } catch (error) {
      console.error('Error restoring item:', error);
    }
  };

  // Show unlock message if no private key
  if (!privateKey) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '400px',
          width: '100%',
          p: 3,
        }}
      >
        <LockOutlined sx={{ fontSize: 80, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h5" gutterBottom color="text.primary" sx={{ fontWeight: 500 }}>
          {t('mainContent.vaultLocked')}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center', maxWidth: '500px', mb: 3 }}>
          {t('mainContent.vaultLockedMessage')}
        </Typography>
        <Button
          variant="contained"
          size="large"
          startIcon={<LockOutlined />}
          onClick={requestUnlock}
          sx={{ borderRadius: 2, px: 4, textTransform: 'none', fontSize: '1rem' }}
        >
          {t('mainContent.unlockVault', 'Unlock Vault')}
        </Button>
      </Box>
    );
  }

  return (
    <FileUploadArea
      currentFolder={currentFolder}
      privateKey={privateKey || ''}
      onUploadComplete={(uploadedFileIds) => {
        // Add uploaded files to recent items
        uploadedFileIds.forEach(fileId => {
          addRecentItem({
            id: fileId,
            type: 'file',
            parent: currentFolder,
          });
        });
        
        // Files should refresh automatically via the snapshot listener
        // But add a small delay and manual refresh as fallback
        console.log('📁 Upload completed, triggering UI refresh...');
        setTimeout(() => {
          // Force refresh by toggling a state variable
          setIsDataLoading(true);
          setTimeout(() => setIsDataLoading(false), 100);
        }, 500);
      }}
    >

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          minWidth: 0,
          overflow: 'hidden'
        }}
      >
        {/* Header - different for recents vs folder view */}
        {isRecentsView && (
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            mb: 2, 
            flexShrink: 0 
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AccessTime color="primary" />
              <Typography variant="h6" component="h1">
                {t('mainContent.recentFiles')}
              </Typography>
              <Chip 
                label={files.length} 
                size="small" 
                variant="outlined" 
                sx={{ ml: 1 }}
              />
            </Box>
            
            {recentItems.length > 0 && (
              <IconButton
                onClick={() => {
                  clearRecents();
                  setFiles([]);
                }}
                size="small"
                title={t('mainContent.clearAllRecents')}
                sx={{ color: 'text.secondary' }}
              >
                <Clear />
              </IconButton>
            )}
          </Box>
        )}

        {isFavoritesView && (
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            mb: 2, 
            flexShrink: 0 
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Star color="primary" />
              <Typography variant="h6" component="h1">
                {t('mainContent.favoriteFiles')}
              </Typography>
              <Chip 
                label={files.length} 
                size="small" 
                variant="outlined" 
                sx={{ ml: 1 }}
              />
            </Box>
          </Box>
        )}

        {isSharedView && (
          <Box sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 2,
            flexShrink: 0
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Share color="primary" />
              <Typography variant="h6" component="h1">
                {t('mainContent.sharedWithMe')}
              </Typography>
              <Chip
                label={files.length}
                size="small"
                variant="outlined"
                sx={{ ml: 1 }}
              />
            </Box>
          </Box>
        )}

        {isArchivedView && (() => {
          // Build breadcrumb path from allArchivedFolders
          const archiveCrumbs: { id: string | null; name: string }[] = [{ id: null, name: t('mainContent.archive', 'Archive') }];
          if (currentFolder) {
            const path: { id: string | null; name: string }[] = [];
            let cur: string | null = currentFolder;
            while (cur) {
              const f = allArchivedFolders.find(x => x.id === cur);
              if (!f) break;
              path.unshift({ id: f.id ?? null, name: typeof f.name === 'string' ? f.name : '[Encrypted]' });
              cur = f.parent ?? null;
            }
            archiveCrumbs.push(...path);
          }
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, flexShrink: 0, justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
                {archiveCrumbs.map((crumb, idx) => {
                  const isLast = idx === archiveCrumbs.length - 1;
                  return isLast ? (
                    <Typography key={crumb.id ?? 'archive-root'} variant="h6" component="span">
                      {crumb.name}
                      {idx === 0 && (
                        <Chip label={allArchivedFiles.length} size="small" variant="outlined" sx={{ ml: 1 }} />
                      )}
                    </Typography>
                  ) : (
                    <Box key={crumb.id ?? 'archive-root'} sx={{ display: 'flex', alignItems: 'center' }}>
                      <Typography
                        variant="h6"
                        component="span"
                        sx={{ cursor: 'pointer', color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
                        onClick={() => setCurrentFolder(crumb.id)}
                      >
                        {crumb.name}
                      </Typography>
                      <Typography variant="h6" component="span" sx={{ mx: 0.5, color: 'text.disabled' }}>/</Typography>
                    </Box>
                  );
                })}
              </Box>
              <Tooltip title={t('mainContent.archiveHelpTooltip')}>
                <IconButton size="small" onClick={() => setArchiveHelpOpen(true)} sx={{ ml: 1 }}>
                  <HelpOutline fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          );
        })()}

        {!isRecentsView && !isFavoritesView && !isSharedView && !isArchivedView && (
          <>
            {/* Header with Breadcrumbs, Search, and Action Buttons */}
            <Box sx={{ 
              display: 'flex', 
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between', 
              alignItems: isMobile ? 'stretch' : 'center',
              mb: 2, 
              flexShrink: 0,
              gap: isMobile ? 1 : 0
            }}>
              <Breadcrumbs 
                aria-label="breadcrumb"
                sx={{ 
                  flexGrow: 1,
                  minWidth: 0,
                  '& .MuiBreadcrumbs-ol': {
                    flexWrap: isMobile ? 'wrap' : 'nowrap'
                  }
                }}
                maxItems={isMobile ? 2 : undefined}
                itemsAfterCollapse={isMobile ? 1 : undefined}
                itemsBeforeCollapse={isMobile ? 1 : undefined}
              >
                {breadcrumbs.map((crumb, index) => {
                  const isLast = index === breadcrumbs.length - 1 && !selectedDocType;
                  return isLast ? (
                    <Typography key={crumb.id || 'home'} color="text.primary">
                      {crumb.name}
                    </Typography>
                  ) : (
                    <Link
                      key={crumb.id || 'home'}
                      underline="hover"
                      color="inherit"
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setCurrentFolder(crumb.id);
                      }}
                    >
                      {crumb.name}
                    </Link>
                  );
                })}
                {selectedDocType && (
                  <Chip
                    label={selectedDocType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    size="small"
                    onDelete={() => setSelectedDocType(null)}
                    color="primary"
                    variant="outlined"
                    sx={{ height: 22, fontSize: '12px' }}
                  />
                )}
              </Breadcrumbs>

              {/* Search Field and Action Buttons */}
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column',
                gap: 1,
                width: isMobile ? '100%' : 'auto',
                minWidth: 0, // Allow flex children to shrink
              }}>
                <Box sx={{
                  display: 'flex', 
                  flexDirection: isMobile ? 'column' : 'row',
                  alignItems: isMobile ? 'stretch' : 'center',
                  gap: 1,
                  flexWrap: 'nowrap', // Prevent wrapping to maintain consistent layout
                  overflow: 'hidden', // Contain long content
                }}>
                  <SearchBar
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                  />
                  <DeepSearchIndexer
                    progress={deepIndexProgress}
                    onStartIndexing={startDeepIndexing}
                    hasDeepIndex={hasDeepIndex}
                  />
                </Box>
                
              </Box>
            </Box>
          </>
        )}

        {/* Paste Button - always visible when clipboard has items */}
        {clipboardItem && (selectedFolders.size === 0 && selectedFiles.size === 0) && (
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'flex-end',
            mb: 2
          }}>
            <Button
              variant="outlined"
              color="primary"
              size="small"
              onClick={handlePaste}
              startIcon={<ContentPaste />}
            >
              Paste {hasMultipleItems ? `${clipboardItems.length} items` : `${clipboardItem.type}`} ({clipboardItem.operation})
            </Button>
          </Box>
        )}

        {/* Bulk Operations Toolbar */}
        {(selectedFolders.size > 0 || selectedFiles.size > 0) && (
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'primary.main',
            color: 'primary.contrastText',
            borderRadius: 1,
            p: 2,
            mb: 2,
            boxShadow: 1,
          }}>
            <Typography variant="body2" sx={{ fontWeight: 500, color: 'inherit' }}>
              {selectedFolders.size + selectedFiles.size} item{(selectedFolders.size + selectedFiles.size) !== 1 ? 's' : ''} selected
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {selectedFiles.size > 0 &&
               Array.from(selectedFiles).some(fileId => {
                 const file = files.find(f => f.id === fileId);
                 return file && file.sharedWith && file.sharedWith.length > 1;
               }) && (
                <Button
                  variant="contained"
                  color="warning"
                  size="small"
                  onClick={bulkUnshare}
                  startIcon={<Clear />}
                  sx={{ color: 'warning.contrastText' }}
                >
                  Unshare
                </Button>
              )}
              {clipboardItem && (
                <Button
                  variant="contained"
                  size="small"
                  onClick={handlePaste}
                  startIcon={<ContentPaste />}
                  sx={{
                    backgroundColor: 'success.main',
                    color: 'success.contrastText',
                    '&:hover': { backgroundColor: 'success.dark' }
                  }}
                >
                  Paste
                </Button>
              )}
              <Button
                variant="contained"
                size="small"
                onClick={bulkShare}
                disabled={selectedFolders.size === 0 && selectedFiles.size === 0}
                startIcon={<Share />}
                sx={{
                  backgroundColor: 'info.main',
                  color: 'info.contrastText',
                  '&:hover': { backgroundColor: 'info.dark' }
                }}
              >
                Share
              </Button>
              <Button
                variant="contained"
                size="small"
                onClick={bulkCopy}
                disabled={
                  (selectedFolders.size === 0 && selectedFiles.size === 0) ||
                  // Disable if all selected files are chats (can't be copied)
                  (selectedFolders.size === 0 && 
                   Array.from(selectedFiles).every(fileId => {
                     const file = files.find(f => f.id === fileId);
                     return file && (file as any).fileType === 'chat';
                   }))
                }
                startIcon={<ContentCopy />}
                sx={{
                  backgroundColor: 'secondary.main',
                  color: 'secondary.contrastText',
                  '&:hover': { backgroundColor: 'secondary.dark' }
                }}
              >
                Copy
              </Button>
              <Button
                variant="contained"
                size="small"
                onClick={bulkCut}
                disabled={selectedFolders.size === 0 && selectedFiles.size === 0}
                startIcon={<ContentCut />}
                sx={{
                  backgroundColor: 'orange',
                  color: 'white',
                  '&:hover': { backgroundColor: 'darkorange' }
                }}
              >
                Cut
              </Button>
              <Button
                variant="contained"
                color="error"
                size="small"
                onClick={showDeleteConfirmation}
                disabled={selectedFolders.size === 0 && selectedFiles.size === 0}
                startIcon={<Delete />}
              >
                Delete
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={clearAllSelections}
                sx={{
                  borderColor: 'rgba(255, 255, 255, 0.5)',
                  color: 'inherit',
                  '&:hover': {
                    borderColor: 'rgba(255, 255, 255, 0.8)',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)'
                  }
                }}
              >
                Clear
              </Button>
            </Box>
          </Box>
        )}

        {/* Empty State or File Table */}
        {(isArchivedView ? archivedFiles.length === 0 : filteredFiles.length === 0) && (isArchivedView ? archivedFolders.length === 0 : filteredFolders.length === 0) ? (
          isDataLoading ? (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '400px',
                width: '100%',
              }}
            >
              <CircularProgress size={60} />
            </Box>
          ) : hasLoadedOnce && !searchQuery.trim() ? (
            <EmptyState
              view={isRecentsView ? 'recents' : isFavoritesView ? 'favorites' : isSharedView ? 'shared' : isArchivedView ? 'archive' : 'home'}
              isRoot={!currentFolder && !isRecentsView && !isFavoritesView && !isSharedView && !isArchivedView}
              onUploadClick={() => {
                // Trigger file upload
                const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
                if (fileInput) fileInput.click();
              }}
              onNewFolderClick={() => setNewFolderDialogOpen(true)}
              onNewFormClick={() => {
                // Open form builder dialog
                setFormBuilderOpen(true);
              }}
              onNewChatClick={() => setNewChatDialogOpen(true)}
              hasContacts={hasContacts}
            />
          ) : searchQuery.trim() && hasLoadedOnce ? (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '400px',
                width: '100%',
                p: 3
              }}
            >
              <Typography variant="h6" color="text.secondary">
                {t('search.noResults', 'No results found for "{{query}}"', { query: searchQuery })}
              </Typography>
            </Box>
          ) : null
        ) : (
          <FileTable
            folders={isArchivedView ? archivedFolders : (isRecentsView || isFavoritesView || isSharedView || selectedDocType || (selectedTags && selectedTags.length > 0) ? [] : filteredFolders)}
            files={isArchivedView ? archivedFiles : filteredFiles}
            onFolderClick={setCurrentFolder}
            onFileClick={handleFormFileClick}
            onContextMenu={handleRightClick}
            onLongPressStart={handleLongPressStart}
            onLongPressEnd={handleLongPressEnd}
            onOpenMobileActionMenu={handleOpenMobileActionMenu}
            onToggleFavorite={handleToggleFavorite}
            userId={user?.uid}
            currentUserId={user?.uid}
            selectedFolders={selectedFolders}
            clipboardItem={clipboardItem}
            selectedFiles={selectedFiles}
            onToggleFolderSelection={toggleFolderSelection}
            onToggleFileSelection={toggleFileSelection}
            onMoveItem={handleMoveItem}
          />
        )}

        {/* Dialogs */}
        <NewFolderDialog
          open={newFolderDialogOpen}
          onClose={() => setNewFolderDialogOpen(false)}
          onCreate={handleCreateFolder}
        />

        {(fileToShare || folderToShare) && (
          <ShareDialog
            open={shareDialogOpen}
            onClose={() => setShareDialogOpen(false)}
            itemType={shareItemType}
            itemName={
              shareItemType === 'file' && fileToShare
                ? (typeof fileToShare.name === 'string' ? fileToShare.name : '[Encrypted]')
                : shareItemType === 'folder' && folderToShare
                ? (typeof folderToShare.name === 'string' ? folderToShare.name : '[Encrypted]')
                : ''
            }
            onShare={handleShare}
            onUnshare={handleUnshareFile}
            currentSharedWith={
              shareItemType === 'file' && fileToShare 
                ? (Array.isArray(fileToShare.sharedWith) ? fileToShare.sharedWith : [])
                : shareItemType === 'folder' && folderToShare
                ? (Array.isArray((folderToShare as any).sharedWith) ? (folderToShare as any).sharedWith : [])
                : []
            }
          />
        )}

        <ContextMenu
          open={!!contextMenu}
          mouseX={contextMenu?.mouseX ?? 0}
          mouseY={contextMenu?.mouseY ?? 0}
          itemType={contextMenu?.type ?? 'file'}
          hideCopy={contextMenu?.type === 'file' && (contextMenu.item as any)?.fileType === 'chat'}
          onClose={() => setContextMenu(null)}
          onShare={() => {
            if (contextMenu?.item) {
              if (contextMenu.type === 'file') {
                setFileToShare(contextMenu.item as FileData);
                setFolderToShare(null);
              } else {
                setFolderToShare(contextMenu.item as FolderData);
                setFileToShare(null);
              }
              setShareItemType(contextMenu.type);
              setShareDialogOpen(true);
              setContextMenu(null);
            }
          }}
          onRename={() => {
            if (contextMenu?.item) {
              const name = typeof contextMenu.item.name === 'string' ? contextMenu.item.name : '';
              setRenameDialog({ open: true, item: contextMenu.item, type: contextMenu.type, currentName: name });
              setContextMenu(null);
            }
          }}
          onCut={() => {
            if (contextMenu?.item) {
              cutItem(contextMenu.type, contextMenu.item);
              setContextMenu(null);
            }
          }}
          onCopy={() => {
            if (contextMenu?.item) {
              copyItem(contextMenu.type, contextMenu.item);
              setContextMenu(null);
            }
          }}
          onDelete={() => {
            if (contextMenu?.item) {
              showSingleDeleteConfirmation(contextMenu.item, contextMenu.type);
            }
          }}
          onArchive={contextMenu?.item ? () => handleArchiveItem(contextMenu.item, contextMenu.type) : undefined}
          onRestore={contextMenu?.item ? () => handleRestoreItem(contextMenu.item, contextMenu.type) : undefined}
          isArchiveView={isArchivedView}
          onEditForm={contextMenu?.type === 'file' && isFormFile(typeof contextMenu.item.name === 'string' ? contextMenu.item.name : '') ? handleEditForm : undefined}
        />

        <MobileActionMenu
          open={mobileActionMenu.open}
          onClose={() => setMobileActionMenu({ open: false, item: null, type: 'file' })}
          itemName={
            mobileActionMenu.item && typeof mobileActionMenu.item.name === 'string' 
              ? mobileActionMenu.item.name 
              : '[Encrypted]'
          }
          itemType={mobileActionMenu.type}
          hideCopy={mobileActionMenu.type === 'file' && (mobileActionMenu.item as FileData)?.fileType === 'chat'}
          isFavorite={mobileActionMenu.type === 'file' && mobileActionMenu.item && user ? 
            ((mobileActionMenu.item as FileData).userFavorites?.[user.uid] || false) : false}
          onOpen={mobileActionMenu.type === 'file' && mobileActionMenu.item ? () => {
            handleFormFileClick(mobileActionMenu.item as FileData);
            setMobileActionMenu({ open: false, item: null, type: 'file' });
          } : undefined}
          onDownload={mobileActionMenu.type === 'file' && mobileActionMenu.item && user && privateKey ? async () => {
            const file = mobileActionMenu.item as FileData;
            try {
              const content = await FileAccessService.loadFileContent(file, user.uid, privateKey);
              const fileName = typeof file.name === 'string' ? file.name : `file_${file.id}`;
              const blob = new Blob([content]);
              const url = URL.createObjectURL(blob);
              
              const link = document.createElement('a');
              link.href = url;
              link.download = fileName;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              
              URL.revokeObjectURL(url);
            } catch (error) {
              console.error('Error downloading file:', error);
                    }
            setMobileActionMenu({ open: false, item: null, type: 'file' });
          } : undefined}
          onToggleFavorite={mobileActionMenu.type === 'file' && mobileActionMenu.item ? () => {
            const fileId = mobileActionMenu.item!.id!;
            handleToggleFavorite(fileId);
            setMobileActionMenu({ open: false, item: null, type: 'file' });
          } : undefined}
          onShowInfo={() => {
            if (mobileActionMenu.item) {
              setFileInfoDialog({
                open: true,
                item: mobileActionMenu.item,
                type: mobileActionMenu.type,
              });
              setMobileActionMenu({ open: false, item: null, type: 'file' });
            }
          }}
          onShare={() => {
            if (mobileActionMenu.item) {
              if (mobileActionMenu.type === 'file') {
                setFileToShare(mobileActionMenu.item as FileData);
                setFolderToShare(null);
              } else {
                setFolderToShare(mobileActionMenu.item as FolderData);
                setFileToShare(null);
              }
              setShareItemType(mobileActionMenu.type);
              setShareDialogOpen(true);
              setMobileActionMenu({ open: false, item: null, type: 'file' });
            }
          }}
          onRename={() => {
            if (mobileActionMenu.item) {
              const name = typeof mobileActionMenu.item.name === 'string' ? mobileActionMenu.item.name : '';
              setRenameDialog({ open: true, item: mobileActionMenu.item, type: mobileActionMenu.type, currentName: name });
              setMobileActionMenu({ open: false, item: null, type: 'file' });
            }
          }}
          onCut={() => {
            if (mobileActionMenu.item) {
              cutItem(mobileActionMenu.type, mobileActionMenu.item);
              setMobileActionMenu({ open: false, item: null, type: 'file' });
            }
          }}
          onCopy={() => {
            if (mobileActionMenu.item) {
              copyItem(mobileActionMenu.type, mobileActionMenu.item);
              setMobileActionMenu({ open: false, item: null, type: 'file' });
            }
          }}
          onDelete={() => {
            if (mobileActionMenu.item) {
              showSingleDeleteConfirmation(mobileActionMenu.item, mobileActionMenu.type);
            }
          }}
          onArchive={mobileActionMenu.item ? () => {
            handleArchiveItem(mobileActionMenu.item!, mobileActionMenu.type);
          } : undefined}
          onRestore={mobileActionMenu.item ? () => {
            handleRestoreItem(mobileActionMenu.item!, mobileActionMenu.type);
          } : undefined}
          isArchiveView={isArchivedView}
        />

        <RenameDialog
          open={renameDialog.open}
          onClose={() => setRenameDialog({ open: false, item: null, type: 'file', currentName: '' })}
          onRename={async (newName: string) => {
            if (renameDialog.item && user && privateKey) {
              try {
                if (renameDialog.type === 'file') {
                  const fileData = renameDialog.item as FileData;

                  // Invalidate cache BEFORE updating to ensure fresh decrypt
                  metadataCache.invalidate(renameDialog.item.id!);

                  // Use the new per-user names service to set personalized name
                  const { setUserFileName } = await import('../services/userNamesManagement');
                  await setUserFileName(
                    renameDialog.item.id!,
                    newName,
                    user.uid,
                    privateKey,
                    fileData
                  );

                  // Update local state immediately with the new name
                  setFiles(prevFiles => prevFiles.map(f => 
                    f.id === renameDialog.item?.id 
                      ? { ...f, name: newName }
                      : f
                  ));
                  setFilteredFiles(prevFiles => prevFiles.map(f => 
                    f.id === renameDialog.item?.id 
                      ? { ...f, name: newName }
                      : f
                  ));
                } else {
                  // Invalidate cache since folder name changed
                  metadataCache.invalidate(renameDialog.item.id!);
                  await renameFolderWithEncryption(renameDialog.item.id!, newName, user.uid);
                }
                setRenameDialog({ open: false, item: null, type: 'file', currentName: '' });
              } catch (error) {
                console.error('Rename operation failed:', error);
              }
            }
          }}
          currentName={renameDialog.currentName}
          itemType={renameDialog.type}
        />

        {selectedFormFile && formViewerOpen && (
          <Suspense fallback={<CircularProgress />}>
            <FormFileViewer
              file={selectedFormFile}
              userId={user?.uid || ''}
              privateKey={privateKey || ''}
              onEdit={handleEditForm}
              onClose={handleFormCancel}
              onDownload={handleDownloadFormFile}
              onShare={() => {
                // Find the most up-to-date file data from the files array
                const currentFile = files.find(f => f.id === selectedFormFile?.id) || selectedFormFile;
                setFileToShare(currentFile);
                setFolderToShare(null);
                setShareItemType('file');
                setShareDialogOpen(true);
              }}
            />

          </Suspense>
        )}

        {/* File Viewer for regular files */}
        <Suspense fallback={<div />}>
          <FileViewer
            open={fileViewerOpen}
            file={selectedFile}
            fileContent={fileContent}
            loading={fileContentLoading}
            onClose={handleCloseFileViewer}
            onDownload={handleDownloadFile}
            userId={user?.uid || ''}
            onShare={() => {
              if (selectedFile) {
                setFileToShare(selectedFile);
                setShareDialogOpen(true);
              }
            }}
          />
        </Suspense>
        
        {/* Chat Viewer for chat conversations */}
        {selectedConversationId && (
          <Suspense fallback={<div />}>
            <ChatViewer
              open={chatViewerOpen}
              conversationId={selectedConversationId}
              onClose={handleCloseChatViewer}
              onShare={handleShareChat}
            />
          </Suspense>
        )}

        {/* New Chat Dialog */}
        <Dialog
          open={newChatDialogOpen}
          onClose={() => setNewChatDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>{t('mainContent.newChat')}</DialogTitle>
          <DialogContent>
            <ContactSelector
              currentUserId={user?.uid || ''}
              selectedContacts={selectedContacts}
              onSelectionChange={setSelectedContacts}
              privateKey={privateKey || undefined}
              includeGroups={true}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setNewChatDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleCreateNewChat}
              disabled={selectedContacts.length === 0}
            >
              Start Chat
            </Button>
          </DialogActions>
        </Dialog>

        {/* FormInstanceFiller for new and existing forms */}
        {(formFillerOpen || (formEditorOpen && (selectedFormData || unsavedFormData))) && (
          <Suspense fallback={<div />}>
            <FormInstanceFiller
              userId={user?.uid || ''}
              privateKey={privateKey || ''}
              parentFolder={currentFolder}
              existingFormData={selectedFormData || unsavedFormData}
              existingFile={selectedFormFile}
              onSave={(fileId) => {
                handleFormSave(fileId);
                if (formEditorOpen && unsavedFormData) {
                  setFormEditorOpen(false);
                  setUnsavedFormData(null);
                }
              }}
              onCancel={() => {
                handleFormCancel();
                if (formEditorOpen && unsavedFormData) {
                  setFormEditorOpen(false);
                  setUnsavedFormData(null);
                }
              }}
            />
          </Suspense>
        )}

        <Suspense fallback={<div />}>
          <FormBuilder
            open={formBuilderOpen}
            onClose={() => setFormBuilderOpen(false)}
            userId={user?.uid || ''}
            privateKey={privateKey || ''}
            parentFolder={currentFolder}
            initialTemplateId={searchParams.get('createForm') || undefined}
            onFormCreated={async (fileId: string | null, formData?: SecureFormData) => {
              setFormBuilderOpen(false);
              
              if (formData && !fileId) {
                // New behavior: Open form editor with unsaved form data
                setUnsavedFormData(formData);
                setFormEditorOpen(true);
              } else if (fileId) {
                // Old behavior: Open existing saved form
                setTimeout(() => {
                  handleFormFileClick({ id: fileId });
                }, 500);
              }
            }}
          />
        </Suspense>

        <CreationFAB
          onCreateFolder={() => setNewFolderDialogOpen(true)}
          onUploadFiles={handleUploadClick}
          onCreateForm={() => {
            setFormBuilderOpen(true);
          }}
          onCreateChat={() => {
            setNewChatDialogOpen(true);
          }}
          onPaste={handlePaste}
          showPaste={!!clipboardItem}
        />

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
          <DialogTitle>{t('mainContent.confirmDelete')}</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Delete {selectedFolders.size} folder{selectedFolders.size !== 1 ? 's' : ''} and {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''}? This can't be undone.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmBulkDelete} color="error" variant="contained">
              Delete
            </Button>
          </DialogActions>
        </Dialog>

        {/* Single Item Delete Confirmation Dialog */}
        <Dialog open={singleDeleteConfirmOpen} onClose={() => setSingleDeleteConfirmOpen(false)}>
          <DialogTitle>
            {itemToDelete?.type === 'file' && (itemToDelete.item as FileData).owner !== user?.uid
              ? t('mainContent.removeFileAccess')
              : t('mainContent.confirmDelete')}
          </DialogTitle>
          <DialogContent>
            <DialogContentText>
              {itemToDelete?.type === 'file' && (itemToDelete.item as FileData).owner !== user?.uid ? (
                <>
                  {t('mainContent.removeAccessQuestion')}
                  <br />
                  <strong>{itemToDelete && typeof itemToDelete.item.name === 'string' ? itemToDelete.item.name : '[Encrypted]'}</strong>
                  <br /><br />
                  {t('mainContent.fileRemainsAvailable')}
                </>
              ) : (
                <>
                  {t('mainContent.areYouSureDelete', { type: itemToDelete?.type })}
                  <br />
                  <strong>{itemToDelete && typeof itemToDelete.item.name === 'string' ? itemToDelete.item.name : '[Encrypted]'}</strong>
                  <br /><br />
                  {t('mainContent.actionCannotBeUndone')}
                </>
              )}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSingleDeleteConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={confirmSingleDelete} color="error" variant="contained">
              {itemToDelete?.type === 'file' && (itemToDelete.item as FileData).owner !== user?.uid
                ? t('mainContent.removeAccess')
                : t('common.delete')}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Copy Options Dialog */}
        <Dialog 
          open={copyOptionsOpen} 
          onClose={() => {
            setCopyOptionsOpen(false);
            setItemToCopy(null);
            setPreserveSharing(false);
          }}
        >
          <DialogTitle>{t('mainContent.copyOptions')}</DialogTitle>
          <DialogContent>
            <DialogContentText>
              <strong>{itemToCopy && typeof itemToCopy.item.name === 'string' ? itemToCopy.item.name : '[Encrypted]'}</strong>
            </DialogContentText>
            <FormControlLabel
              control={
                <Checkbox
                  checked={preserveSharing}
                  onChange={(e) => setPreserveSharing(e.target.checked)}
                />
              }
              label={t('common.shareWithSamePeople', 'Share with the same people')}
              sx={{ mt: 2 }}
            />
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => {
                setCopyOptionsOpen(false);
                setItemToCopy(null);
                setPreserveSharing(false);
                clearClipboard(); // Clear clipboard when user cancels
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                try {
                  if (itemToCopy) {
                    if (itemToCopy.type === 'file') {
                      await copyFile(itemToCopy.item as FileData, preserveSharing);
                    } else {
                      await copyFolder(itemToCopy.item as FolderData);
                    }
                  }
                  // Clear clipboard only after successful completion
                  clearClipboard();
                } catch (error) {
                  console.error('Copy operation failed:', error);
                  // Don't clear clipboard if copy failed
                } finally {
                  setCopyOptionsOpen(false);
                  setItemToCopy(null);
                  setPreserveSharing(false);
                }
              }}
              color="primary"
              variant="contained"
            >
              Copy
            </Button>
          </DialogActions>
        </Dialog>

        {/* File Info Dialog */}
        <FileInfoDialog
          open={fileInfoDialog.open}
          onClose={() => setFileInfoDialog({ open: false, item: null, type: 'file' })}
          item={fileInfoDialog.item}
          itemType={fileInfoDialog.type}
          isFavorite={fileInfoDialog.type === 'file' && fileInfoDialog.item && user ? 
            ((fileInfoDialog.item as FileData).userFavorites?.[user.uid] || false) : false}
          ownerName={fileInfoDialog.item?.owner ? undefined : undefined} // TODO: Load owner name
        />

        {/* Archive Help Dialog */}
        <Dialog open={archiveHelpOpen} onClose={() => setArchiveHelpOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HelpOutline fontSize="small" color="primary" />
            {t('mainContent.archiveHelpTitle')}
          </DialogTitle>
          <DialogContent>
            <DialogContentText>
              {t('mainContent.archiveHelpDescription')}
            </DialogContentText>
            <DialogContentText sx={{ mt: 2 }}>
              {t('mainContent.archiveHelpRestore')}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setArchiveHelpOpen(false)}>{t('common.close')}</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </FileUploadArea>
  );
};

const MainContent = forwardRef<MainContentRef, MainContentProps>(MainContentComponent);

MainContent.displayName = 'MainContent';

export default MainContent;
