import React from 'react';
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
} from '@mui/material';
import { Warning, Security, Share, Storage } from '@mui/icons-material';

interface DecryptedKeyWarningDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const DecryptedKeyWarningDialog: React.FC<DecryptedKeyWarningDialogProps> = ({
  open,
  onClose,
  onConfirm,
}) => {
  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: {
          borderTop: '4px solid #f44336',
        }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#f44336' }}>
          <Warning sx={{ fontSize: 32 }} />
          <Typography variant="h6" component="div">
            Security Warning - Decrypted Private Key
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Alert severity="error" sx={{ mb: 3 }}>
          <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
            You are about to download your private key in PLAIN TEXT format!
          </Typography>
        </Alert>

        <Typography variant="body1" sx={{ mb: 2 }}>
          This action will create a file containing your unencrypted private key. Please understand the security implications:
        </Typography>

        <List dense>
          <ListItem>
            <ListItemIcon>
              <Security sx={{ color: '#f44336' }} />
            </ListItemIcon>
            <ListItemText 
              primary="Complete Access"
              secondary="Anyone with this file can decrypt ALL your data without needing your passphrase"
            />
          </ListItem>
          
          <ListItem>
            <ListItemIcon>
              <Share sx={{ color: '#f44336' }} />
            </ListItemIcon>
            <ListItemText 
              primary="No Encryption Protection"
              secondary="The file contains your raw private key with no password protection"
            />
          </ListItem>
          
          <ListItem>
            <ListItemIcon>
              <Storage sx={{ color: '#f44336' }} />
            </ListItemIcon>
            <ListItemText 
              primary="Secure Storage Required"
              secondary="You must store this file securely and never share it with anyone"
            />
          </ListItem>
        </List>

        <Box sx={{ mt: 3, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'info.contrastText', mb: 1 }}>
            💡 Recommended Alternative:
          </Typography>
          <Typography variant="body2" sx={{ color: 'info.contrastText' }}>
            Consider using the "Download Key Backup" option instead, which keeps your private key encrypted and protected by your passphrase.
          </Typography>
        </Box>
      </DialogContent>
      
      <DialogActions sx={{ p: 3, gap: 1 }}>
        <Button 
          onClick={onClose} 
          variant="outlined"
          size="large"
        >
          Cancel
        </Button>
        <Button 
          onClick={onConfirm} 
          variant="contained"
          color="error"
          size="large"
          startIcon={<Warning />}
        >
          I Understand - Download Anyway
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DecryptedKeyWarningDialog;