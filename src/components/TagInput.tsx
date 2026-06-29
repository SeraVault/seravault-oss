import React, { useState, useEffect, type KeyboardEvent } from 'react';
import {
  Box,
  Chip,
  TextField,
  Autocomplete,
  Paper,
  Typography,
  IconButton,
  Button,
} from '@mui/material';
import { Add, LocalOffer, Close } from '@mui/icons-material';
import { getUserTags, updateUserTagsInFirestore, getAllUserTags } from '../services/userTagsManagement';
import { type FileData } from '../files';
import { useMetadata } from '../context/MetadataContext';

interface TagInputProps {
  file: FileData;
  userId: string;
  userPrivateKey: string;
  onTagsChange?: (tags: string[]) => void;
  allFiles?: FileData[];
  disabled?: boolean;
  size?: 'small' | 'medium';
}

const TagInput: React.FC<TagInputProps> = ({
  file,
  userId,
  userPrivateKey,
  onTagsChange,
  allFiles = [],
  disabled = false,
  size = 'small'
}) => {
  const { refreshCounter } = useMetadata();
  const [currentTags, setCurrentTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);

  // Load current tags and available tags
  useEffect(() => {
    const loadTags = async () => {
      try {
        setLoading(true);
        
        // Load current file tags
        const tags = await getUserTags(file, userId, userPrivateKey);
        setCurrentTags(tags);
        
        // Load all available tags from cached metadata - instant performance!
        const { metadataCache } = await import('../services/metadataCache');
        const allCachedMetadata = metadataCache.getAllCachedFileMetadata();

        // Collect all unique tags from cached metadata
        const allTagsSet = new Set<string>();
        for (const [_, metadata] of allCachedMetadata) {
          metadata.tags.forEach(tag => allTagsSet.add(tag));
        }

        const allTags = Array.from(allTagsSet).sort();
        setAvailableTags(allTags);
        console.log(`🏷️ TagInput: Loaded ${allTags.length} available tags from cache for suggestions`);
        
      } catch (error) {
        console.error('Error loading tags:', error);
      } finally {
        setLoading(false);
      }
    };

    if (file && userId && userPrivateKey) {
      loadTags();
    }
  }, [file, userId, userPrivateKey, refreshCounter]); // React to cache updates

  const handleAddTag = async (newTag: string) => {
    if (!newTag.trim() || currentTags.includes(newTag.trim().toLowerCase())) {
      return;
    }

    const normalizedTag = newTag.trim().toLowerCase();
    const updatedTags = [...currentTags, normalizedTag];

    try {
      setLoading(true);
      setCurrentTags(updatedTags);
      
      // Update in Firestore
      await updateUserTagsInFirestore(file.id!, userId, updatedTags, userPrivateKey, file);
      
      // Update available tags
      if (!availableTags.includes(normalizedTag)) {
        setAvailableTags([...availableTags, normalizedTag].sort());
      }
      
      // Notify parent component
      onTagsChange?.(updatedTags);
      
    } catch (error) {
      console.error('Error adding tag:', error);
      // Revert on error
      setCurrentTags(currentTags);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    const updatedTags = currentTags.filter(tag => tag !== tagToRemove);

    try {
      setLoading(true);
      setCurrentTags(updatedTags);
      
      // Update in Firestore
      await updateUserTagsInFirestore(file.id!, userId, updatedTags, userPrivateKey, file);
      
      // Notify parent component
      onTagsChange?.(updatedTags);
      
    } catch (error) {
      console.error('Error removing tag:', error);
      // Revert on error
      setCurrentTags(currentTags);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && inputValue.trim()) {
      event.preventDefault();
      handleAddTag(inputValue);
      setInputValue('');
    }
  };

  const filteredOptions = availableTags.filter(tag => 
    !currentTags.includes(tag) && 
    tag.includes(inputValue.toLowerCase())
  );

  return (
    <Box sx={{ width: '100%' }}>
      {/* Current Tags Display */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
        {currentTags.map((tag) => (
          <Chip
            key={tag}
            label={tag}
            size={size}
            color="primary"
            variant="outlined"
            icon={<LocalOffer fontSize="small" />}
            onDelete={disabled ? undefined : () => handleRemoveTag(tag)}
            deleteIcon={<Close fontSize="small" />}
            disabled={disabled || loading}
            sx={{
              '& .MuiChip-deleteIcon': {
                fontSize: '14px',
              },
            }}
          />
        ))}
        {currentTags.length === 0 && !loading && (
          <Typography 
            variant="caption" 
            color="text.secondary"
            sx={{ fontStyle: 'italic', py: 0.5 }}
          >
            No tags added
          </Typography>
        )}
      </Box>

      {/* Tag Input with Add Button */}
      {!disabled && (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Autocomplete
            sx={{ flexGrow: 1 }}
          size={size}
          options={filteredOptions}
          inputValue={inputValue}
          onInputChange={(_, newInputValue) => setInputValue(newInputValue)}
          onChange={(_, newValue) => {
            if (newValue) {
              handleAddTag(newValue);
              setInputValue('');
            }
          }}
          freeSolo
          disableClearable
          disabled={loading}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder={currentTags.length === 0 ? "Add tags..." : "Add another tag..."}
              variant="outlined"
              size={size}
              onKeyPress={handleKeyPress}
              InputProps={{
                ...params.InputProps,
                startAdornment: (
                  <Add 
                    fontSize="small" 
                    sx={{ 
                      color: 'action.active', 
                      mr: 0.5,
                      opacity: loading ? 0.5 : 1 
                    }} 
                  />
                ),
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  fontSize: size === 'small' ? '0.875rem' : '1rem',
                },
              }}
            />
          )}
          renderOption={(props, option) => {
            const { key, ...otherProps } = props;
            return (
              <Box component="li" key={key} {...otherProps}>
                <LocalOffer fontSize="small" sx={{ mr: 1, color: 'primary.main' }} />
                {option}
              </Box>
            );
          }}
          PaperComponent={(props) => (
            <Paper {...props} elevation={3}>
              {props.children}
            </Paper>
          )}
        />

        <Button
          variant="contained"
          size={size}
          onClick={() => {
            if (inputValue.trim()) {
              handleAddTag(inputValue.trim());
              setInputValue('');
            }
          }}
          disabled={loading || !inputValue.trim()}
          sx={{ minWidth: 'auto', px: 2 }}
        >
          Add
        </Button>
        </Box>
      )}
    </Box>
  );
};

export default TagInput;