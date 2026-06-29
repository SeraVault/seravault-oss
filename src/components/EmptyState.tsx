import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Typography, Paper, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
  CloudUpload,
  CreateNewFolder,
  NoteAdd,
  Add,
  Chat
} from '@mui/icons-material';

interface EmptyStateProps {
  onUploadClick?: () => void;
  onNewFolderClick?: () => void;
  onNewFormClick?: () => void;
  onNewChatClick?: () => void;
  hasContacts?: boolean;
  view?: 'home' | 'recents' | 'favorites' | 'shared' | 'archive';
  isRoot?: boolean;
}

export const EmptyState = ({
  onUploadClick,
  onNewFolderClick,
  onNewFormClick,
  onNewChatClick,
  hasContacts = false,
  view = 'home',
  isRoot = true
}: EmptyStateProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const getEmptyStateContent = () => {
    switch (view) {
      case 'recents':
        return {
          title: t('emptyState.recents.title'),
          subtitle: t('emptyState.recents.subtitle'),
          icon: null
        };
      case 'favorites':
        return {
          title: t('emptyState.favorites.title'),
          subtitle: t('emptyState.favorites.subtitle'),
          icon: null
        };
      case 'shared':
        return {
          title: t('emptyState.shared.title'),
          subtitle: t('emptyState.shared.subtitle'),
          icon: null
        };
      case 'archive':
        return {
          title: t('emptyState.archive.title', 'Archive is empty'),
          subtitle: t('emptyState.archive.subtitle', 'Files and folders you archive will appear here.'),
          icon: null
        };
      default:
        if (isRoot) {
          return {
            title: t('emptyState.home.title'),
            subtitle: t('emptyState.home.subtitle'),
            icon: <Add sx={{ fontSize: 80, color: 'primary.main', mb: 2 }} />
          };
        } else {
          return {
            title: t('emptyState.folder.title'),
            subtitle: t('emptyState.folder.subtitle'),
            icon: <CreateNewFolder sx={{ fontSize: 80, color: 'text.secondary', mb: 2 }} />
          };
        }
    }
  };

  const { title, subtitle, icon } = getEmptyStateContent();
  const isHome = view === 'home';

  return (
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
      <Paper
        elevation={0}
        sx={{
          p: 4,
          maxWidth: '600px',
          textAlign: 'center',
          backgroundColor: 'background.default',
          border: '2px dashed',
          borderColor: 'divider',
          borderRadius: 2
        }}
      >
        {icon}
        <Typography variant="h5" gutterBottom color="text.primary" sx={{ fontWeight: 500 }}>
          {title}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          {subtitle}
        </Typography>

        {isHome && (
          <>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                {onUploadClick && (
                  <Button
                    variant="contained"
                    startIcon={<CloudUpload />}
                    onClick={onUploadClick}
                    size="large"
                  >
                    Upload File
                  </Button>
                )}
                {onNewFolderClick && (
                  <Button
                    variant="outlined"
                    startIcon={<CreateNewFolder />}
                    onClick={onNewFolderClick}
                    size="large"
                  >
                    New Folder
                  </Button>
                )}
                {onNewFormClick && (
                  <Button
                    variant="outlined"
                    startIcon={<NoteAdd />}
                    onClick={onNewFormClick}
                    size="large"
                  >
                    Create Form
                  </Button>
                )}
                {hasContacts && onNewChatClick && (
                  <Button
                    variant="outlined"
                    startIcon={<Chat />}
                    onClick={onNewChatClick}
                    size="large"
                  >
                    Start Chat
                  </Button>
                )}
              </Box>
            </Box>

            <Box
              sx={{
                mt: 4,
                pt: 3,
                borderTop: '1px solid',
                borderColor: 'divider'
              }}
            >
              <Typography variant="body2" color="text.secondary" gutterBottom sx={{ fontWeight: 500 }}>
                💡 Tips:
              </Typography>
              <Box sx={{ textAlign: 'left', mt: 2, mx: 'auto', maxWidth: '500px' }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>• Upload or create:</strong> Use the ➕ button in the bottom-right to upload files, create forms, start a chat, or add a folder.
                </Typography>
                {!hasContacts ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    <strong>• Chat &amp; sharing require contacts:</strong> The chat and file sharing features become available once you have contacts.{' '}
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{ color: 'primary.main', cursor: 'pointer', fontWeight: 500 }}
                      onClick={() => navigate('/contacts')}
                    >
                      Go to Contacts →
                    </Typography>
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    <strong>• Share files:</strong> Right-click any file and select "Share" to collaborate with your contacts.
                  </Typography>
                )}
                <Typography variant="body2" color="text.secondary">
                  <strong>• Forms:</strong> Store structured data like passwords, bank details, or any custom fields — all end-to-end encrypted.
                </Typography>
              </Box>
            </Box>
          </>
        )}
      </Paper>
    </Box>
  );
};

export default React.memo(EmptyState);
