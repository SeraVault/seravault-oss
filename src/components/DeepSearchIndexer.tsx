import React, { useState } from 'react';
import { 
  Box, 
  Button, 
  LinearProgress, 
  Typography, 
  Chip,
  IconButton,
  Popover,
} from '@mui/material';
import { Search, CheckCircle, InfoOutlined } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import type { DeepIndexProgress } from '../hooks/useGlobalFileIndex';

interface DeepSearchIndexerProps {
  progress: DeepIndexProgress;
  onStartIndexing: () => void;
  hasDeepIndex: boolean;
}

const HELP_TEXT_ENABLED = 'Deep Search is active. Your form field contents have been decrypted in memory and indexed for this session. Searching will match text inside forms, not just their names. The index is cleared when you close or reload the page.';
const HELP_TEXT_DISABLED = 'Deep Search decrypts your form contents in memory so you can search within field values — not just file names. It runs once per session and is never stored to disk. Click "Enable Deep Search" to index your forms now.';

const DeepSearchHelp: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);

  return (
    <>
      <IconButton
        size="small"
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ ml: 0.5, p: 0.25, color: 'text.secondary' }}
        aria-label={t('common.deepSearchInfo', 'Deep search info')}
      >
        <InfoOutlined fontSize="small" />
      </IconButton>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        PaperProps={{ sx: { p: 2, maxWidth: 300 } }}
      >
        <Typography variant="body2">
          {enabled ? HELP_TEXT_ENABLED : HELP_TEXT_DISABLED}
        </Typography>
      </Popover>
    </>
  );
};

const DeepSearchIndexer: React.FC<DeepSearchIndexerProps> = ({
  progress,
  onStartIndexing,
  hasDeepIndex,
}) => {
  const { t } = useTranslation();

  const { isIndexing, total, processed, currentFile } = progress;

  if (!isIndexing && hasDeepIndex) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', ml: { xs: 0, sm: 1 }, flexShrink: 0 }}>
        <Chip
          icon={<CheckCircle />}
          label={t('search.deepSearchEnabled', 'Deep Search')}
          color="success"
          size="small"
        />
        <DeepSearchHelp enabled={true} />
      </Box>
    );
  }

  if (!isIndexing) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', ml: { xs: 0, sm: 1 }, flexShrink: 0 }}>
        <Button
          size="small"
          startIcon={<Search />}
          onClick={onStartIndexing}
          sx={{ 
            textTransform: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {t('search.enableDeepSearch', 'Enable Deep Search')}
        </Button>
        <DeepSearchHelp enabled={false} />
      </Box>
    );
  }

  const percentage = total > 0 ? (processed / total) * 100 : 0;

  return (
    <Box sx={{ 
      minWidth: { xs: '100%', sm: 250 },
      maxWidth: { xs: '100%', sm: 250 },
      ml: { xs: 0, sm: 2 },
      flexShrink: 0, // Prevent shrinking
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
        <Typography variant="caption" sx={{ mr: 1, whiteSpace: 'nowrap' }}>
          {t('search.indexing', 'Indexing forms...')}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {processed}/{total}
        </Typography>
      </Box>
      <LinearProgress 
        variant="determinate" 
        value={percentage} 
        sx={{ height: 6, borderRadius: 1 }}
      />
      {currentFile && (
        <Typography 
          variant="caption" 
          color="text.secondary" 
          sx={{ 
            display: 'block', 
            mt: 0.5,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
          }}
        >
          {currentFile}
        </Typography>
      )}
    </Box>
  );
};

export default DeepSearchIndexer;
