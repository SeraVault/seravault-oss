import React from 'react';
import { Box, Typography } from '@mui/material';
import { CheckCircle, RadioButtonUnchecked } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { AUTH_CONFIG } from '../constants/authConfig';

const { passphrase: cfg } = AUTH_CONFIG;

interface PassphraseRequirementsProps {
  passphrase: string;
}

const PassphraseRequirements: React.FC<PassphraseRequirementsProps> = ({ passphrase }) => {
  const { t } = useTranslation();

  const requirements = [
    {
      label: t('profile.passphraseRequirementMinLength', `At least ${cfg.minLength} characters`),
      test: (p: string) => p.length >= cfg.minLength,
    },
    ...(cfg.requireUppercase ? [{
      label: t('signup.requirementUppercase', 'One uppercase letter'),
      test: (p: string) => /[A-Z]/.test(p),
    }] : []),
    ...(cfg.requireLowercase ? [{
      label: t('signup.requirementLowercase', 'One lowercase letter'),
      test: (p: string) => /[a-z]/.test(p),
    }] : []),
    ...(cfg.requireNumber ? [{
      label: t('signup.requirementNumber', 'One number'),
      test: (p: string) => /\d/.test(p),
    }] : []),
    ...(cfg.requireSpecial ? [{
      label: t('signup.requirementSpecial', 'One special character'),
      test: (p: string) => /[^a-zA-Z\d]/.test(p),
    }] : []),
  ];

  if (!passphrase) return null;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        {t('profile.passphraseRequirements', 'Passphrase Requirements:')}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {requirements.map((req, index) => {
          const isMet = req.test(passphrase);
          return (
            <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              {isMet
                ? <CheckCircle sx={{ fontSize: 16, color: 'success.main' }} />
                : <RadioButtonUnchecked sx={{ fontSize: 16, color: 'text.disabled' }} />}
              <Typography
                variant="caption"
                sx={{ color: isMet ? 'success.main' : 'text.secondary', fontWeight: isMet ? 600 : 400 }}
              >
                {req.label}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default PassphraseRequirements;
