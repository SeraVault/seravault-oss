import React from 'react';
import { IconButton, Tooltip } from '@mui/material';
import { Brightness4, Brightness7 } from '@mui/icons-material';
import { useThemeContext } from '../theme/ThemeContext';

const ThemeSwitcher: React.FC = () => {
  const { mode, toggleTheme } = useThemeContext();

  return (
    <Tooltip title={`Switch to ${mode === 'light' ? 'dark' : 'light'} theme`}>
      <IconButton
        onClick={toggleTheme}
        color="inherit"
        size="medium"
        sx={{
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            transform: 'rotate(180deg)',
          }
        }}
      >
        {mode === 'light' ? <Brightness4 /> : <Brightness7 />}
      </IconButton>
    </Tooltip>
  );
};

export default ThemeSwitcher;