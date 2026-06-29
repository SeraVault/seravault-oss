import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Checkbox,
  FormControlLabel,
  Box,
  Typography,
} from '@mui/material';
import { TermsOfServiceContent } from './TermsOfServiceContent';

interface TermsAcceptanceDialogProps {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

const TermsAcceptanceDialog: React.FC<TermsAcceptanceDialogProps> = ({ open, onAccept, onDecline }) => {
  const [termsAccepted, setTermsAccepted] = useState(false);

  const handleAccept = () => {
    if (termsAccepted) {
      onAccept();
    }
  };

  return (
    <Dialog 
      open={open} 
      maxWidth="md" 
      fullWidth
      disableEscapeKeyDown
    >
      <DialogTitle>
        <Typography variant="h5" component="div">
          Terms of Service
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Please review and accept our Terms of Service to continue
        </Typography>
      </DialogTitle>
      <DialogContent dividers sx={{ overflow: 'auto', maxHeight: '60vh' }}>
        <TermsOfServiceContent />
      </DialogContent>
      <Box sx={{ px: 3, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              color="primary"
            />
          }
          label={
            <Typography variant="body2">
              I have read and agree to the Terms of Service
            </Typography>
          }
        />
      </Box>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onDecline} color="inherit">
          Cancel
        </Button>
        <Button 
          onClick={handleAccept} 
          variant="contained" 
          disabled={!termsAccepted}
        >
          Create Account
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TermsAcceptanceDialog;
