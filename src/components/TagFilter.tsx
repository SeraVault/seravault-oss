import React, { useState, useEffect } from 'react';
import {
  Box,
  Chip,
  FormControlLabel,
  Switch,
  Typography,
  Collapse,
  IconButton,
  Badge,
  Menu,
  MenuItem,
  Divider,
  Tooltip,
} from '@mui/material';
import { 
  FilterList, 
  LocalOffer, 
  Clear, 
  ExpandMore, 
  ExpandLess,
  CheckBox,
  CheckBoxOutlineBlank
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { getAllUserTags, getUserTagStats } from '../services/userTagsManagement';
import { type FileData } from '../files';
import { useMetadata } from '../context/MetadataContext';
import { backendService } from '../backend/BackendService';

interface TagFilterProps {
  files: FileData[];
  userId: string;
  userPrivateKey: string;
  selectedTags: string[];
  onTagSelectionChange: (tags: string[]) => void;
  matchAllTags: boolean;
  onMatchModeChange: (matchAll: boolean) => void;
  className?: string;
}

const TagFilter: React.FC<TagFilterProps> = ({
  files,
  userId,
  userPrivateKey,
  selectedTags,
  onTagSelectionChange,
  matchAllTags,
  onMatchModeChange,
  className
}) => {
  const { t } = useTranslation();
  const { preloadCompleted, refreshCounter } = useMetadata();
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [tagStats, setTagStats] = useState<{ [tag: string]: number }>({});
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  // Load available tags and statistics from ALL user files
  useEffect(() => {
    const loadTagData = async () => {
      if (!userId || !userPrivateKey) return;

      try {
        setLoading(true);

        // Fetch ALL files the user has access to using backend service
        console.log('🔍 TagFilter: Fetching all user files for tag collection...');

        const [ownedFiles, sharedFiles] = await Promise.all([
          backendService.files.getUserFiles(userId),
          backendService.files.getSharedFiles(userId)
        ]);

        // Combine and deduplicate files
        const allUserFiles = new Map<string, FileData>();

        ownedFiles.forEach(file => {
          allUserFiles.set(file.id!, file as FileData);
        });

        sharedFiles.forEach(file => {
          if (!allUserFiles.has(file.id!)) {
            allUserFiles.set(file.id!, file as FileData);
          }
        });

        const allFiles = Array.from(allUserFiles.values());
        console.log(`🔍 TagFilter: Found ${allFiles.length} total files to check for tags`);

        // Load all available tags and their usage counts from ALL files
        const [tags, stats] = await Promise.all([
          getAllUserTags(allFiles, userId, userPrivateKey),
          getUserTagStats(allFiles, userId, userPrivateKey)
        ]);

        setAvailableTags(tags);
        setTagStats(stats);

      } catch (error) {
        console.error('Error loading tag data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTagData();
  }, [userId, userPrivateKey, refreshCounter]); // React to refresh counter changes

  // Refresh tags when metadata preload completes (React pattern)
  useEffect(() => {
    if (preloadCompleted && userId && userPrivateKey) {
      console.log('🏷️ Metadata preload completed, refreshing tag list from ALL files via React context...');

      const refreshTags = async () => {
        try {
          // Re-fetch ALL user files using backend service
          const [ownedFiles, sharedFiles] = await Promise.all([
            backendService.files.getUserFiles(userId),
            backendService.files.getSharedFiles(userId)
          ]);

          // Combine and deduplicate files
          const allUserFiles = new Map<string, FileData>();

          ownedFiles.forEach(file => {
            allUserFiles.set(file.id!, file as FileData);
          });

          sharedFiles.forEach(file => {
            if (!allUserFiles.has(file.id!)) {
              allUserFiles.set(file.id!, file as FileData);
            }
          });

          const allFiles = Array.from(allUserFiles.values());

          const [tags, stats] = await Promise.all([
            getAllUserTags(allFiles, userId, userPrivateKey),
            getUserTagStats(allFiles, userId, userPrivateKey)
          ]);

          setAvailableTags(tags);
          setTagStats(stats);
        } catch (error) {
          console.error('Error refreshing tag data after preload:', error);
        }
      };

      refreshTags();
    }
  }, [preloadCompleted, userId, userPrivateKey]);

  const handleTagToggle = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagSelectionChange(selectedTags.filter(t => t !== tag));
    } else {
      onTagSelectionChange([...selectedTags, tag]);
    }
  };

  const handleClearFilters = () => {
    onTagSelectionChange([]);
  };

  const handleSelectAll = () => {
    onTagSelectionChange(availableTags);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  const activeFilterCount = selectedTags.length;
  const hasFilters = activeFilterCount > 0;

  return (
    <Box className={className} sx={{ width: '100%' }}>
      {/* Filter Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Tooltip title={t('common.filterByTags', 'Filter by tags')}>
          <span>
            <IconButton
              size="small"
              onClick={() => setExpanded(!expanded)}
              disabled={loading}
            >
              <Badge badgeContent={activeFilterCount} color="primary">
                <FilterList />
              </Badge>
            </IconButton>
          </span>
        </Tooltip>

        <Typography variant="body2" color="text.secondary">
          {t('common.filterByTags', 'Filter by tags')}
        </Typography>

        {availableTags.length > 0 && (
          <Tooltip title={t('common.moreOptions', 'More options')}>
            <IconButton size="small" onClick={handleMenuOpen}>
              <ExpandMore />
            </IconButton>
          </Tooltip>
        )}

        {hasFilters && (
          <Tooltip title={t('common.clearAllFilters', 'Clear all filters')}>
            <IconButton size="small" onClick={handleClearFilters}>
              <Clear />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Options Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        transformOrigin={{ horizontal: 'left', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
      >
        <MenuItem onClick={handleSelectAll} disabled={selectedTags.length === availableTags.length}>
          <CheckBox sx={{ mr: 1 }} />
          Select All Tags
        </MenuItem>
        <MenuItem onClick={handleClearFilters} disabled={!hasFilters}>
          <CheckBoxOutlineBlank sx={{ mr: 1 }} />
          Clear All
        </MenuItem>
        <Divider />
        <MenuItem>
          <FormControlLabel
            control={
              <Switch
                checked={matchAllTags}
                onChange={(e) => onMatchModeChange(e.target.checked)}
                size="small"
              />
            }
            label={
              <Typography variant="caption">
                {matchAllTags ? 'Match ALL tags' : 'Match ANY tag'}
              </Typography>
            }
            sx={{ m: 0 }}
          />
        </MenuItem>
      </Menu>

      {/* Removed duplicate Active Filters Display - selection is shown in main list with color */}

      {/* Expandable Tag Selection */}
      <Collapse in={expanded}>
        <Box sx={{ 
          maxHeight: 200, 
          overflowY: 'auto', 
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          p: 1,
          bgcolor: 'background.paper'
        }}>
          {loading ? (
            <Typography variant="caption" color="text.secondary">
              Loading tags...
            </Typography>
          ) : availableTags.length === 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              No tags available
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {availableTags.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                const count = tagStats[tag] || 0;
                
                return (
                  <Chip
                    key={tag}
                    label={`${tag} (${count})`}
                    size="small"
                    color={isSelected ? "primary" : "default"}
                    variant={isSelected ? "filled" : "outlined"}
                    icon={<LocalOffer fontSize="small" />}
                    onClick={() => handleTagToggle(tag)}
                    clickable
                    sx={{ 
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      '&:hover': {
                        bgcolor: isSelected ? 'primary.dark' : 'action.hover',
                      }
                    }}
                  />
                );
              })}
            </Box>
          )}
        </Box>
      </Collapse>

      {/* Filter Summary */}
      {hasFilters && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
          Filtering by {activeFilterCount} tag{activeFilterCount !== 1 ? 's' : ''} 
          ({matchAllTags ? 'all must match' : 'any can match'})
        </Typography>
      )}
    </Box>
  );
};

export default TagFilter;