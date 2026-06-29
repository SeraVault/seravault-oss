import React from 'react';
import { Box, Chip } from '@mui/material';

// Global variable declared in vite-env.d.ts

export const VersionInfo: React.FC = () => {
  const buildTimestamp = typeof __BUILD_TIMESTAMP__ !== 'undefined' 
    ? new Date(parseInt(__BUILD_TIMESTAMP__)).toLocaleString() 
    : 'Unknown';

  return (
    <Box sx={{ 
      position: 'fixed', 
      bottom: 8, 
      right: 8, 
      zIndex: 9999,
      opacity: 0.7,
    }}>
      <Chip 
        label={`v${buildTimestamp}`} 
        size="small" 
        color="primary"
        sx={{ fontSize: '0.65rem' }}
      />
    </Box>
  );
};
