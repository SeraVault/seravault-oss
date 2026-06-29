import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import AppLayout from './AppLayout';
import type { FileData } from '../files';
/**
 * PersistentLayout wraps all authenticated routes and provides a shared AppLayout
 * This prevents TopBar and SideNav from remounting on route changes
 */
const PersistentLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  
  // Shared state for folder navigation
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  
  // Tag filtering state
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [matchAllTags, setMatchAllTags] = useState(false);
  const [files, setFiles] = useState<FileData[]>([]);

  // Initialize folder from URL parameters (for HomePage)
  useEffect(() => {
    if (location.pathname === '/') {
      const folderParam = searchParams.get('folder');
      if (folderParam && folderParam !== '') {
        setCurrentFolder(folderParam);
      } else {
        setCurrentFolder(null);
      }
    }
  }, [location.pathname, searchParams]);

  // Handle folder navigation by updating the URL
  const handleFolderNavigation = (folderId: string | null) => {
    setCurrentFolder(folderId);
    if (location.pathname === '/') {
      navigate(`/?folder=${folderId || ''}`, { replace: true });
    }
  };

  // Determine if we should show the sidebar based on route
  const shouldShowSidebar = !['/login', '/signup'].includes(location.pathname);

  if (!shouldShowSidebar) {
    // For login/signup pages, just render the page without layout
    return <Outlet />;
  }

  return (
    <AppLayout
      currentFolder={currentFolder}
      setCurrentFolder={handleFolderNavigation}
      userId={user?.uid}
      userPrivateKey={privateKey || undefined}
      selectedTags={selectedTags}
      onTagSelectionChange={setSelectedTags}
      matchAllTags={matchAllTags}
      onMatchModeChange={setMatchAllTags}
      files={files}
    >
      {/* Outlet renders the matched child route */}
      {/* Pass context down to pages that need it */}
      <Outlet context={{ 
        currentFolder, 
        setCurrentFolder: handleFolderNavigation, 
        selectedTags, 
        setSelectedTags, 
        matchAllTags, 
        setMatchAllTags, 
        files,
        setFiles
      }} />
    </AppLayout>
  );
};

export default PersistentLayout;
