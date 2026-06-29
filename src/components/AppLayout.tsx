import React, { useState } from 'react';
import { Box, Toolbar } from '@mui/material';
import TopBar from './TopBar';
import SideNav from './SideNav';
import type { FileData } from '../files';
const drawerWidth = 240;

interface AppLayoutProps {
  children: React.ReactNode;
  currentFolder?: string | null;
  setCurrentFolder?: (folderId: string | null) => void;
  userId?: string;
  userPrivateKey?: string;
  selectedTags?: string[];
  onTagSelectionChange?: (tags: string[]) => void;
  matchAllTags?: boolean;
  onMatchModeChange?: (matchAll: boolean) => void;
  files?: FileData[];
}

const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  currentFolder,
  setCurrentFolder,
  userId,
  userPrivateKey,
  selectedTags,
  onTagSelectionChange,
  matchAllTags,
  onMatchModeChange,
  files,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false); // For mobile drawer overlay
  const [desktopOpen, setDesktopOpen] = useState(true); // For desktop drawer visibility
  const [collapsed, setCollapsed] = useState(false);

  const handleDrawerToggle = () => {
    // Toggle mobile drawer for mobile, desktop drawer for desktop
    const isMobile = window.innerWidth < 600; // Same breakpoint as theme.breakpoints.down('sm')
    if (isMobile) {
      setMobileOpen(!mobileOpen);
    } else {
      setDesktopOpen(!desktopOpen);
    }
  };

  const handleToggleCollapse = () => {
    setCollapsed(!collapsed);
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <TopBar handleDrawerToggle={handleDrawerToggle} />
      {currentFolder !== undefined && setCurrentFolder && (
        <SideNav
          drawerWidth={drawerWidth}
          mobileOpen={mobileOpen}
          desktopOpen={desktopOpen}
          handleDrawerToggle={handleDrawerToggle}
          currentFolder={currentFolder}
          setCurrentFolder={setCurrentFolder}
          collapsed={collapsed}
          onToggleCollapse={handleToggleCollapse}
          userId={userId}
          userPrivateKey={userPrivateKey}
          selectedTags={selectedTags}
          onTagSelectionChange={onTagSelectionChange}
          matchAllTags={matchAllTags}
          onMatchModeChange={onMatchModeChange}
          files={files}
        />
      )}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 1, sm: 3 },
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
          position: 'relative',
          minHeight: 0,
        }}
      >
        <Toolbar />
        <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default AppLayout;
