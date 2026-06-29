import React, { useEffect, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'dompurify';

import termsHtmlEn from '../../landing/terms-of-service.html?raw';
import termsHtmlEs from '../../landing/es/terms-of-service.html?raw';
import termsHtmlFr from '../../landing/fr/terms-of-service.html?raw';

export const TermsOfServiceContent: React.FC = () => {
  const { i18n } = useTranslation();
  const [content, setContent] = useState<string>('');

  useEffect(() => {
    let htmlContent = termsHtmlEn;
    
    // Simple language detection matching the folder structure
    if (i18n.language?.startsWith('es')) {
      htmlContent = termsHtmlEs;
    } else if (i18n.language?.startsWith('fr')) {
      htmlContent = termsHtmlFr;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    
    // Extract the policy content
    // We look for the .policy container which holds the header and sections
    const policyContent = doc.querySelector('.policy');
    
    if (policyContent) {
      setContent(policyContent.innerHTML);
    } else {
      // Fallback if structure changes
      setContent(doc.body.innerHTML);
    }
  }, [i18n.language]);

  if (!content) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{
      '& h1': { typography: 'h5', mb: 2, fontWeight: 'bold' },
      '& h2': { typography: 'h6', mt: 3, mb: 1, fontWeight: 'bold' },
      '& h3': { typography: 'subtitle1', mt: 2, mb: 1, fontWeight: 'bold', fontSize: '0.95rem' },
      '& p': { typography: 'body2', mb: 1.5, lineHeight: 1.6 },
      '& ul': { typography: 'body2', pl: 3, mb: 2 },
      '& li': { mb: 0.5 },
      '& .policy-meta': { typography: 'caption', color: 'text.secondary', mb: 3, display: 'block' },
      '& .policy-meta p': { m: 0 },
      '& a': { color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } },
      '& .warning-box': { 
        bgcolor: 'warning.light', 
        color: 'warning.contrastText',
        p: 2, 
        my: 2, 
        borderRadius: 1,
        borderLeft: '4px solid',
        borderColor: 'warning.main',
        '& p': { m: 0 }
      }
    }}>
      <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }} />
    </Box>
  );
};
