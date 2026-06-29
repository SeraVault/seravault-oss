import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Button,
  Paper,
  Card,
  CardContent,
  CardActions,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Tabs,
  Tab,
  TextField,
  InputAdornment,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Star,
  Search,
  FilterList,
} from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { useTranslation } from 'react-i18next';
import FormTemplateEditor from '../components/FormTemplateEditor';
import type { FormTemplate } from '../utils/formFiles';
import { backendService } from '../backend/BackendService';
import { encryptTemplateForUser, decryptTemplateDoc } from '../services/templateEncryption';
import type { EncryptedTemplateDoc } from '../services/templateEncryption';

const FormTemplatesPage: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<FormTemplate | null>(null);
  
  // Filter state
  const [currentTab, setCurrentTab] = useState(0); // 0: My Templates, 1: Public Templates
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  // Real-time subscription to personal templates
  useEffect(() => {
    if (!user || !privateKey) return;

    const unsubscribe = backendService.query.subscribe(
      'formTemplates',
      [{ type: 'where', field: 'author', operator: '==', value: user.uid }],
      async (docs) => {
        const customTemplates: FormTemplate[] = (
          await Promise.all(
            docs.map(async (doc) => {
              try {
                if (doc.isEncrypted) {
                  const decrypted = await decryptTemplateDoc(
                    doc as unknown as EncryptedTemplateDoc & { id: string },
                    user.uid,
                    privateKey
                  );
                  return { ...decrypted, templateId: doc.id };
                }
                return { ...doc, templateId: doc.id } as FormTemplate;
              } catch (err) {
                console.error('Failed to decrypt template', doc.id, err);
                return null;
              }
            })
          )
        ).filter(Boolean) as FormTemplate[];

        setTemplates(customTemplates);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user, privateKey]);

  const applyFilters = React.useCallback(() => {
    let filtered = [...templates];

    // Tab filter (my templates vs public)
    if (currentTab === 0) {
      filtered = filtered.filter(t => t.author === user?.uid);
    } else {
      filtered = filtered.filter(t => t.isPublic);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t =>
        t.name.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query) ||
        t.category?.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (categoryFilter) {
      filtered = filtered.filter(t => t.category === categoryFilter);
    }

    setFilteredTemplates(filtered);
  }, [templates, searchQuery, categoryFilter, currentTab, user]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const handleCreateNew = () => {
    setSelectedTemplate(undefined);
    setEditorOpen(true);
  };

  const handleEdit = (template: FormTemplate) => {
    setSelectedTemplate(template);
    setEditorOpen(true);
  };

  const handleSaveTemplate = async (template: FormTemplate) => {
    if (!user || !privateKey) return;

    try {
      const encryptedPayload = await encryptTemplateForUser(template, user.uid, privateKey);

      if (selectedTemplate?.templateId) {
        await backendService.batch.update([{
          collection: 'formTemplates',
          id: selectedTemplate.templateId,
          data: {
            ...encryptedPayload,
            updatedAt: backendService.utils.serverTimestamp(),
          }
        }]);
      } else {
        const newId = `template_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        await backendService.batch.set([{
          collection: 'formTemplates',
          id: newId,
          data: {
            ...encryptedPayload,
            createdAt: backendService.utils.serverTimestamp(),
            updatedAt: backendService.utils.serverTimestamp(),
          }
        }]);
      }

      setEditorOpen(false);
      // Subscription will update the list automatically
    } catch (error) {
      console.error('Error saving template:', error);
      alert(t('templates.saveError', 'Failed to save template. Please try again.'));
    }
  };

  const handleDeleteClick = (template: FormTemplate) => {
    setTemplateToDelete(template);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!templateToDelete?.templateId) return;

    try {
      await backendService.batch.delete([{ collection: 'formTemplates', id: templateToDelete.templateId }]);
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
      // Subscription will update the list automatically
    } catch (error) {
      console.error('Error deleting template:', error);
      alert(t('templates.deleteError', 'Failed to delete template. Please try again.'));
    }
  };

  const getCategories = () => {
    const categories = new Set(templates.map(t => t.category).filter(Boolean));
    return Array.from(categories) as string[];
  };

  const renderTemplateCard = (template: FormTemplate) => {
    const isOwner = template.author === user?.uid;

    return (
      <Box key={template.templateId} sx={{ width: { xs: '100%', sm: '50%', md: '33.333%' }, p: 1.5 }}>
        <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <CardContent sx={{ flexGrow: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
                {template.name}
              </Typography>
              {template.isOfficial && (
                <Star sx={{ color: 'warning.main', fontSize: 20 }} />
              )}
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 40 }}>
              {template.description || t('templates.noDescription', 'No description')}
            </Typography>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
              <Chip
                label={t('templates.fieldsCount', '{{count}} fields', { count: template.schema.fields.length })}
                size="small"
                variant="outlined"
              />
              {template.isPublic && (
                <Chip label={t('templates.public', 'Public')} size="small" color="primary" variant="outlined" />
              )}
            </Box>

            <Typography variant="caption" color="text.secondary">
              {t('templates.usedTimes', 'Used {{count}} times', { count: template.usageCount || 0 })}
            </Typography>
          </CardContent>

          <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
            <Box>
              {isOwner && (
                <>
                  <IconButton
                    size="small"
                    onClick={() => handleEdit(template)}
                    color="primary"
                  >
                    <Edit fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => handleDeleteClick(template)}
                    color="error"
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </>
              )}
            </Box>
            <Button
              size="small"
              variant="contained"
              onClick={() => {
                // Navigate to home page and trigger form creation with this template
                navigate('/?createForm=' + template.templateId);
              }}
            >
              {t('templates.useTemplate', 'Use Template')}
            </Button>
          </CardActions>
        </Card>
      </Box>
    );
  };

  return (
    <Container maxWidth="xl" sx={{ py: isMobile ? 2 : 4, px: isMobile ? 1 : 3 }}>
      {/* Header */}
      <Box sx={{ mb: isMobile ? 2 : 4 }}>
          <Typography variant={isMobile ? 'h5' : 'h4'} component="h1" gutterBottom fontWeight={600}>
            {t('templates.pageTitle', 'Form Templates')}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t('templates.pageDescription', 'Create and manage reusable form templates for your organization')}
          </Typography>
        </Box>

      {/* Toolbar */}
      <Paper sx={{ p: isMobile ? 1.5 : 2, mb: isMobile ? 2 : 3 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            placeholder={t('templates.searchPlaceholder', 'Search templates...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="small"
            sx={{ minWidth: isMobile ? '100%' : 250 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
          />

          <Button
            variant={categoryFilter ? 'contained' : 'outlined'}
            startIcon={<FilterList />}
            size="small"
            onClick={() => {
              // Simple category toggle - in real app, could be a menu
              const categories = getCategories();
              const currentIndex = categories.indexOf(categoryFilter);
              const nextIndex = (currentIndex + 1) % (categories.length + 1);
              setCategoryFilter(nextIndex === categories.length ? '' : categories[nextIndex]);
            }}
          >
            {categoryFilter || t('templates.allCategories', 'All Categories')}
          </Button>

          <Box sx={{ flexGrow: 1 }} />

          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleCreateNew}
            fullWidth={isMobile}
            sx={{ minWidth: isMobile ? '100%' : 'auto' }}
          >
            {t('templates.createTemplateButton', 'Create Template')}
          </Button>
        </Box>

        <Tabs
          value={currentTab}
          onChange={(_, newValue) => setCurrentTab(newValue)}
          sx={{ mt: 2 }}
          variant={isMobile ? 'scrollable' : 'standard'}
          scrollButtons={isMobile ? 'auto' : false}
          allowScrollButtonsMobile
        >
          <Tab label={t('templates.myTemplates', 'My Templates')} />
          <Tab label={t('templates.publicTemplates', 'Public Templates')} />
        </Tabs>
      </Paper>

      {/* Templates Grid */}
      {loading ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography color="text.secondary">{t('templates.loading', 'Loading templates...')}</Typography>
        </Box>
      ) : filteredTemplates.length === 0 ? (
        <Paper sx={{ p: 8, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {t('templates.noTemplatesFound', 'No templates found')}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            {currentTab === 0
              ? t('templates.noMyTemplatesMessage', "You haven't created any templates yet. Click 'Create Template' to get started.")
              : t('templates.noPublicTemplatesMessage', 'No public templates available at this time.')}
          </Typography>
          {currentTab === 0 && (
            <Button variant="contained" startIcon={<Add />} onClick={handleCreateNew}>
              {t('templates.createFirstTemplate', 'Create Your First Template')}
            </Button>
          )}
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', margin: -1.5 }}>
          {filteredTemplates.map(renderTemplateCard)}
        </Box>
      )}

      {/* Template Editor Dialog */}
      <FormTemplateEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={handleSaveTemplate}
        existingTemplate={selectedTemplate}
        userId={user?.uid || ''}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>{t('templates.deleteDialogTitle', 'Delete Template?')}</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('templates.deleteWarning', 'This action cannot be undone. The template will be permanently deleted.')}
          </Alert>
          <Typography>
            {t('templates.deleteConfirmation', 'Are you sure you want to delete the template "{{name}}"?', { name: templateToDelete?.name })}
          </Typography>
          {templateToDelete && templateToDelete.usageCount && templateToDelete.usageCount > 0 && (
            <Typography color="error" sx={{ mt: 2 }}>
              {t('templates.deleteUsageWarning', 'This template has been used {{count}} times.', { count: templateToDelete.usageCount })}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            {t('common.delete', 'Delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default FormTemplatesPage;
