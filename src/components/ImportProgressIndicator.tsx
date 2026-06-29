import React from 'react';
import { Box, LinearProgress, Typography, Paper } from '@mui/material';
import { Upload } from '@mui/icons-material';
import { useImport } from '../context/ImportContext';
import { useNavigate } from 'react-router-dom';

const ImportProgressIndicator: React.FC = () => {
  const { importing, progress } = useImport();
  const navigate = useNavigate();

  if (!importing || progress.total === 0) return null;

  const percentage = Math.round((progress.current / progress.total) * 100);

  const handleClick = () => {
    navigate('/profile');
  };

  return (
    <Paper
      elevation={8}
      onClick={handleClick}
      sx={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        width: 320,
        p: 2,
        zIndex: 1300,
        cursor: 'pointer',
        transition: 'transform 0.2s',
        '&:hover': {
          transform: 'scale(1.02)',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Upload sx={{ mr: 1, color: 'primary.main' }} />
        <Typography variant="body2" sx={{ flexGrow: 1, fontWeight: 500 }}>
          Importing Items
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {progress.current} / {progress.total}
        </Typography>
      </Box>
      
      <LinearProgress 
        variant="determinate" 
        value={percentage} 
        sx={{ mb: 1, height: 6, borderRadius: 3 }}
      />
      
      <Typography variant="caption" color="text.secondary">
        {percentage}% complete - Click to view details
      </Typography>
    </Paper>
  );
};

export default ImportProgressIndicator;
