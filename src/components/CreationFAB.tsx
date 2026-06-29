import React, { useState } from 'react';
import {
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  Add,
  CreateNewFolder,
  Upload,
  Description,
  ContentPaste,
  Chat,
} from '@mui/icons-material';

interface CreationFABProps {
  onCreateFolder: () => void;
  onUploadFiles: () => void;
  onCreateForm: () => void;
  onCreateChat: () => void;
  onPaste?: () => void;
  showPaste?: boolean;
}

const CreationFAB: React.FC<CreationFABProps> = ({
  onCreateFolder,
  onUploadFiles,
  onCreateForm,
  onCreateChat,
  onPaste,
  showPaste = false,
}) => {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  const pasteAction = showPaste && onPaste ? {
    icon: <ContentPaste />,
    name: t('fab.paste'),
    action: () => {
      setOpen(false);
      onPaste();
    },
    isPaste: true
  } : null;

  const regularActions: Array<{ icon: React.ReactElement; name: string; action: () => void; isPaste?: boolean }> = [
    {
      icon: <CreateNewFolder />,
      name: t('fab.newFolder'),
      action: () => {
        setOpen(false);
        onCreateFolder();
      }
    },
    {
      icon: <Chat />,
      name: t('fab.newChat', 'New Chat'),
      action: () => {
        setOpen(false);
        onCreateChat();
      }
    },
    {
      icon: <Upload />,
      name: t('fab.uploadFiles'),
      action: () => {
        setOpen(false);
        onUploadFiles();
      }
    },
    {
      icon: <Description />,
      name: t('fab.newForm'),
      action: () => {
        setOpen(false);
        onCreateForm();
      }
    },
  ];

  const actions = pasteAction ? [pasteAction, ...regularActions] : regularActions;

  return (
    <SpeedDial
      ariaLabel={t('fab.createNewItem')}
      sx={{ 
        position: 'fixed', 
        bottom: 32, 
        right: 32,
        zIndex: 1300, // Higher z-index for better prominence
        '& .MuiFab-root': {
          width: 64,
          height: 64,
          boxShadow: showPaste 
            ? '0 8px 16px rgba(25, 118, 210, 0.4), 0 4px 8px rgba(0, 0, 0, 0.2), 0 0 0 2px rgba(25, 118, 210, 0.3)'
            : '0 8px 16px rgba(25, 118, 210, 0.3), 0 4px 8px rgba(0, 0, 0, 0.15)',
          backgroundColor: showPaste ? 'secondary.main' : 'primary.main',
          animation: showPaste ? 'pulse 2s infinite' : 'none',
          '&:hover': {
            backgroundColor: showPaste ? 'secondary.dark' : 'primary.dark',
            transform: 'scale(1.05)',
            boxShadow: showPaste
              ? '0 12px 24px rgba(25, 118, 210, 0.5), 0 6px 12px rgba(0, 0, 0, 0.25), 0 0 0 3px rgba(25, 118, 210, 0.4)'
              : '0 12px 24px rgba(25, 118, 210, 0.4), 0 6px 12px rgba(0, 0, 0, 0.2)',
          },
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          '@keyframes pulse': {
            '0%': {
              transform: 'scale(1)',
            },
            '50%': {
              transform: 'scale(1.02)',
            },
            '100%': {
              transform: 'scale(1)',
            },
          },
        },
        '& .MuiSpeedDialIcon-root': {
          fontSize: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
        '& .MuiSpeedDialIcon-icon': {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
      }}
      icon={<SpeedDialIcon icon={<Add />} />}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
    >
      {actions.map((action) => (
        <SpeedDialAction
          key={action.name}
          icon={action.icon}
          tooltipTitle={action.name}
          tooltipOpen
          onClick={action.action}
          sx={{
            '& .MuiFab-root': {
              boxShadow: action.isPaste
                ? '0 4px 8px rgba(156, 39, 176, 0.25), 0 0 0 2px rgba(156, 39, 176, 0.2)'
                : '0 4px 8px rgba(0, 0, 0, 0.15)',
              backgroundColor: action.isPaste ? 'secondary.main' : 'background.paper',
              color: action.isPaste ? 'secondary.contrastText' : 'text.primary',
              '&:hover': {
                transform: 'scale(1.1)',
                boxShadow: action.isPaste
                  ? '0 6px 12px rgba(156, 39, 176, 0.35), 0 0 0 3px rgba(156, 39, 176, 0.3)'
                  : '0 6px 12px rgba(0, 0, 0, 0.25)',
                backgroundColor: action.isPaste ? 'secondary.dark' : 'action.hover',
              },
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            },
            '& .MuiSpeedDialAction-staticTooltipLabel': {
              backgroundColor: action.isPaste ? 'secondary.main' : 'background.paper',
              color: action.isPaste ? 'secondary.contrastText' : 'text.primary',
              border: '1px solid',
              borderColor: action.isPaste ? 'secondary.main' : 'divider',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              fontSize: '0.875rem',
              fontWeight: action.isPaste ? 600 : 500,
              whiteSpace: 'nowrap',
              borderRadius: '8px',
              padding: '6px 12px',
              minWidth: 'auto',
            }
          }}
        />
      ))}
    </SpeedDial>
  );
};

export default CreationFAB;