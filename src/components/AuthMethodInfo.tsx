import React from 'react';
import { Alert, Typography, Box } from '@mui/material';
import { Security, Smartphone } from '@mui/icons-material';

interface AuthMethodInfoProps {
  scenario: 'no-biometric-support' | 'biometric-available' | 'biometric-setup';
}

const AuthMethodInfo: React.FC<AuthMethodInfoProps> = ({ scenario }) => {
  const getContent = () => {
    switch (scenario) {
      case 'no-biometric-support':
        return {
          severity: 'info' as const,
          icon: <Security />,
          title: 'Passphrase Authentication',
          message: 'Your device doesn\'t support biometric authentication, but don\'t worry! Your passphrase provides the same level of security.',
          tip: 'Tip: Use a strong, memorable passphrase and enable "Keep unlocked longer" to reduce how often you need to enter it.'
        };
      
      case 'biometric-available':
        return {
          severity: 'success' as const,
          icon: <Smartphone />,
          title: 'Biometric Authentication Available',
          message: 'Great news! Your device supports biometric authentication for faster, more convenient access.',
          tip: 'Visit your Profile page to set up fingerprint or Face ID login.'
        };
      
      case 'biometric-setup':
        return {
          severity: 'success' as const,
          icon: <Smartphone />,
          title: 'Biometric Authentication Ready',
          message: 'You can now use your fingerprint or Face ID to unlock your private key instantly.',
          tip: 'You can always use your passphrase as backup if biometric authentication fails.'
        };
    }
  };

  const content = getContent();

  return (
    <Alert severity={content.severity} sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        {content.icon}
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
            {content.title}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {content.message}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
            {content.tip}
          </Typography>
        </Box>
      </Box>
    </Alert>
  );
};

export default AuthMethodInfo;