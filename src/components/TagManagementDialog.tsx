import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  CircularProgress,
  Chip,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { LocalOffer, Close } from '@mui/icons-material';
import TagInput from './TagInput';
import { getUserTags } from '../services/userTagsManagement';
import { type FileData } from '../files';
import { useMetadata } from '../context/MetadataContext';

interface TagManagementDialogProps {
  open: boolean;
  onClose: () => void;
  file: FileData | null;
  userId: string;
  userPrivateKey: string;
  allFiles?: FileData[];
}

const TagManagementDialog: React.FC<TagManagementDialogProps> = ({
  open,
  onClose,
  file,
  userId,
  userPrivateKey,
  allFiles = []
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { triggerTagRefresh } = useMetadata();
  const [loading, setLoading] = useState(false);
  const [currentTags, setCurrentTags] = useState<string[]>([]);

  // Load current tags when dialog opens
  useEffect(() => {
    const loadTags = async () => {
      if (!file || !userId || !userPrivateKey) return;
      
      try {
        setLoading(true);
        const tags = await getUserTags(file, userId, userPrivateKey);
        setCurrentTags(tags);
      } catch (error) {
        console.error('Error loading tags:', error);
      } finally {
        setLoading(false);
      }
    };

    if (open) {
      loadTags();
    }
  }, [open, file, userId, userPrivateKey]);

  const handleTagsChange = (newTags: string[]) => {
    setCurrentTags(newTags);
  };

  const handleClose = () => {
    onClose();
    // Reset state when closing
    setTimeout(() => {
      setCurrentTags([]);
      setLoading(false);
    }, 300);
  };

  if (!file) return null;

  const fileName = typeof file.name === 'string' ? file.name : '[Encrypted File]';

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          borderRadius: isMobile ? 0 : 2,
          margin: isMobile ? 0 : 1
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LocalOffer color="primary" />
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6">Manage Tags</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {fileName}
          </Typography>
        </Box>
        {isMobile && (
          <Button
            onClick={handleClose}
            size="small"
            sx={{ minWidth: 'auto', p: 1 }}
          >
            <Close />
          </Button>
        )}
      </DialogTitle>

      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ py: 2 }}>
            {/* Current Tags Section */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 2 }}>
                Current Tags {currentTags.length > 0 && `(${currentTags.length})`}
              </Typography>
              {currentTags.length > 0 ? (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {currentTags.map((tag) => (
                    <Chip
                      key={tag}
                      label={tag}
                      onDelete={() => {
                        const newTags = currentTags.filter(t => t !== tag);
                        handleTagsChange(newTags);
                      }}
                      size={isMobile ? "small" : "medium"}
                      color="primary"
                      variant="filled"
                    />
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  No tags assigned to this file
                </Typography>
              )}
            </Box>

            {/* Add Tags Section */}
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Add New Tags
            </Typography>
            <TagInput
              file={file}
              userId={userId}
              userPrivateKey={userPrivateKey}
              onTagsChange={(newTags) => {
                handleTagsChange(newTags);
                // Trigger tag refresh in sidebar after tags are saved
                triggerTagRefresh();
              }}
              allFiles={allFiles}
              size={isMobile ? "small" : "medium"}
            />

            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Tags help organize and search your files. They are private and encrypted.
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 1 }}>
        <Button
          onClick={handleClose}
          variant="contained"
          color="primary"
          startIcon={<Close />}
        >
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TagManagementDialog;