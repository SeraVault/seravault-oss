// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Paper,
  Typography,
  Button,
  Box,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  Chip,
  LinearProgress,
  Divider,
  Collapse,
  IconButton,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from '@mui/material';
import { Upload, CheckCircle, Error as ErrorIcon, FolderZip, ExpandMore, ExpandLess, Code } from '@mui/icons-material';
import { useImport } from '../context/ImportContext';
import { useImportProgress } from '../context/ImportProgressContext';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { importExportedData } from '../services/dataImport';

const JsonImport: React.FC = () => {
  const { t } = useTranslation();
  const { importing, progress, results, error, startImport, clearResults } = useImport();
  const { 
    isImporting: isImportingExport, 
    progress: exportProgress, 
    results: exportResults, 
    startImport: startExportImport,
    updateProgress: updateExportProgress,
    completeImport: completeExportImport,
    cancelImport: cancelExportImport,
    clearResults: clearExportResults 
  } = useImportProgress();
  const { user } = useAuth();
  const { publicKey, privateKey } = usePassphrase();
  const [showResults, setShowResults] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showJsonFormat, setShowJsonFormat] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<'seravault' | '1password' | 'bitwarden' | 'lastpass' | 'dashlane'>('seravault');

  // Prevent browser navigation/refresh during import
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (importing || isImportingExport) {
        e.preventDefault();
        e.returnValue = t('profile.importInProgress', 'Import in progress. Are you sure you want to leave?');
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [importing, isImportingExport, t]);

  // Show results dialog when import completes
  useEffect(() => {
    if (!importing && results.length > 0) {
      setShowResults(true);
    }
  }, [importing, results]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log('File selected:', file.name, file.type, file.size);
    setLocalError(null);
    
    try {
      console.log('Starting import...');
      await startImport(file);
      console.log('Import started successfully');
    } catch (err) {
      console.error('Import failed:', err);
      setLocalError(err instanceof Error ? err.message : t('profile.failedToStartImport', 'Failed to start import'));
    } finally {
      // Reset file input
      event.target.value = '';
    }
  };

  const handleExportFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    console.log('ZIP file selected:', file?.name, file?.type, file?.size);
    
    if (!file) {
      console.log('No file selected');
      return;
    }

    if (!file.name.endsWith('.zip')) {
      console.log('Invalid file type:', file.name);
      setLocalError(t('profile.invalidFileType', 'Please select a ZIP file'));
      event.target.value = '';
      return;
    }

    console.log('User check:', { user: !!user, privateKey: !!privateKey });
    
    if (!user || !privateKey) {
      console.log('Missing credentials');
      setLocalError(t('profile.unlockKeyRequired', 'Please unlock your private key first'));
      event.target.value = '';
      return;
    }

    console.log('Starting ZIP import...');
    setLocalError(null);
    startExportImport();
    
    try {
      console.log('Calling importExportedData...');
      const result = await importExportedData(file, user.uid, privateKey, {
        onProgress: (progress) => {
          console.log('Import progress:', progress);
          updateExportProgress(progress);
        },
        skipDuplicates: true,
      });

      console.log('Import completed:', result);
      completeExportImport({
        filesImported: result.filesImported,
        formsImported: result.formsImported,
        chatsImported: result.chatsImported,
        errors: result.errors,
      });
      setShowResults(true);
    } catch (err) {
      console.error('Import failed:', err);
      setLocalError(err instanceof Error ? err.message : t('profile.failedToImportExport', 'Failed to import exported data'));
      cancelExportImport();
    } finally {
      console.log('Import finished');
      // Reset file input
      event.target.value = '';
    }
  };

  const handleCloseResults = () => {
    setShowResults(false);
    clearResults();
    clearExportResults();
  };

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;
  const displayError = error || localError;

  return (
    <>
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          {t('profile.importData', 'Import Data')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('profile.importDataDesc', 'Import items from JSON or restore exported data from a ZIP file.')}
        </Typography>

        {displayError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setLocalError(null)}>
            {displayError}
          </Alert>
        )}

        {/* Import from JSON */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" fontWeight="600" gutterBottom>
            {t('profile.importFromJson', 'Import from JSON')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('profile.importItemsDesc', 'Import items from a JSON file. Supported types: "account" (passwords), "note" (secure notes), "credit_card" (credit cards), and "key" (crypto keys).')}
          </Typography>

          {importing && progress.total > 0 && (
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                  {t('profile.importingItems', 'Importing {{current}} of {{total}} items...', { current: progress.current, total: progress.total })}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {Math.round((progress.current / progress.total) * 100)}%
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={(progress.current / progress.total) * 100} 
              />
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              accept=".json"
              style={{ display: 'none' }}
              id="json-file-input"
              type="file"
              onChange={handleFileSelect}
              disabled={importing || isImportingExport}
            />
            <label htmlFor="json-file-input">
              <Button
                variant="contained"
                component="span"
                startIcon={importing ? <CircularProgress size={20} /> : <Upload />}
                disabled={importing || isImportingExport}
              >
                {importing ? t('profile.importing', 'Importing...') : t('profile.selectJsonFile', 'Select JSON File')}
              </Button>
            </label>
            
            <Button
              onClick={() => setShowJsonFormat(!showJsonFormat)}
              endIcon={showJsonFormat ? <ExpandLess /> : <ExpandMore />}
              startIcon={<Code />}
              variant="outlined"
              size="medium"
              sx={{ textTransform: 'none' }}
            >
              {t('profile.viewJsonTemplates', 'View JSON Templates')}
            </Button>
          </Box>
          
          <Collapse in={showJsonFormat}>
            <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel>{t('profile.selectTemplate', 'Select Template')}</InputLabel>
                <Select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value as any)}
                  label={t('profile.selectTemplate', 'Select Template')}
                >
                  <MenuItem value="seravault">SeraVault Format</MenuItem>
                  <MenuItem value="1password">1Password Export</MenuItem>
                  <MenuItem value="bitwarden">Bitwarden Export</MenuItem>
                  <MenuItem value="lastpass">LastPass Export</MenuItem>
                  <MenuItem value="dashlane">Dashlane Export</MenuItem>
                </Select>
              </FormControl>

              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                {selectedTemplate === 'seravault' && t('profile.seravaultFormatDesc', 'SeraVault native JSON format')}
                {selectedTemplate === '1password' && t('profile.1passwordFormatDesc', 'Export from 1Password as JSON (1pux format not supported)')}
                {selectedTemplate === 'bitwarden' && t('profile.bitwardenFormatDesc', 'Export from Bitwarden as JSON')}
                {selectedTemplate === 'lastpass' && t('profile.lastpassFormatDesc', 'Export from LastPass as JSON (CSV not supported)')}
                {selectedTemplate === 'dashlane' && t('profile.dashlaneFormatDesc', 'Export from Dashlane as JSON')}
              </Typography>

              <Box
                component="pre"
                sx={{
                  p: 2,
                  bgcolor: 'grey.900',
                  color: 'grey.100',
                  borderRadius: 1,
                  fontSize: '0.75rem',
                  overflow: 'auto',
                  maxHeight: '400px',
                }}
              >
{selectedTemplate === 'seravault' && `{
  "items": [
    {
      "type": "account",
      "title": "Example Account",
      "url": "https://example.com",
      "login": "username",
      "password": "password123",
      "tags": ["Work"]
    }
  ]
}`}
{selectedTemplate === '1password' && `[
  {
    "title": "Example Login",
    "category": "LOGIN",
    "fields": [
      {
        "designation": "username",
        "value": "user@example.com"
      },
      {
        "designation": "password",
        "value": "password123"
      }
    ],
    "urls": [{ "url": "https://example.com" }]
  }
]`}
{selectedTemplate === 'bitwarden' && `{
  "items": [
    {
      "type": 1,
      "name": "Example Login",
      "login": {
        "username": "user@example.com",
        "password": "password123",
        "uris": [{ "uri": "https://example.com" }]
      }
    }
  ]
}`}
{selectedTemplate === 'lastpass' && `[
  {
    "name": "Example Login",
    "username": "user@example.com",
    "password": "password123",
    "url": "https://example.com"
  }
]`}
{selectedTemplate === 'dashlane' && `[
  {
    "title": "Example Login",
    "username": "user@example.com",
    "password": "password123",
    "domain": "example.com"
  }
]`}
              </Box>
            </Box>
          </Collapse>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Import Exported Data */}
        <Box>
          <Typography variant="subtitle1" fontWeight="600" gutterBottom>
            {t('profile.importExportedData', 'Import Exported Data')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('profile.importExportedDesc', 'Restore files from a ZIP file exported from the Danger Zone. The exported files are decrypted, and will be re-encrypted with your passphrase during import.')}
          </Typography>

          {!privateKey && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {t('profile.unlockKeyRequired', 'Please unlock your private key first')}
            </Alert>
          )}

          {isImportingExport && exportProgress && exportProgress.totalItems > 0 && (
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                  {t('profile.importingExport', 'Importing {{current}} of {{total}} items...', { current: exportProgress.itemsProcessed, total: exportProgress.totalItems })}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {exportProgress.totalItems > 0 ? Math.round((exportProgress.itemsProcessed / exportProgress.totalItems) * 100) : 0}%
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={exportProgress.totalItems > 0 ? (exportProgress.itemsProcessed / exportProgress.totalItems) * 100 : 0} 
              />
            </Box>
          )}

          <Box>
            <input
              accept=".zip"
              style={{ display: 'none' }}
              id="export-file-input"
              type="file"
              onChange={handleExportFileSelect}
              disabled={importing || isImportingExport || !privateKey}
            />
            <label htmlFor="export-file-input">
              <Button
                variant="contained"
                color="secondary"
                component="span"
                startIcon={isImportingExport ? <CircularProgress size={20} /> : <FolderZip />}
                disabled={importing || isImportingExport || !privateKey}
              >
                {isImportingExport ? t('profile.importing', 'Importing...') : t('profile.selectExportFile', 'Select Export ZIP File')}
              </Button>
            </label>
          </Box>
        </Box>
      </Paper>

      {/* Results Dialog */}
      <Dialog
        open={showResults}
        onClose={handleCloseResults}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {t('profile.importResults', 'Import Results')}
        </DialogTitle>
        <DialogContent>
          {exportResults ? (
            <>
              <Box sx={{ mb: 2 }}>
                <Chip
                  label={t('profile.filesImported', '{{count}} files imported', { count: exportResults.filesImported })}
                  color="success"
                  icon={<CheckCircle />}
                  sx={{ mr: 1, mb: 1 }}
                />
                <Chip
                  label={t('profile.formsImported', '{{count}} forms imported', { count: exportResults.formsImported })}
                  color="success"
                  icon={<CheckCircle />}
                  sx={{ mr: 1, mb: 1 }}
                />
              </Box>

              {exportResults.errors.length > 0 && (
                <>
                  <Typography variant="subtitle2" color="error" gutterBottom sx={{ mt: 2 }}>
                    {t('profile.importErrors', 'Errors:')}
                  </Typography>
                  <List>
                    {exportResults.errors.map((error, index) => (
                      <ListItem
                        key={index}
                        sx={{
                          bgcolor: 'error.light',
                          borderRadius: 1,
                          mb: 1,
                          opacity: 0.8,
                        }}
                      >
                        <ListItemText
                          primary={error}
                          primaryTypographyProps={{
                            color: 'error.dark',
                            variant: 'body2',
                          }}
                        />
                        <ErrorIcon color="error" />
                      </ListItem>
                    ))}
                  </List>
                </>
              )}
            </>
          ) : (
            <>
              <Box sx={{ mb: 2 }}>
                <Chip
                  label={t('profile.successfulCount', '{{count}} successful', { count: successCount })}
                  color="success"
                  icon={<CheckCircle />}
                  sx={{ mr: 1 }}
                />
                {failureCount > 0 && (
                  <Chip
                    label={t('profile.failedCount', '{{count}} failed', { count: failureCount })}
                    color="error"
                    icon={<ErrorIcon />}
                  />
                )}
              </Box>

              <List>
                {results.map((result, index) => (
                  <ListItem
                    key={index}
                    sx={{
                      bgcolor: result.success ? 'success.light' : 'error.light',
                      borderRadius: 1,
                      mb: 1,
                      opacity: 0.8,
                    }}
                  >
                    <ListItemText
                      primary={result.title}
                      secondary={result.error}
                      primaryTypographyProps={{
                        color: result.success ? 'success.dark' : 'error.dark',
                      }}
                      secondaryTypographyProps={{
                        color: 'error.dark',
                      }}
                    />
                    {result.success ? (
                      <CheckCircle color="success" />
                    ) : (
                      <ErrorIcon color="error" />
                    )}
                  </ListItem>
                ))}
              </List>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseResults} variant="contained">
            {t('profile.close', 'Close')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default JsonImport;
