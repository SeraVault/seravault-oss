import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Alert,
} from '@mui/material';
import {
  ExpandMore,
  VpnKey,
  Fingerprint,
  Key,
  CloudUpload,
  Security,
  CheckCircle,
} from '@mui/icons-material';

interface AuthenticationMethodsHelpProps {
  open: boolean;
  onClose: () => void;
}

const AuthenticationMethodsHelp: React.FC<AuthenticationMethodsHelpProps> = ({ open, onClose }) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Security color="primary" />
          Authentication Methods Guide
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          SeraVault separates authentication (who you are) from encryption (what you can access). 
          Even if someone steals your authentication, they still need your passphrase to decrypt files.
        </Typography>

        {/* Passphrase */}
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
              <VpnKey color="primary" />
              <Typography variant="h6">Passphrase (Traditional)</Typography>
              <Chip label="Standard" size="small" color="default" sx={{ ml: 'auto' }} />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" paragraph>
              Your master passphrase is used to encrypt your private key on our servers.
            </Typography>
            
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>✅ Pros:</Typography>
            <Box component="ul" sx={{ mt: 0, pl: 3 }}>
              <li><Typography variant="body2">Works on any device</Typography></li>
              <li><Typography variant="body2">No special hardware needed</Typography></li>
              <li><Typography variant="body2">Familiar to all users</Typography></li>
              <li><Typography variant="body2">Complete portability</Typography></li>
            </Box>
            
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>❌ Cons:</Typography>
            <Box component="ul" sx={{ mt: 0, pl: 3 }}>
              <li><Typography variant="body2">Vulnerable to phishing</Typography></li>
              <li><Typography variant="body2">Can be forgotten</Typography></li>
              <li><Typography variant="body2">May be reused across sites</Typography></li>
              <li><Typography variant="body2">Keylogger vulnerable</Typography></li>
            </Box>

            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Security Model:</strong> Your encrypted private key is stored on our servers. 
                If our servers are compromised AND you use a weak passphrase, your files could be decrypted.
              </Typography>
            </Alert>
          </AccordionDetails>
        </Accordion>

        {/* Biometric */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
              <Fingerprint color="primary" />
              <Typography variant="h6">Biometric (Fingerprint/Face ID)</Typography>
              <Chip label="Convenient" size="small" color="success" sx={{ ml: 'auto' }} />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" paragraph>
              Use your device's fingerprint sensor or Face ID to unlock your files.
            </Typography>
            
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>✅ Pros:</Typography>
            <Box component="ul" sx={{ mt: 0, pl: 3 }}>
              <li><Typography variant="body2">Fast and convenient</Typography></li>
              <li><Typography variant="body2">Nothing to remember</Typography></li>
              <li><Typography variant="body2">Phishing resistant</Typography></li>
              <li><Typography variant="body2">Works offline</Typography></li>
            </Box>
            
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>❌ Cons:</Typography>
            <Box component="ul" sx={{ mt: 0, pl: 3 }}>
              <li><Typography variant="body2">Device-specific (doesn't sync)</Typography></li>
              <li><Typography variant="body2">Limited device support</Typography></li>
              <li><Typography variant="body2">No backup if device is lost</Typography></li>
              <li><Typography variant="body2">Biometric data stays local to device</Typography></li>
            </Box>

            <Alert severity="warning" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Security Model:</strong> Your encrypted private key is stored on our servers. 
                Your device encrypts your passphrase with biometrics. If our servers AND your device are both compromised, files could be at risk.
              </Typography>
            </Alert>
          </AccordionDetails>
        </Accordion>

        {/* Passkey */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
              <Key color="primary" />
              <Typography variant="h6">Passkey (Cloud Synced)</Typography>
              <Chip label="Modern" size="small" color="info" sx={{ ml: 'auto' }} />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" paragraph>
              Modern authentication that syncs across your devices via iCloud, Google, or 1Password.
            </Typography>
            
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>✅ Pros:</Typography>
            <Box component="ul" sx={{ mt: 0, pl: 3 }}>
              <li><Typography variant="body2">Syncs across all your devices</Typography></li>
              <li><Typography variant="body2">Fast and convenient</Typography></li>
              <li><Typography variant="body2">Phishing resistant</Typography></li>
              <li><Typography variant="body2">Backed up automatically</Typography></li>
              <li><Typography variant="body2">No passwords to remember</Typography></li>
            </Box>
            
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>❌ Cons:</Typography>
            <Box component="ul" sx={{ mt: 0, pl: 3 }}>
              <li><Typography variant="body2">Relies on cloud provider (Apple/Google)</Typography></li>
              <li><Typography variant="body2">Still requires passphrase for file decryption</Typography></li>
              <li><Typography variant="body2">Provider could access your account if compromised</Typography></li>
            </Box>

            <Alert severity="warning" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Security Model:</strong> Your encrypted private key is stored on our servers. 
                If your passkey provider (Google/Apple) AND our servers are both compromised, your files could be at risk.
                <br /><br />
                <strong>However:</strong> The attacker would still need your passphrase to decrypt your private key!
              </Typography>
            </Alert>
          </AccordionDetails>
        </Accordion>

        {/* Hardware Key */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
              <Key color="primary" />
              <Typography variant="h6">Hardware Key (YubiKey, etc.)</Typography>
              <Chip label="Secure" size="small" color="warning" sx={{ ml: 'auto' }} />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" paragraph>
              Physical security device (YubiKey, Titan Key, etc.) required for authentication.
            </Typography>
            
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>✅ Pros:</Typography>
            <Box component="ul" sx={{ mt: 0, pl: 3 }}>
              <li><Typography variant="body2">Extremely phishing resistant</Typography></li>
              <li><Typography variant="body2">Cannot be remotely stolen</Typography></li>
              <li><Typography variant="body2">Works offline</Typography></li>
              <li><Typography variant="body2">Industry standard for high security</Typography></li>
            </Box>
            
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>❌ Cons:</Typography>
            <Box component="ul" sx={{ mt: 0, pl: 3 }}>
              <li><Typography variant="body2">Requires physical device</Typography></li>
              <li><Typography variant="body2">Can be lost or damaged</Typography></li>
              <li><Typography variant="body2">Additional cost ($25-50)</Typography></li>
              <li><Typography variant="body2">Must carry it with you</Typography></li>
            </Box>

            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Security Model:</strong> Same as passkey, but the key is on a physical device you own.
                More secure against cloud provider compromise.
              </Typography>
            </Alert>
          </AccordionDetails>
        </Accordion>

        {/* Hardware Key + Paranoid Mode */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
              <Security color="error" />
              <Typography variant="h6">Paranoid Mode (Hardware + No Server Storage)</Typography>
              <Chip label="Maximum Security" size="small" color="error" sx={{ ml: 'auto' }} />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" paragraph>
              Store your encryption private key INSIDE your hardware key. Never sent to our servers.
            </Typography>
            
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>✅ Pros:</Typography>
            <Box component="ul" sx={{ mt: 0, pl: 3 }}>
              <li><Typography variant="body2">Zero server-side storage of private key</Typography></li>
              <li><Typography variant="body2">No passphrase phishing possible</Typography></li>
              <li><Typography variant="body2">Maximum security guarantee</Typography></li>
              <li><Typography variant="body2">Server breach cannot decrypt files</Typography></li>
            </Box>
            
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>❌ Cons:</Typography>
            <Box component="ul" sx={{ mt: 0, pl: 3 }}>
              <li><Typography variant="body2">If you lose the key, you lose access FOREVER</Typography></li>
              <li><Typography variant="body2">Must have 2+ keys for redundancy</Typography></li>
              <li><Typography variant="body2">Cannot access from new device without key</Typography></li>
              <li><Typography variant="body2">More complex setup</Typography></li>
            </Box>

            <Alert severity="error" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>⚠️ CRITICAL:</strong> If you lose all your hardware keys, your files are permanently inaccessible.
                ALWAYS register at least 2 hardware keys and store them in separate secure locations.
              </Typography>
            </Alert>

            <Alert severity="success" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Security Model:</strong> Even if our servers are completely compromised, your files remain encrypted.
                The only way to decrypt is with your physical hardware key.
              </Typography>
            </Alert>
          </AccordionDetails>
        </Accordion>

        {/* Key File */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
              <CloudUpload color="primary" />
              <Typography variant="h6">Key File (Backup/Recovery)</Typography>
              <Chip label="Recovery Only" size="small" color="default" sx={{ ml: 'auto' }} />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" paragraph>
              Download your private key to a file for backup or emergency access.
            </Typography>
            
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>✅ Pros:</Typography>
            <Box component="ul" sx={{ mt: 0, pl: 3 }}>
              <li><Typography variant="body2">Can access from any device</Typography></li>
              <li><Typography variant="body2">Useful for emergency recovery</Typography></li>
              <li><Typography variant="body2">No special hardware needed</Typography></li>
              <li><Typography variant="body2">Can encrypt with passphrase</Typography></li>
            </Box>
            
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>❌ Cons:</Typography>
            <Box component="ul" sx={{ mt: 0, pl: 3 }}>
              <li><Typography variant="body2">File can be stolen if not secured</Typography></li>
              <li><Typography variant="body2">Must store securely offline</Typography></li>
              <li><Typography variant="body2">Not meant for daily use</Typography></li>
            </Box>

            <Alert severity="warning" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Best Practice:</strong> Store encrypted key files in a password manager or secure vault.
                Never email or store in cloud storage unencrypted.
              </Typography>
            </Alert>
          </AccordionDetails>
        </Accordion>

        {/* Security Summary */}
        <Box sx={{ mt: 3, p: 2, bgcolor: 'primary.50', borderRadius: 1 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CheckCircle color="success" />
            The Key Insight
          </Typography>
          <Typography variant="body2">
            <strong>SeraVault uses Zero-Knowledge Architecture:</strong> Even if someone compromises your authentication method (passkey, biometric, etc.), 
            they STILL need your passphrase to decrypt your private key and access your files.
            <br /><br />
            <strong>Authentication ≠ Encryption</strong>
            <br />• Authentication = Who you are (gets you into your account)
            <br />• Encryption = What you can access (requires your passphrase to decrypt files)
            <br /><br />
            For maximum security, use Hardware Key + Paranoid Mode to ensure even we cannot access your files.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Got It
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AuthenticationMethodsHelp;
