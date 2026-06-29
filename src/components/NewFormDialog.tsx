// @ts-nocheck
import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Box,
  IconButton,
  Divider,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  CreditCard,
  Lock,
  AccountBalance,
  Person,
  StickyNote2,
  Wifi,
  Extension,
  Close,
} from '@mui/icons-material';
import type { FormType } from '../utils/formFiles';

interface NewFormDialogProps {
  open: boolean;
  onClose: () => void;
  onCreateForm: (formType: FormType) => void;
}

interface FormTemplate {
  type: FormType;
  name: string;
  description: string;
  icon: React.ComponentType;
  color: string;
}

const getFormTemplates = (t: any): FormTemplate[] => [
  {
    type: 'credit_card',
    name: t('forms.formTypes.creditCard'),
    description: t('forms.formDescriptions.creditCard'),
    icon: CreditCard,
    color: '#1976d2',
  },
  {
    type: 'password',
    name: t('forms.formTypes.password'),
    description: t('forms.formDescriptions.password'),
    icon: Lock,
    color: '#d32f2f',
  },
  {
    type: 'bank_account',
    name: t('forms.formTypes.bankAccount'),
    description: t('forms.formDescriptions.bankAccount'),
    icon: AccountBalance,
    color: '#388e3c',
  },
  {
    type: 'identity',
    name: t('forms.formTypes.identity'),
    description: t('forms.formDescriptions.identity'),
    icon: Person,
    color: '#f57c00',
  },
  {
    type: 'secure_note',
    name: t('forms.formTypes.secureNote'),
    description: t('forms.formDescriptions.secureNote'),
    icon: StickyNote2,
    color: '#7b1fa2',
  },
  {
    type: 'wifi',
    name: t('forms.formTypes.wifi'),
    description: t('forms.formDescriptions.wifi'),
    icon: Wifi,
    color: '#0288d1',
  },
  {
    type: 'custom',
    name: t('forms.formTypes.custom'),
    description: t('forms.formDescriptions.custom'),
    icon: Extension,
    color: '#455a64',
  },
];

const NewFormDialog: React.FC<NewFormDialogProps> = ({ open, onClose, onCreateForm }) => {
  const { t } = useTranslation();
  
  const handleCreateForm = (formType: FormType) => {
    onCreateForm(formType);
    onClose();
  };

  const formTemplates = getFormTemplates(t);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {t('forms.createNewForm')}
        <IconButton onClick={onClose}>
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 0 }}>
        <Typography variant="body2" color="text.secondary" sx={{ px: 3, mb: 2 }}>
          {t('forms.chooseFormType')}
        </Typography>

        <List sx={{ py: 0 }}>
          {formTemplates.map((template, index) => {
            const IconComponent = template.icon;
            
            return (
              <Box key={template.type}>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => handleCreateForm(template.type)}
                    sx={{
                      py: 2.5,
                      px: 3,
                      '&:hover': {
                        backgroundColor: `${template.color}08`,
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 56 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 40,
                          height: 40,
                          borderRadius: 2,
                          backgroundColor: `${template.color}15`,
                          border: `1px solid ${template.color}30`,
                        }}
                      >
                        <IconComponent sx={{ color: template.color, fontSize: 20 }} />
                      </Box>
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          {template.name}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {template.description}
                        </Typography>
                      }
                    />
                  </ListItemButton>
                </ListItem>
                {index < formTemplates.length - 1 && <Divider />}
              </Box>
            );
          })}
        </List>
      </DialogContent>
    </Dialog>
  );
};

export default NewFormDialog;