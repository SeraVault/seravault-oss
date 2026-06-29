import React, { useState } from 'react';
import { Box, Typography, Button, Alert, Snackbar, Divider } from '@mui/material';
import { Download, Warning, Key } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { type UserProfile } from '../firestore';
import ChangePassphraseDialog from './ChangePassphraseDialog';

interface KeyManagementSectionProps {
  userProfile: UserProfile | null;
  privateKey: string | null;
  onDownloadKey: () => void;
  onDownloadDecryptedKey: () => void;
}

const KeyManagementSection: React.FC<KeyManagementSectionProps> = ({
  userProfile,
  privateKey,
  onDownloadKey,
  onDownloadDecryptedKey,
}) => {
  const { t } = useTranslation();
  const [changePassphraseOpen, setChangePassphraseOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);

  const hasEncryptedKey = Boolean(
    userProfile?.encryptedPrivateKey &&
    typeof userProfile.encryptedPrivateKey === 'object' &&
    'ciphertext' in userProfile.encryptedPrivateKey
  );

  return (
    <>
      {!privateKey && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Unlock your keys first (enter your passphrase) to enable downloads.
        </Alert>
      )}

      {/* Change Passphrase */}
      <Box sx={{ py: 2 }}>
        <Typography variant="subtitle2" fontWeight="600" gutterBottom>Change Passphrase</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Update the passphrase used to encrypt your private key.
        </Typography>
        <Button
          variant="outlined"
          startIcon={<Key />}
          onClick={() => setChangePassphraseOpen(true)}
          disabled={!hasEncryptedKey}
        >
          Change Passphrase
        </Button>
        {!hasEncryptedKey && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            Not available — no passphrase-protected key found.
          </Typography>
        )}
      </Box>

      <Divider />

      {/* Download encrypted backup */}
      <Box sx={{ py: 2 }}>
        <Typography variant="subtitle2" fontWeight="600" gutterBottom>Download Encrypted Backup</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          A JSON file containing your private key still encrypted by your passphrase. Safe to store anywhere — it's useless without your passphrase.
        </Typography>
        <Button
          variant="outlined"
          startIcon={<Download />}
          onClick={onDownloadKey}
          disabled={!hasEncryptedKey}
        >
          Download Encrypted Key
        </Button>
        {!hasEncryptedKey && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            Not available — no passphrase-protected key found.
          </Typography>
        )}
      </Box>

      <Divider />

      {/* Download decrypted key */}
      <Box sx={{ py: 2 }}>
        <Typography variant="subtitle2" fontWeight="600" gutterBottom>
          Download Plain-Text Key <Warning sx={{ fontSize: 16, color: 'warning.main', verticalAlign: 'middle', ml: 0.5 }} />
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Downloads your private key fully decrypted. Use this only for emergency recovery or migrating to a new device. Store it somewhere very secure and never share it.
        </Typography>
        <Button
          variant="outlined"
          color="warning"
          startIcon={<Download />}
          onClick={onDownloadDecryptedKey}
          disabled={!privateKey}
        >
          Download Plain-Text Key
        </Button>
        {!privateKey && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            Unlock your keys above to enable this.
          </Typography>
        )}
      </Box>

      <ChangePassphraseDialog
        open={changePassphraseOpen}
        onClose={() => setChangePassphraseOpen(false)}
        onSuccess={() => setSuccessMessage(true)}
      />

      <Snackbar
        open={successMessage}
        autoHideDuration={6000}
        onClose={() => setSuccessMessage(false)}
        message="Passphrase changed successfully! Use your new passphrase next time you unlock."
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
};

export default KeyManagementSection;
