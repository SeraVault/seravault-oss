import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Alert,
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  LinearProgress,
  CircularProgress,
} from '@mui/material';
import {
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  FolderZip as FolderZipIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

interface ExportDataDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (saveToDirectory: boolean) => Promise<void>;
}

const ExportDataDialog: React.FC<ExportDataDialogProps> = ({ open, onClose, onConfirm }) => {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    
    try {
      // Always use ZIP file download (saveToDirectory = false)
      await onConfirm(false);
      onClose();
    } catch (err: unknown) {
      console.error('Export failed:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || t('profile.exportFailed', 'Export Failed'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={exporting ? undefined : onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <WarningIcon color="error" fontSize="large" />
          <Typography variant="h6">
            {t('profile.exportWarningTitle', '⚠️ Critical Security Warning')}
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Alert severity="error" sx={{ mb: 3 }}>
          <Typography variant="body1" fontWeight="bold" gutterBottom>
            {t('profile.exportWarningDesc', 'You are about to export ALL your data in UNENCRYPTED format. This includes all files, forms, and metadata.')}
          </Typography>
        </Alert>

        {/* Security Risks */}
        <Typography variant="h6" color="error" gutterBottom sx={{ mt: 2 }}>
          {t('profile.exportRisks', 'Security Risks:')}
        </Typography>
        <List dense>
          <ListItem>
            <ListItemIcon>
              <ErrorIcon color="error" />
            </ListItemIcon>
            <ListItemText 
              primary={t('profile.exportRisk1', 'Anyone who gains access to the exported files can read ALL your data')}
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <ErrorIcon color="error" />
            </ListItemIcon>
            <ListItemText 
              primary={t('profile.exportRisk2', 'Data will be saved to your computer without encryption')}
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <ErrorIcon color="error" />
            </ListItemIcon>
            <ListItemText 
              primary={t('profile.exportRisk3', 'You are responsible for securing the exported files')}
            />
          </ListItem>
        </List>

        {/* Best Practices */}
        <Typography variant="h6" color="primary" gutterBottom sx={{ mt: 2 }}>
          {t('profile.exportBestPractices', 'Best Practices:')}
        </Typography>
        <List dense>
          <ListItem>
            <ListItemIcon>
              <CheckCircleIcon color="success" />
            </ListItemIcon>
            <ListItemText 
              primary={t('profile.exportBestPractice1', 'Save to an encrypted external drive or USB key')}
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <CheckCircleIcon color="success" />
            </ListItemIcon>
            <ListItemText 
              primary={t('profile.exportBestPractice2', 'Store in a password-protected archive (zip with password)')}
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <CheckCircleIcon color="success" />
            </ListItemIcon>
            <ListItemText 
              primary={t('profile.exportBestPractice3', 'Delete the export after backing up to secure storage')}
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <CheckCircleIcon color="success" />
            </ListItemIcon>
            <ListItemText 
              primary={t('profile.exportBestPractice4', 'Never email or upload unencrypted exports to cloud storage')}
            />
          </ListItem>
        </List>

        {exporting && (
          <Box sx={{ mt: 3 }}>
            <LinearProgress />
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 1 }}>
              {t('profile.exportingPleaseWait', 'Exporting your data, please wait...')}
            </Typography>
            <Typography variant="body2" color="error" align="center" sx={{ mt: 1 }}>
              {t('profile.doNotCloseWindow', 'Do not close this window until the export is complete.')}
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button 
          onClick={onClose} 
          disabled={exporting}
        >
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button 
          onClick={handleExport}
          variant="contained"
          color="error"
          disabled={exporting}
          startIcon={exporting ? <CircularProgress size={20} /> : <FolderZipIcon />}
        >
          {t('profile.startExport', 'I Understand, Export My Data')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ExportDataDialog;
