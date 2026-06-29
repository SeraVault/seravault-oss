import React from 'react';
import { Box, Typography, LinearProgress } from '@mui/material';
import { calculatePasswordStrength, getStrengthColor, getStrengthLabel } from '../utils/passwordStrength';

interface PasswordStrengthIndicatorProps {
  password: string;
  label?: string;
}

const PasswordStrengthIndicator: React.FC<PasswordStrengthIndicatorProps> = ({
  password,
  label = 'Password Strength',
}) => {
  const strength = calculatePasswordStrength(password);
  const color = getStrengthColor(strength);
  const strengthLabel = getStrengthLabel(strength);

  if (!password) return null;

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="caption" color={`${color}.main`} sx={{ fontWeight: 600 }}>
          {strengthLabel}
        </Typography>
      </Box>
      <LinearProgress 
        variant="determinate" 
        value={strength} 
        color={color}
        sx={{ height: 6, borderRadius: 3 }}
      />
    </Box>
  );
};

export default PasswordStrengthIndicator;
