import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Button,
  FormControlLabel,
  Checkbox,
  Alert,
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Warning,
  Print,
  Security,
  Memory,
  NetworkCheck,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

interface PrintSecurityWarningDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onNeverShowAgain: () => void;
  fileName?: string;
  isForm?: boolean;
}

const PrintSecurityWarningDialog: React.FC<PrintSecurityWarningDialogProps> = ({
  open,
  onClose,
  onConfirm,
  onNeverShowAgain,
  fileName = 'document',
  isForm = false,
}) => {
  const { t } = useTranslation();
  const [neverShowAgain, setNeverShowAgain] = useState(false);

  const handleConfirm = () => {
    if (neverShowAgain) {
      onNeverShowAgain();
    }
    onConfirm();
  };

  const handleCancel = () => {
    setNeverShowAgain(false);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Warning color="warning" />
          Print Security Warning
        </Box>
      </DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2" gutterBottom>
            <strong>Warning:</strong> You are about to print "{fileName}".
            {isForm && ' This form may contain sensitive information.'}
          </Typography>
        </Alert>

        <Typography variant="body2" color="text.secondary" gutterBottom>
          Please be aware of the following security considerations:
        </Typography>

        <List dense>
          <ListItem>
            <ListItemIcon>
              <Security fontSize="small" color="warning" />
            </ListItemIcon>
            <ListItemText
              primary="Sensitive Information Exposure"
              secondary="Printed documents may contain passwords, personal data, or confidential information that could be visible to others."
            />
          </ListItem>

          <ListItem>
            <ListItemIcon>
              <Memory fontSize="small" color="warning" />
            </ListItemIcon>
            <ListItemText
              primary="Printer Memory"
              secondary="Many printers store copies of printed documents in their internal memory, which may be accessible to others who use the same printer."
            />
          </ListItem>

          <ListItem>
            <ListItemIcon>
              <NetworkCheck fontSize="small" color="warning" />
            </ListItemIcon>
            <ListItemText
              primary="Network Exposure"
              secondary="Network printers may transmit document data over the network, potentially exposing it to network monitoring or logging systems."
            />
          </ListItem>
        </List>

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Recommendation:</strong> Only print to trusted, private printers in secure locations.
            Consider whether downloading and printing from a secure device would be safer.
          </Typography>
        </Alert>

        <FormControlLabel
          control={
            <Checkbox
              checked={neverShowAgain}
              onChange={(e) => setNeverShowAgain(e.target.checked)}
            />
          }
          label={t('common.dontShowAgain', "Don't show this warning again")}
          sx={{ mt: 2 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          startIcon={<Print />}
          color="warning"
        >
          Print Anyway
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PrintSecurityWarningDialog;