import React, { useState } from 'react';
import {
  IconButton,
  Popover,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Typography,
  Box,
  Divider,
} from '@mui/material';
import { ViewColumn } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

export interface ColumnVisibility {
  type: boolean;
  size: boolean;
  shared: boolean;
  created: boolean;
  modified: boolean;
  owner: boolean;
}

interface ColumnSelectorProps {
  columnVisibility: ColumnVisibility;
  onColumnVisibilityChange: (visibility: ColumnVisibility) => void;
}

export const ColumnSelector: React.FC<ColumnSelectorProps> = ({
  columnVisibility,
  onColumnVisibilityChange,
}) => {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleColumnToggle = (column: keyof ColumnVisibility) => {
    const newVisibility = {
      ...columnVisibility,
      [column]: !columnVisibility[column],
    };
    onColumnVisibilityChange(newVisibility);
  };

  const open = Boolean(anchorEl);

  return (
    <>
      <IconButton
        onClick={handleClick}
        size="small"
        aria-label={t('common.configureColumns', 'Configure columns')}
        title={t('common.configureColumns', 'Configure columns')}
      >
        <ViewColumn />
      </IconButton>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <Box sx={{ p: 2, minWidth: 200 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t('fileTable.columnVisibility', 'Column Visibility')}
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  checked={columnVisibility.type}
                  onChange={() => handleColumnToggle('type')}
                  size="small"
                />
              }
              label={t('fileTable.columns.type', 'Type')}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={columnVisibility.size}
                  onChange={() => handleColumnToggle('size')}
                  size="small"
                />
              }
              label={t('fileTable.columns.size', 'Size')}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={columnVisibility.shared}
                  onChange={() => handleColumnToggle('shared')}
                  size="small"
                />
              }
              label={t('fileTable.columns.shared', 'Shared')}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={columnVisibility.created}
                  onChange={() => handleColumnToggle('created')}
                  size="small"
                />
              }
              label={t('fileTable.columns.created', 'Created')}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={columnVisibility.modified}
                  onChange={() => handleColumnToggle('modified')}
                  size="small"
                />
              }
              label={t('fileTable.columns.modified', 'Modified')}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={columnVisibility.owner}
                  onChange={() => handleColumnToggle('owner')}
                  size="small"
                />
              }
              label={t('fileTable.columns.owner', 'Owner')}
            />
          </FormGroup>
        </Box>
      </Popover>
    </>
  );
};