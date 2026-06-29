// @ts-nocheck
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Chip,
  IconButton,
  InputAdornment,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Save,
  Close,
  Visibility,
  VisibilityOff,
  ExpandMore,
  Key,
  ContentCopy,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import type { SecureFormData, FormFieldDefinition } from '../utils/formFiles';
import { validateForm, saveFormAsFile, updateFormFile, updateFormData, getLocalizedField } from '../utils/formFiles';
import { backendService } from '../backend/BackendService';
import DualEditor from './DualEditor';
import FileAttachmentField from './FileAttachmentField';
import { addFileAttachment, removeFileAttachment, getFieldAttachments } from '../utils/formFiles';
import type { ImageAttachmentMetadata } from '../hooks/useImageAttachments';

interface FormInstanceFillerProps {
  userId: string;
  privateKey: string;
  parentFolder: string | null;
  existingFormData?: SecureFormData; // For editing existing forms
  existingFile?: any; // FileData for updating existing files
  onSave: (fileId?: string) => void;
  onCancel: () => void;
}

const FormInstanceFiller: React.FC<FormInstanceFillerProps> = ({
  userId,
  privateKey,
  parentFolder,
  existingFormData,
  existingFile,
  onSave,
  onCancel,
}) => {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [formData, setFormData] = useState<SecureFormData | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());
  const [locale] = useState(i18n.language || 'en');
  const [imageAttachments, setImageAttachments] = useState<ImageAttachmentMetadata[]>([]);

  // Generate a secure random password
  const generatePassword = () => {
    const length = 20;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset[array[i] % charset.length];
    }
    return password;
  };

  // Generate and set password for a field
  const handleGeneratePassword = async (fieldId: string) => {
    const password = generatePassword();
    updateFieldValue(fieldId, password);
    
    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(password);
    } catch (err) {
      console.error('Failed to copy password:', err);
    }
  };

  // Initialize form data
  useEffect(() => {
    if (existingFormData) {
      let initialFormData = { ...existingFormData };
      
      // Ensure metadata exists with required fields
      if (!initialFormData.metadata) {
        initialFormData.metadata = {
          name: '',
          version: '1.0',
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
        };
      }
      
      // If template has a titleField and no form name is set, sync from titleField
      if (initialFormData.template?.titleField) {
        const titleFieldValue = initialFormData.data[initialFormData.template.titleField];
        const titleString = Array.isArray(titleFieldValue) ? titleFieldValue[0] : titleFieldValue;
        if (titleString && !initialFormData.metadata.name) {
          initialFormData = {
            ...initialFormData,
            metadata: {
              ...initialFormData.metadata,
              name: titleString
            }
          };
        }
        // Don't auto-fill titleField from form name - let user fill it manually
        // This prevents auto-filling "Credit Card" into the title field
      }
      
      setFormData(initialFormData);
    }
  }, [existingFormData]);

  if (!formData) {
    return (
      <Dialog open onClose={onCancel} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>{t('common.loading')}</DialogTitle>
        <DialogContent>
          <Typography>{t('forms.loadingFormMessage', 'Please wait while the form loads...')}</Typography>
        </DialogContent>
      </Dialog>
    );
  }

  const handleSave = async () => {

    const validation = validateForm(formData);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setErrors([]);
    setSaving(true);

    try {
      if (existingFile) {
        // Remove tags from form content before saving (tags only stored in file collection)
        const updatedFormData = {
          ...formData,
          metadata: {
            ...formData.metadata,
            modified: new Date().toISOString(),
          },
          lastAccessed: new Date().toISOString(),
          tags: [], // Remove tags from form content
          imageAttachments, // Include image attachments
        };

        console.log('💾 Saving form with', imageAttachments.length, 'image attachments:', updatedFormData.imageAttachments);

        await updateFormFile(existingFile.id, updatedFormData, userId, privateKey);

        // Pass the file ID to the callback for indexing
        console.log('✏️ Calling onSave for updated form with fileId:', existingFile.id);
        onSave(existingFile.id);
        
        // Tags are now managed separately in the file collection via TagManagementDialog
      } else {
        // Extract template tags before saving (to save to file collection)
        const templateTags = formData.tags || [];

        // Remove tags from form content before saving
        const formDataWithoutTags = {
          ...formData,
          tags: [], // Remove tags from form content
          imageAttachments, // Include image attachments
        };

        // Create new form file
        const newFileId = await saveFormAsFile(formDataWithoutTags, userId, privateKey, parentFolder);

        // Save template tags to file collection for searchability
        if (templateTags.length > 0 && newFileId) {
          const { updateUserTagsInFirestore } = await import('../services/userTagsManagement');
          const { backendService } = await import('../backend/BackendService');
          const fileData = await backendService.files.get(newFileId);
          if (fileData) {
            await updateUserTagsInFirestore(newFileId, userId, templateTags, privateKey, fileData);
          }
        }

        // Pass the new file ID to the callback for indexing
        console.log('✨ Calling onSave for new form with fileId:', newFileId);
        onSave(newFileId);
      }
    } catch (error) {
      console.error('Error saving form:', error);
      let errorMessage: string = error instanceof Error ? error.message : 'Failed to save form. Please try again.';
      setErrors([errorMessage]);
    } finally {
      setSaving(false);
    }
  };

  const updateFormName = (name: string) => {
    setFormData(prev => {
      if (!prev) return null;
      
      let updatedFormData = {
        ...prev,
        metadata: { ...prev.metadata, name }
      };
      
      // Don't auto-sync form name to title field - let user control both independently
      
      return updatedFormData;
    });
  };

  const updateFieldValue = (fieldId: string, value: string) => {
    setFormData(prev => {
      if (!prev) return null;

      let updatedFormData = updateFormData(prev, fieldId, value);
      
      // If the field is the template's title field, update the form name as well
      if (fieldId === updatedFormData.template?.titleField && value.trim()) {
        updatedFormData = {
          ...updatedFormData,
          metadata: {
            ...updatedFormData.metadata,
            name: value.trim()
          }
        };
      }
      
      return updatedFormData;
    });
  };

  const toggleFieldVisibility = (fieldId: string) => {
    const newVisible = new Set(visibleFields);
    if (newVisible.has(fieldId)) {
      newVisible.delete(fieldId);
    } else {
      newVisible.add(fieldId);
    }
    setVisibleFields(newVisible);
  };

  // Tags are now managed separately in the file collection, not in form content

  const renderField = (field: FormFieldDefinition) => {
    const localizedField = getLocalizedField(formData!, field.id, locale);
    const value = formData!.data[field.id] || '';
    const isVisible = visibleFields.has(field.id);
    const shouldHideValue = field.sensitive && !isVisible;

    if (field.type === 'select' && field.options) {
      return (
        <FormControl fullWidth key={field.id} sx={{ mb: 2 }}>
          <InputLabel>{localizedField.label} {field.required && '*'}</InputLabel>
          <Select
            value={Array.isArray(value) ? value[0] || '' : value}
            onChange={(e) => updateFieldValue(field.id, e.target.value)}
            label={`${localizedField.label} ${field.required ? '*' : ''}`}
          >
            {localizedField.options?.map(option => (
              <MenuItem key={option} value={option}>{option}</MenuItem>
            ))}
          </Select>
        </FormControl>
      );
    }

    if (field.type === 'richtext') {
      return (
        <Box key={field.id} sx={{ mb: 2 }}>
          <DualEditor
            label={`${localizedField.label} ${field.required ? '*' : ''}`}
            value={value}
            onChange={(newValue) => updateFieldValue(field.id, newValue)}
            placeholder={localizedField.placeholder}
            sensitive={field.sensitive}
            required={field.required}
            userId={userId}
            privateKey={privateKey}
            folderId={parentFolder || undefined}
            participants={[userId]}
            onImageAttachment={(metadata) => {
              setImageAttachments(prev => [...prev, metadata]);
              console.log('Image attachment added:', metadata);
            }}
          />
        </Box>
      );
    }

    if (field.type === 'textarea') {
      return (
        <TextField
          key={field.id}
          label={`${localizedField.label} ${field.required ? '*' : ''}`}
          value={value}
          onChange={(e) => updateFieldValue(field.id, e.target.value)}
          multiline
          rows={3}
          fullWidth
          sx={{ mb: 2 }}
          placeholder={localizedField.placeholder}
          type={shouldHideValue ? 'password' : 'text'}
          InputProps={field.sensitive ? {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={() => toggleFieldVisibility(field.id)}>
                  {isVisible ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          } : undefined}
        />
      );
    }

    if (field.type === 'file') {
      const attachments = getFieldAttachments(formData!, field.id);
      
      return (
        <Box key={field.id} sx={{ mb: 2 }}>
          <FileAttachmentField
            field={field}
            attachments={attachments}
            userId={userId}
            privateKey={privateKey}
            parentFolder={parentFolder}
            onFileAdded={(fileId, metadata) => {
              setFormData(prev => prev ? addFileAttachment(prev, field.id, fileId, metadata) : null);
            }}
            onFileRemoved={(fileId) => {
              setFormData(prev => prev ? removeFileAttachment(prev, field.id, fileId) : null);
            }}
            disabled={saving}
          />
        </Box>
      );
    }

    return (
      <TextField
        key={field.id}
        label={`${localizedField.label} ${field.required ? '*' : ''}`}
        value={value as string}
        onChange={(e) => updateFieldValue(field.id, e.target.value)}
        type={field.sensitive ? (isVisible ? 'text' : 'password') : field.type}
        fullWidth
        sx={{ mb: 2 }}
        placeholder={localizedField.placeholder}
        InputLabelProps={field.type === 'date' ? { shrink: true } : undefined}
        InputProps={field.sensitive ? {
          endAdornment: (
            <InputAdornment position="end">
              {field.type === 'password' && (
                <>
                  <IconButton 
                    onClick={() => handleGeneratePassword(field.id)}
                    title={t('forms.generatePassword', 'Generate password')}
                    size="small"
                  >
                    <Key fontSize="small" />
                  </IconButton>
                  <IconButton
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(value as string);
                      } catch (err) {
                        console.error('Failed to copy:', err);
                      }
                    }}
                    title={t('common.copy', 'Copy')}
                    size="small"
                  >
                    <ContentCopy fontSize="small" />
                  </IconButton>
                </>
              )}
              <IconButton onClick={() => toggleFieldVisibility(field.id)}>
                {isVisible ? <VisibilityOff /> : <Visibility />}
              </IconButton>
            </InputAdornment>
          ),
        } : undefined}
      />
    );
  };

  const renderFields = () => {
    if (formData.schema.sections && formData.schema.sections.length > 0) {
      // Render fields organized by sections
      return formData.schema.sections.map((section) => {
        const sectionFields = formData.schema.fields.filter(field => 
          section.fieldIds.includes(field.id)
        );

        if (sectionFields.length === 0) return null;

        return (
          <Accordion key={section.id} defaultExpanded={!section.collapsible}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="h6">
                {formData.localization?.[locale]?.sections?.[section.id] || section.title}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                {sectionFields.map(renderField)}
              </Box>
            </AccordionDetails>
          </Accordion>
        );
      });
    } else {
      // Render all fields without sections
      return formData.schema.fields.map(renderField);
    }
  };

  return (
    <Dialog open onClose={onCancel} maxWidth="md" fullWidth fullScreen={isMobile}>
      <DialogTitle>
        {existingFormData ? t('forms.editForm') : t('forms.fillForm', 'Fill Form')} - {formData?.metadata?.name || t('common.untitled', 'Untitled')}
      </DialogTitle>

      <DialogContent sx={{ pt: 3 }}>
        <Box>
          {/* Form Errors */}
          {errors.length > 0 && (
            <Alert severity="error" sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>{t('validation.fixErrors', 'Please fix the following errors:')}</Typography>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </Alert>
          )}

          {/* Form Title - Only show if template doesn't have a titleField */}
          {!formData.template?.titleField && (
            <TextField
              label={t('forms.formTitle')}
              value={formData?.metadata?.name || ''}
              onChange={(e) => updateFormName(e.target.value)}
              fullWidth
              required
              sx={{ mb: 2, mt: 1 }}
              placeholder={t('forms.enterFormTitle')}
            />
          )}

          <Divider sx={{ my: 2 }} />

          {/* Form Fields */}
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {renderFields()}
          </Box>

          {/* Tags are now managed via the file collection using TagManagementDialog */}

          {/* Form Metadata */}
          {formData.metadata.description && (
            <Box sx={{
              mt: 2,
              p: 2,
              backgroundColor: 'action.hover',
              borderRadius: 1
            }}>
              <Typography variant="body2" color="text.secondary">
                {formData.metadata.description}
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} variant="outlined" disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          startIcon={<Save />}
          disabled={saving}
        >
          {saving ? t('forms.savingForm') : t('forms.saveForm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default React.memo(FormInstanceFiller);