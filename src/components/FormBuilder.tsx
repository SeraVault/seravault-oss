import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Tabs,
  Tab,
  CircularProgress,
  useTheme,
  useMediaQuery,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  CreditCard,
  Lock,
  StickyNote2,
  Extension,
  AccountBalance,
  Person,
  Wifi,
  AccountBalanceWallet,
  LocalHospital,
  Gavel,
  VpnKey as License,
  Security,
  DriveEta,
  Star as StarIcon,
  Search,
  Close,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { 
  createBlankForm, 
  type SecureFormData,
  type FormTemplate
} from '../utils/formFiles';
import { getBuiltInFormTemplates, createFormFromTemplate as createEmbeddedForm } from '../utils/embeddedTemplates';
import { backendService } from '../backend/BackendService';
import FormTemplateEditor from './FormTemplateEditor';

interface FormBuilderProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  privateKey: string;
  parentFolder: string | null;
  onFormCreated: (fileId: string | null, formData?: SecureFormData) => void;
  initialTemplateId?: string; // Optional template to pre-select
}

const TEMPLATE_ICONS = {
  credit_card: CreditCard,
  password: Lock,
  secure_note: StickyNote2,
  bank_account: AccountBalance,
  identity: Person,
  wifi_network: Wifi,
  crypto_wallet: AccountBalanceWallet,
  medical_record: LocalHospital,
  legal_document: Gavel,
  software_license: License,
  insurance_policy: Security,
  vehicle_info: DriveEta,
};

const FormBuilder: React.FC<FormBuilderProps> = ({
  open,
  onClose,
  userId,
  privateKey,
  parentFolder,
  onFormCreated,
  initialTemplateId,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [allTemplates, setAllTemplates] = useState<{ [key: string]: FormTemplate }>({});
  const [loading, setLoading] = useState(true);

  // Real-time subscription to personal templates
  useEffect(() => {
    if (!userId || !privateKey) return;

    const translateFn = (key: string, fallback?: string) => t(key, fallback || key);
    const builtIn = getBuiltInFormTemplates(translateFn);

    const unsubscribe = backendService.query.subscribe(
      'formTemplates',
      [{ type: 'where', field: 'author', operator: '==', value: userId }],
      async (docs) => {
        const custom: { [key: string]: FormTemplate } = {};
        await Promise.all(
          docs.map(async (data) => {
            try {
              let template: FormTemplate;
              if (data.isEncrypted && privateKey) {
                const { decryptTemplateDoc } = await import('../services/templateEncryption');
                template = await decryptTemplateDoc(
                  data as Parameters<typeof decryptTemplateDoc>[0],
                  userId,
                  privateKey
                );
              } else if (!data.isEncrypted) {
                template = data as FormTemplate;
              } else {
                return;
              }
              const key = template.templateId || data.id;
              custom[key] = { ...template, templateId: data.id };
            } catch (err) {
              console.error('Failed to decrypt template', data.id, err);
            }
          })
        );
        setAllTemplates({ ...builtIn, ...custom });
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userId, privateKey, t]);
  
  const [step, setStep] = useState<'choose' | 'saving'>('choose');
  const [saving, setSaving] = useState(false);
  
  // Template browsing state
  const [currentTab, setCurrentTab] = useState(0); // 0: Built-in, 1: Personal
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<FormTemplate | undefined>();
  
  // If initialTemplateId is provided, auto-select it when templates load
  useEffect(() => {
    if (initialTemplateId && allTemplates[initialTemplateId] && open) {
      const template = allTemplates[initialTemplateId];
      // Auto-select this template
      handleTemplateSelect(template);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTemplateId, allTemplates, open]);
  
  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setStep('choose');
      setSaving(false);
      setCurrentTab(0);
      setSelectedCategory('');
      setSearchQuery('');
    }
  }, [open]);

  const handleSaveTemplate = async (template: FormTemplate) => {
    try {
      const { encryptTemplateForUser } = await import('../services/templateEncryption');
      const { backendService } = await import('../backend/BackendService');
      const encryptedPayload = await encryptTemplateForUser(template, userId, privateKey);
      if (editingTemplate?.templateId) {
        await backendService.batch.update([{
          collection: 'formTemplates',
          id: editingTemplate.templateId,
          data: { ...encryptedPayload, updatedAt: backendService.utils.serverTimestamp() }
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
      setTemplateEditorOpen(false);
      setEditingTemplate(undefined);
      // Subscription will update the list automatically
    } catch (error) {
      console.error('Error saving template:', error);
    }
  };

  // Get all templates as array
  const templatesArray = Object.values(allTemplates);
  
  // Separate built-in and custom templates
  const builtInTemplates = templatesArray.filter(t => t.isOfficial !== false && !t.author);
  const customTemplates = templatesArray.filter(t => t.author === userId || t.isOfficial === false);
  
  // Get categories from built-in templates
  const categories = Array.from(new Set(builtInTemplates.map(t => t.category).filter(Boolean)));

  // Filter templates by search query and category
  const filterTemplates = (list: FormTemplate[]) => {
    let result = list;
    if (selectedCategory) {
      result = result.filter(tmpl => tmpl.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(tmpl =>
        tmpl.name.toLowerCase().includes(q) ||
        tmpl.description?.toLowerCase().includes(q) ||
        tmpl.category?.toLowerCase().includes(q)
      );
    }
    return result;
  };


  const handleClose = () => {
    if (!saving) {
      setStep('choose');
      setCurrentTab(0);
      setSelectedCategory('');
      onClose();
    }
  };

  const handleTemplateSelect = (template: FormTemplate) => {
    // Start creation process immediately without awaiting
    createFormDirectly(template, template.name).catch(error => {
      console.error('Error in handleTemplateSelect:', error);
      // Reset the saving state if there was an error
      setSaving(false);
      setStep('choose');
    });
  };

  const createFormDirectly = async (template: FormTemplate | null, name: string) => {
    if (!name.trim()) return;

    setSaving(true);
    setStep('saving');

    try {
      let formData: SecureFormData;

      if (template && template.templateId) {
        const translateFn = (key: string, fallback?: string) => t(key, fallback || key);
        // If it's a custom (personal) template we already have it decrypted in state —
        // build the form directly without re-fetching from Firestore.
        if (template.author) {
          const now = new Date().toISOString();
          formData = {
            metadata: {
              name,
              description: `Created from template: ${template.name}`,
              category: template.category,
              icon: template.icon,
              color: template.color,
              version: '1.0.0',
              author: userId,
              created: now,
              modified: now,
            },
            template: JSON.parse(JSON.stringify(template)),
            schema: JSON.parse(JSON.stringify(template.schema)),
            data: JSON.parse(JSON.stringify(template.defaultData || {})),
            attachments: {},
            tags: [...(template.tags || [])],
          };
        } else {
          // Built-in template — use the embedded template system
          formData = await createEmbeddedForm(template.templateId, name, userId, translateFn);
        }
      } else {
        formData = createBlankForm(name, userId);
      }

      // Don't save to Firestore yet - just pass the form data to be edited
      onFormCreated(null, formData); // Pass null fileId and the form data
      handleClose();
    } catch (error) {
      console.error('Error creating form:', error);
      console.error('Template:', template);
      console.error('Name:', name);
      console.error('UserId:', userId);
      console.error('PrivateKey present:', !!privateKey);
      console.error('ParentFolder:', parentFolder);
      setSaving(false);
      setStep('choose'); // Go back to choose step on error
      throw error; // Re-throw to be caught by caller's catch handler
    }
  };


  // Get icon for template
  const getTemplateIcon = (template: FormTemplate) => {
    if (template.icon) {
      const IconComponent = TEMPLATE_ICONS[template.icon as keyof typeof TEMPLATE_ICONS];
      if (IconComponent) return IconComponent;
    }
    return Extension; // Default icon
  };

  // Render template card
  const renderTemplateCard = (template: FormTemplate) => {
    const IconComponent = getTemplateIcon(template);
    const fieldNames = template.schema.fields.slice(0, 4).map(f => f.label).join(', ');
    const tooltipText = `${template.schema.fields.length} fields${fieldNames ? ': ' + fieldNames : ''}${template.schema.fields.length > 4 ? '...' : ''}`;
    
    return (
      <Tooltip key={template.templateId} title={tooltipText} placement="top">
        <Card 
          sx={{ 
            cursor: 'pointer',
            width: '100%',
            height: '100%',
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              boxShadow: (theme) => theme.shadows[4],
              transform: 'translateY(-2px)',
            }
          }} 
          onClick={() => handleTemplateSelect(template)}
        >
          <CardContent sx={{ py: 2.5, height: '100%', boxSizing: 'border-box' }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
              <Box 
                sx={{ 
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  bgcolor: template.color + '20',
                  mr: 2,
                  flexShrink: 0,
                }}
              >
                <IconComponent 
                  sx={{ 
                    fontSize: 26, 
                    color: template.color || 'primary.main'
                  }} 
                />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                    {template.name}
                  </Typography>
                  {template.isOfficial && (
                    <Tooltip title={t('forms.officialTemplate', 'Official template')}>
                      <StarIcon sx={{ fontSize: 14, color: 'warning.main', flexShrink: 0 }} />
                    </Tooltip>
                  )}
                </Box>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    mb: 1.5,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {template.description}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                  <Chip 
                    label={t('forms.fieldsCount', { count: template.schema.fields.length, defaultValue: '{{count}} fields' })} 
                    size="small" 
                    variant="outlined"
                    sx={{ fontSize: '0.7rem', height: 20 }}
                  />
                  {template.category && (
                    <Chip 
                      label={template.category} 
                      size="small" 
                      sx={{ 
                        fontSize: '0.7rem',
                        height: 20,
                        bgcolor: template.color + '15',
                        color: template.color,
                        fontWeight: 500
                      }}
                    />
                  )}
                </Box>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Tooltip>
    );
  };

  const renderChooseStep = () => {
    const visibleBuiltIn = filterTemplates(builtInTemplates);
    const visibleCustom = filterTemplates(customTemplates);

    return (
      <>
        <DialogTitle sx={{ 
          textAlign: 'center', 
          pb: 1,
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}>
          {t('forms.createNewForm')}
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 2, maxHeight: isMobile ? undefined : 'calc(90vh - 200px)', overflowY: 'auto', flex: isMobile ? 1 : undefined }}>

          {/* Search bar */}
          <TextField
            fullWidth
            size="small"
            placeholder={t('forms.searchTemplates', 'Search templates...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: searchQuery ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchQuery('')} edge="end">
                    <Close fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />

          {/* Category filter chips */}
          {categories.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
              <Chip
                label={t('forms.allCategories', 'All')}
                onClick={() => setSelectedCategory('')}
                color={!selectedCategory ? 'primary' : 'default'}
                variant={!selectedCategory ? 'filled' : 'outlined'}
                size="small"
              />
              {categories.map(cat => (
                <Chip
                  key={cat}
                  label={cat}
                  onClick={() => setSelectedCategory(selectedCategory === cat ? '' : cat)}
                  color={selectedCategory === cat ? 'primary' : 'default'}
                  variant={selectedCategory === cat ? 'filled' : 'outlined'}
                  size="small"
                />
              ))}
            </Box>
          )}

          {/* Tabs: Built-in / Personal */}
          <Tabs 
            value={currentTab} 
            onChange={(_, newValue) => setCurrentTab(newValue)}
            sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
          >
            <Tab label={t('forms.builtInTemplates', 'Built-in Templates')} />
            <Tab label={t('forms.personalTemplates', 'Personal Templates')} />
          </Tabs>

          {/* Built-in Templates Grid */}
          {currentTab === 0 && (
            loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                  gap: 2,
                  alignItems: 'stretch',
                }}
              >
                {visibleBuiltIn.map((template, index) => (
                  <Box key={`${template.templateId}-${template.name}-${index}`} sx={{ display: 'flex' }}>
                    {renderTemplateCard(template)}
                  </Box>
                ))}
                {visibleBuiltIn.length === 0 && (
                  <Box sx={{ gridColumn: '1 / -1' }}>
                    <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                      {searchQuery || selectedCategory
                        ? t('forms.noTemplatesMatchSearch', 'No templates match your search')
                        : t('forms.noBuiltInTemplates', 'No built-in templates available')}
                    </Typography>
                  </Box>
                )}
              </Box>
            )
          )}

          {/* Personal Templates Grid */}
          {currentTab === 1 && (
            loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                  <Button
                    variant="outlined"
                    startIcon={<Extension />}
                    size="small"
                    onClick={() => { setEditingTemplate(undefined); setTemplateEditorOpen(true); }}
                  >
                    {t('forms.createTemplate', 'Create Template')}
                  </Button>
                </Box>
                {customTemplates.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 6 }}>
                    <Typography color="text.secondary" gutterBottom>
                      {t('forms.noPersonalTemplates', "You haven't created any personal templates yet.")}
                    </Typography>
                    <Button
                      variant="contained"
                      startIcon={<Extension />}
                      onClick={() => { setEditingTemplate(undefined); setTemplateEditorOpen(true); }}
                      sx={{ mt: 1 }}
                    >
                      {t('forms.createFirstTemplate', 'Create Your First Template')}
                    </Button>
                  </Box>
                ) : (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                      gap: 2,
                      alignItems: 'stretch',
                    }}
                  >
                    {visibleCustom.map((template, index) => (
                      <Box key={`${template.templateId}-${template.name}-${index}`} sx={{ display: 'flex' }}>
                        {renderTemplateCard(template)}
                      </Box>
                    ))}
                    {visibleCustom.length === 0 && customTemplates.length > 0 && (
                      <Box sx={{ gridColumn: '1 / -1' }}>
                        <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                          {t('forms.noTemplatesMatchSearch', 'No templates match your search')}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            )
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleClose} size="large">
            {t('common.cancel')}
          </Button>
        </DialogActions>
      </>
    );
  };


  const renderSavingStep = () => (
    <>
      <DialogTitle>{t('forms.creatingForm')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, py: 6 }}>
          <CircularProgress />
          <Typography color="text.secondary">{t('forms.creatingFormMessage')}</Typography>
        </Box>
      </DialogContent>
    </>
  );

  return (
    <>
      <Dialog 
        open={open} 
        onClose={handleClose} 
        maxWidth="lg" 
        fullWidth
        fullScreen={isMobile}
        slotProps={{ paper: { sx: { minHeight: isMobile ? '100%' : 600, maxHeight: isMobile ? '100%' : '90vh' } } }}
      >
        {step === 'choose' && renderChooseStep()}
        {step === 'saving' && renderSavingStep()}
      </Dialog>
      <FormTemplateEditor
        open={templateEditorOpen}
        onClose={() => { setTemplateEditorOpen(false); setEditingTemplate(undefined); }}
        onSave={handleSaveTemplate}
        existingTemplate={editingTemplate}
        userId={userId}
      />
    </>
  );
};

export default FormBuilder;