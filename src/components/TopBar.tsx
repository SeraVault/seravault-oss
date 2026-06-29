import React from 'react';
import { AppBar, Toolbar, Button, Box, IconButton } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import SecurityStatusIndicator from './SecurityStatusIndicator';
import UserAvatar from './UserAvatar';
import NotificationBell from './NotificationBell';
import InstallButton from './InstallButton';

interface TopBarProps {
  handleDrawerToggle: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ handleDrawerToggle }) => {
  const { user } = useAuth();
  const { t } = useTranslation();

  return (
    <AppBar 
      position="fixed" 
      sx={{ 
        zIndex: (theme) => theme.zIndex.drawer + 1,
        bgcolor: (theme) => theme.palette.mode === 'light' ? '#1a1a1a' : undefined,
        color: 'white',
      }}
    >
      <Toolbar>
        <IconButton
          color="inherit"
          aria-label={t('navigation.openDrawer', 'open drawer')}
          edge="start"
          onClick={handleDrawerToggle}
          sx={{ mr: 2 }}
        >
          <MenuIcon />
        </IconButton>
        <Box 
          component={Link} 
          to="/" 
          sx={{ 
            flexGrow: 1, 
            display: 'flex', 
            alignItems: 'center',
            textDecoration: 'none',
            gap: 1
          }}
        >
          <img 
            src="/seravault_logo.svg" 
            alt="SeraVault" 
            style={{ height: '32px', width: 'auto' }}
          />
        </Box>
        {user ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
            <InstallButton />
            <SecurityStatusIndicator />
            <NotificationBell />
            <UserAvatar />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button color="inherit" component={Link} to="/login">
              {t('auth.login', 'Login')}
            </Button>
            <Button color="inherit" component={Link} to="/signup">
              {t('auth.signUp', 'Sign Up')}
            </Button>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
};

export default TopBar;