import React, { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from '@mui/material';

interface PassphraseDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (passphrase: string) => void;
}

const PassphraseDialog: React.FC<PassphraseDialogProps> = ({ open, onClose, onSubmit }) => {
  const [passphrase, setPassphrase] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(passphrase);
    setPassphrase('');
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Enter Passphrase</DialogTitle>
        <DialogContent>
          <DialogContentText>
            To access your encrypted data, please enter your passphrase.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Passphrase"
            type="password"
            fullWidth
            variant="standard"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit">Submit</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default PassphraseDialog;
