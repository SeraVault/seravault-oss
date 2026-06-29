// @ts-nocheck
import React, { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Paper,
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import { Delete, AttachFile, Info, Storage } from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { useTranslation } from 'react-i18next';
import { 
  cleanupOrphanedFormAttachments,
  getFormAttachmentStats,
} from '../utils/cleanupFiles';

const FileCleanup: React.FC = () => {
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const { t } = useTranslation();
  
  // Orphaned attachments state
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [attachmentStats, setAttachmentStats] = useState<{
    totalAttachments: number;
    referencedAttachments: number;
    orphanedAttachments: number;
    totalForms: number;
  } | null>(null);
  const [orphanedIds, setOrphanedIds] = useState<string[]>([]);
  const [attachmentMessage, setAttachmentMessage] = useState<string>('');
  const [attachmentError, setAttachmentError] = useState<string>('');

  // Orphaned attachments functions
  const scanForOrphanedAttachments = async () => {
    if (!user || !privateKey) {
      setAttachmentError(t('cleanup.privateKeyRequired', 'Your private key is required to scan form attachments. Please unlock your vault first.'));
      return;
    }
    
    setAttachmentLoading(true);
    setAttachmentError('');
    setAttachmentMessage('');
    
    try {
      const stats = await getFormAttachmentStats(user.uid, privateKey);
      setAttachmentStats(stats);
      
      // Also run a dry-run to get the list of orphaned IDs
      const result = await cleanupOrphanedFormAttachments(user.uid, privateKey, true);
      setOrphanedIds(result.orphaned); // In dry run, orphaned IDs are in result.orphaned
      
      if (result.orphaned.length === 0) {
        setAttachmentMessage(t('cleanup.noOrphanedFound'));
      } else {
        setAttachmentMessage(t('cleanup.foundOrphaned', { count: result.orphaned.length }));
      }
    } catch (err) {
      setAttachmentError(t('cleanup.scanError', { error: err instanceof Error ? err.message : 'Unknown error' }));
    } finally {
      setAttachmentLoading(false);
    }
  };

  const deleteOrphanedAttachments = async () => {
    if (!user || !privateKey) {
      setAttachmentError(t('cleanup.privateKeyRequired', 'Your private key is required to scan form attachments. Please unlock your vault first.'));
      return;
    }
    
    setAttachmentLoading(true);
    setAttachmentError('');
    setAttachmentMessage('');
    
    try {
      const result = await cleanupOrphanedFormAttachments(user.uid, privateKey, false);
      
      if (result.deleted.length > 0) {
        setAttachmentMessage(t('cleanup.successDeleted', { count: result.deleted.length }));
      }
      
      if (result.errors.length > 0) {
        setAttachmentError(t('cleanup.failedToDelete', { count: result.errors.length }));
      }
      
      // Reset state
      setOrphanedIds([]);
      setAttachmentStats(null);
    } catch (err) {
      setAttachmentError(t('cleanup.deleteError', { error: err instanceof Error ? err.message : 'Unknown error' }));
    } finally {
      setAttachmentLoading(false);
    }
  };

  if (!user) {
    return (
      <Alert severity="warning">
        {t('cleanup.loginRequired', 'You must be logged in to use the cleanup utilities.')}
      </Alert>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <Storage />
        {t('cleanup.title', 'Storage Maintenance')}
      </Typography>
      
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        {t('cleanup.description', 'Clean up orphaned files and free up storage space.')}
      </Typography>

      <Grid container spacing={3}>
        {/* Orphaned Form Attachments Card */}
        <Grid item xs={12}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AttachFile color="primary" />
                {t('cleanup.orphanedAttachments', 'Orphaned Form Attachments')}
              </Typography>
              
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t('cleanup.orphanedDescription', 'Find and remove attachment files that are no longer associated with any form. This can happen when forms were deleted before automatic cleanup was implemented.')}
              </Typography>

              {!privateKey && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    {t('cleanup.privateKeyRequired', 'Your private key is required to scan form attachments. Please unlock your vault first.')}
                  </Typography>
                </Alert>
              )}

              {attachmentStats && (
                <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
                  <Grid container spacing={2}>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">
                        {t('cleanup.totalForms', 'Forms')}
                      </Typography>
                      <Typography variant="h6">{attachmentStats.totalForms}</Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">
                        {t('cleanup.totalAttachments', 'Total Attachments')}
                      </Typography>
                      <Typography variant="h6">{attachmentStats.totalAttachments}</Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">
                        {t('cleanup.referenced', 'Referenced')}
                      </Typography>
                      <Typography variant="h6" color="success.main">{attachmentStats.referencedAttachments}</Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">
                        {t('cleanup.orphaned', 'Orphaned')}
                      </Typography>
                      <Typography variant="h6" color={attachmentStats.orphanedAttachments > 0 ? 'warning.main' : 'success.main'}>
                        {attachmentStats.orphanedAttachments}
                      </Typography>
                    </Grid>
                  </Grid>
                </Paper>
              )}

              {attachmentMessage && (
                <Alert severity={attachmentMessage.includes('✅') ? 'success' : 'info'} sx={{ mb: 2 }}>
                  {attachmentMessage}
                </Alert>
              )}

              {attachmentError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {attachmentError}
                </Alert>
              )}

              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="outlined"
                  onClick={scanForOrphanedAttachments}
                  disabled={attachmentLoading || !privateKey}
                  startIcon={attachmentLoading ? <CircularProgress size={16} /> : <Info />}
                >
                  {attachmentLoading ? t('cleanup.scanning', 'Scanning...') : t('cleanup.scanAttachments', 'Scan for Orphaned Attachments')}
                </Button>

                {orphanedIds.length > 0 && (
                  <Button
                    variant="contained"
                    color="error"
                    onClick={deleteOrphanedAttachments}
                    disabled={attachmentLoading}
                    startIcon={<Delete />}
                  >
                    {t('cleanup.deleteOrphaned', 'Delete {{count}} Orphaned Attachment(s)', { count: orphanedIds.length })}
                  </Button>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default FileCleanup;