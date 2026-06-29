import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  LinearProgress,
  Chip,
} from '@mui/material';
import { Warning, Security, Storage, AutorenewOutlined, CheckCircle, Error } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { countUserFiles } from '../services/keyMigration';

interface KeyRegenerationWarningDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (migrateFiles: boolean) => void;
  userId: string;
}

const KeyRegenerationWarningDialog: React.FC<KeyRegenerationWarningDialogProps> = ({
  open,
  onClose,
  onConfirm,
  userId,
}) => {
  const { t } = useTranslation();
  const [fileCount, setFileCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState<'migrate' | 'ignore' | null>(null);

  useEffect(() => {
    if (open && userId) {
      setLoading(true);
      countUserFiles(userId)
        .then(count => {
          setFileCount(count);
          setLoading(false);
        })
        .catch(error => {
          console.error('Error counting files:', error);
          setFileCount(0);
          setLoading(false);
        });
    }
  }, [open, userId]);

  const handleConfirm = () => {
    if (selectedOption) {
      onConfirm(selectedOption === 'migrate');
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: {
          borderTop: '4px solid #ff9800',
        }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#ff9800' }}>
          <Warning sx={{ fontSize: 32 }} />
          <Typography variant="h6" component="div">
            Regenerate Encryption Keys - File Access Warning
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <LinearProgress sx={{ flexGrow: 1 }} />
            <Typography variant="body2">Checking your files...</Typography>
          </Box>
        ) : (
          <>
            <Alert severity="warning" sx={{ mb: 3 }}>
              <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                You have {fileCount} encrypted {fileCount === 1 ? 'item' : 'items'} (files & folders) that could become inaccessible!
              </Typography>
            </Alert>

            {fileCount > 0 ? (
              <>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  When you regenerate your encryption keys, your existing files are encrypted with your old key. 
                  You have two options:
                </Typography>

                <Box sx={{ mb: 3 }}>
                  <Box 
                    sx={{ 
                      p: 2, 
                      border: selectedOption === 'migrate' ? '2px solid #4caf50' : '1px solid #ddd',
                      borderRadius: 1, 
                      mb: 2,
                      cursor: 'pointer',
                      backgroundColor: selectedOption === 'migrate' ? 'rgba(76, 175, 80, 0.1)' : 'transparent'
                    }}
                    onClick={() => setSelectedOption('migrate')}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <AutorenewOutlined sx={{ color: '#4caf50' }} />
                      <Typography variant="h6" color="#4caf50">
                        Migrate Files (Recommended)
                      </Typography>
                      <Chip label={t('common.safe', 'Safe')} color="success" size="small" />
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      Automatically re-encrypt your {fileCount} {fileCount === 1 ? 'item' : 'items'} (files & folders) with the new key. 
                      Your content will remain accessible, but migration may take a few moments.
                    </Typography>
                  </Box>

                  <Box 
                    sx={{ 
                      p: 2, 
                      border: selectedOption === 'ignore' ? '2px solid #f44336' : '1px solid #ddd',
                      borderRadius: 1,
                      cursor: 'pointer',
                      backgroundColor: selectedOption === 'ignore' ? 'rgba(244, 67, 54, 0.1)' : 'transparent'
                    }}
                    onClick={() => setSelectedOption('ignore')}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Error sx={{ color: '#f44336' }} />
                      <Typography variant="h6" color="#f44336">
                        Ignore Files
                      </Typography>
                      <Chip label={t('common.dataLoss', 'Data Loss')} color="error" size="small" />
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      Proceed without migrating. Your {fileCount} existing {fileCount === 1 ? 'item' : 'items'} (files & folders) will become 
                      permanently inaccessible. Only choose this if you want to start fresh.
                    </Typography>
                  </Box>
                </Box>

                <List dense sx={{ mt: 2 }}>
                  <ListItem>
                    <ListItemIcon>
                      <Security sx={{ color: '#ff9800' }} />
                    </ListItemIcon>
                    <ListItemText 
                      primary="Why does this happen?"
                      secondary="Files are encrypted with AES keys, which are encrypted with your quantum-safe public key. New keys can't decrypt old AES keys."
                    />
                  </ListItem>
                  
                  <ListItem>
                    <ListItemIcon>
                      <Storage sx={{ color: '#ff9800' }} />
                    </ListItemIcon>
                    <ListItemText 
                      primary="Migration Process"
                      secondary="We decrypt your file keys with the old private key, then re-encrypt them with the new public key."
                    />
                  </ListItem>

                  <ListItem>
                    <ListItemIcon>
                      <Warning sx={{ color: '#ff9800' }} />
                    </ListItemIcon>
                    <ListItemText 
                      primary="Hardware Keys & Biometrics Will Be Removed"
                      secondary="Any stored biometric authentication or hardware keys will be automatically cleared and must be re-registered with your new keys."
                    />
                  </ListItem>
                </List>
              </>
            ) : (
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="body1">
                  You don't have any encrypted files that would be affected by regenerating your keys. 
                  You can proceed safely.
                </Typography>
              </Alert>
            )}
          </>
        )}
      </DialogContent>
      
      <DialogActions sx={{ p: 3, gap: 1 }}>
        <Button 
          onClick={onClose} 
          variant="outlined"
          size="large"
        >
          Cancel
        </Button>
        
        {fileCount > 0 ? (
          <Button 
            onClick={handleConfirm} 
            variant="contained"
            color={selectedOption === 'migrate' ? 'success' : selectedOption === 'ignore' ? 'error' : 'primary'}
            size="large"
            disabled={!selectedOption || loading}
            startIcon={selectedOption === 'migrate' ? <AutorenewOutlined /> : selectedOption === 'ignore' ? <Warning /> : undefined}
          >
            {selectedOption === 'migrate' ? 'Regenerate & Migrate Data' : 
             selectedOption === 'ignore' ? 'Regenerate & Lose Data' : 
             'Choose an Option'}
          </Button>
        ) : (
          <Button 
            onClick={() => onConfirm(false)} 
            variant="contained"
            size="large"
            disabled={loading}
          >
            Regenerate Keys
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default KeyRegenerationWarningDialog;