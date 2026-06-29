import React from 'react';
import { Box, Button, useTheme, useMediaQuery } from '@mui/material';
import { useClipboard } from '../context/ClipboardContext';

interface ActionButtonsProps {
  onNewFolder: () => void;
  onUploadClick?: () => void;
  onNewForm: () => void;
  onPaste?: () => void;
}

const ActionButtons: React.FC<ActionButtonsProps> = ({
  onNewFolder,
  onUploadClick,
  onNewForm,
  onPaste,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { clipboardItem } = useClipboard();

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: isMobile ? 'stretch' : 'center',
      gap: 1,
      width: isMobile ? '100%' : 'auto'
    }}>
      <Button 
        variant="contained" 
        onClick={onNewFolder}
        size={isMobile ? 'large' : 'medium'}
        fullWidth={isMobile}
      >
        New Folder
      </Button>
      
      <Button 
        variant="contained" 
        onClick={onUploadClick}
        size={isMobile ? 'large' : 'medium'}
        fullWidth={isMobile}
      >
        Upload Files
      </Button>
      
      <Button 
        variant="contained" 
        onClick={onNewForm}
        size={isMobile ? 'large' : 'medium'}
        fullWidth={isMobile}
      >
        New Form
      </Button>
      
      {clipboardItem && onPaste && (
        <Button 
          variant="outlined" 
          onClick={onPaste}
          size={isMobile ? 'large' : 'medium'}
          fullWidth={isMobile}
        >
          Paste {clipboardItem.type}
        </Button>
      )}
    </Box>
  );
};

export default ActionButtons;