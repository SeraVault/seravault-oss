import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Alert,
} from '@mui/material';
import { useTranslation } from 'react-i18next';

interface RenameDialogProps {
  open: boolean;
  onClose: () => void;
  onRename: (newName: string) => void;
  currentName: string;
  itemType: 'file' | 'folder';
}

const RenameDialog: React.FC<RenameDialogProps> = ({
  open,
  onClose,
  onRename,
  currentName,
  itemType,
}) => {
  const { t } = useTranslation();
  const [newName, setNewName] = useState(currentName);
  
  // Check if this is a form file with category extension
  const isFormFile = currentName.endsWith('.form');
  const hasFormCategory = isFormFile && currentName.split('.').length >= 3;

  useEffect(() => {
    setNewName(currentName);
  }, [currentName, open]);

  const handleSubmit = () => {
    if (newName.trim() && newName !== currentName) {
      onRename(newName.trim());
    }
    onClose();
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Rename {itemType}</DialogTitle>
      <DialogContent>
        {hasFormCategory && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('files.rename.formExtensionWarning')}
          </Alert>
        )}
        <TextField
          autoFocus
          margin="dense"
          label={`${itemType} name`}
          fullWidth
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyPress={handleKeyPress}
          variant="outlined"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained"
          disabled={!newName.trim() || newName === currentName}
        >
          Rename
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RenameDialog;