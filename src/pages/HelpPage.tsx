import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Link,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const HelpPage: React.FC = () => {
  const { i18n } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [helpContent, setHelpContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Custom components for ReactMarkdown to handle links and headings properly
  const components: Components = {
    a: ({ href, children }) => {
      // Handle anchor links (internal page navigation)
      if (href?.startsWith('#')) {
        return (
          <Link
            href={href}
            onClick={(e) => {
              e.preventDefault();
              const targetId = href.substring(1);
              const element = document.getElementById(targetId);
              if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }}
            sx={{
              color: 'primary.main',
              textDecoration: 'none',
              '&:hover': {
                textDecoration: 'underline',
              },
            }}
          >
            {children}
          </Link>
        );
      }
      // Handle external links
      return (
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            color: 'primary.main',
            '&:hover': {
              textDecoration: 'underline',
            },
          }}
        >
          {children}
        </Link>
      );
    },
    h1: ({ children }) => {
      const text = children?.toString() || '';
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return <h1 id={id}>{children}</h1>;
    },
    h2: ({ children }) => {
      const text = children?.toString() || '';
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return <h2 id={id}>{children}</h2>;
    },
    h3: ({ children }) => {
      const text = children?.toString() || '';
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return <h3 id={id}>{children}</h3>;
    },
  };

  useEffect(() => {
    const loadHelpContent = async () => {
      setLoading(true);
      try {
        // Try to load language-specific help file
        const language = i18n.language || 'en';
        let content: string | null = null;
        
        // Try language-specific file first
        try {
          const response = await fetch(`/content/help.${language}.md`);
          if (response.ok) {
            content = await response.text();
          }
        } catch (error) {
          console.log(`Help file for language ${language} not found, trying fallback`);
        }
        
        // If language-specific file not found, try English fallback
        if (!content) {
          try {
            const fallbackResponse = await fetch('/content/help.en.md');
            if (fallbackResponse.ok) {
              content = await fallbackResponse.text();
            }
          } catch (error) {
            console.log('English fallback help file not found, using inline content');
          }
        }
        
        // If all file fetches fail, use inline default content
        setHelpContent(content || getDefaultHelpContent());
      } catch (error) {
        console.error('Error loading help content:', error);
        setHelpContent(getDefaultHelpContent());
      } finally {
        setLoading(false);
      }
    };

    loadHelpContent();
  }, [i18n.language]);

  const getDefaultHelpContent = () => {
    return `# Help Guide

## Creating Content

### Upload Files
1. Click the **+** button in the bottom-right corner
2. Select **Upload File**
3. Choose your file(s) from your device
4. Files are automatically encrypted before upload

### Create a Form
1. Click the **+** button
2. Select **Create Form**
3. The **Form Template** dialog opens — choose from Built-in, Personal, or Categories tabs
4. Click a template to create a form from it
5. The form opens immediately for editing

### Start a Chat
1. Click the **+** button
2. Select **New Chat**
3. Choose contacts to chat with
4. Send encrypted messages and files

## Form Templates

### Using Built-in Templates
SeraVault includes ready-made templates for passwords, credit cards, bank accounts, identities, Wi-Fi networks, crypto wallets, medical records, and more.

### Creating Personal Templates
1. Click **+** → **Create Form**
2. Go to the **Personal** tab
3. Click **Create Template**
4. Add fields and configure the template
5. Click **Save Template**

Your templates are end-to-end encrypted and only visible to you.

### Managing Your Templates
- Visit the **Templates** page in the sidebar to view, edit, or delete your templates

## Contacts & Invitations

### Adding Contacts
**Existing user:** Go to Contacts → Add Contact → enter their email → Send Request

**New user:** Same steps — they'll receive an email invitation. When they sign up, you're automatically connected.

### Accepting Contact Requests
Go to Contacts → Requests tab → accept or decline pending requests

## Sharing Content

### Share Files
1. Right-click on a file
2. Select **Share**
3. Choose contacts to share with

### Share Folders
Right-click a folder → Share → all files inside are shared with selected contacts

## Managing Content

### Favorites
Click the star icon on any file — access favorites from the sidebar

### Recent Files
Click **Recents** in the sidebar for recently accessed files

### Archive & Delete
- **Archive**: Right-click → Archive (hides item without deleting)
- **Restore**: Open Archive in sidebar → right-click → Restore
- **Permanently delete**: Open Archive → right-click → Delete Permanently

## Security Features

### End-to-End Encryption
All files are encrypted before leaving your device. Only you and people you share with can decrypt them.

### Post-Quantum Security
Uses ML-KEM-768 (NIST-standardized) — resistant to quantum computer attacks.

### Private Keys
Your private key never leaves your device unencrypted. Export it as a backup and store safely.

## Profile Settings

Visit your **Profile** page to:
- Change your passphrase
- Set up biometric authentication (fingerprint / Face ID)
- Register hardware security keys (YubiKey, FIDO2)
- Export / import your private key
- Update display name
- Delete your account

## Tips & Tricks

- Search clears automatically when you navigate to a different folder or section
- Create personal form templates for data you enter repeatedly
- Archive files before permanently deleting — it's a safety net
- Export your private key and store the backup offline
- A notification will appear when a new version is available
`;
  };

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 } }}>
      <Paper sx={{ p: { xs: 2, md: 4 } }}>
          {loading ? (
            <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
              Loading help content...
            </Box>
          ) : (
            <Box
              sx={{
                '& h1': {
                  fontSize: { xs: '1.5rem', sm: '2rem' },
                  fontWeight: 600,
                  mb: 2,
                  mt: 3,
                  color: 'primary.main',
                  '&:first-of-type': { mt: 0 },
                },
                '& h2': {
                  fontSize: { xs: '1.25rem', sm: '1.5rem' },
                  fontWeight: 600,
                  mb: 1.5,
                  mt: 3,
                  color: 'text.primary',
                  borderBottom: 1,
                  borderColor: 'divider',
                  pb: 0.5,
                },
                '& h3': {
                  fontSize: { xs: '1.1rem', sm: '1.25rem' },
                  fontWeight: 500,
                  mb: 1,
                  mt: 2,
                  color: 'text.primary',
                },
                '& p': {
                  mb: 1.5,
                  lineHeight: 1.7,
                },
                '& ul, & ol': {
                  mb: 2,
                  pl: 3,
                },
                '& li': {
                  mb: 0.5,
                  lineHeight: 1.6,
                },
                '& code': {
                  backgroundColor: 'action.hover',
                  padding: '2px 6px',
                  borderRadius: 1,
                  fontSize: '0.9em',
                  fontFamily: 'monospace',
                },
                '& strong': {
                  fontWeight: 600,
                  color: 'text.primary',
                },
                '& a': {
                  color: 'primary.main',
                  cursor: 'pointer',
                },
              }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {helpContent}
              </ReactMarkdown>
            </Box>
          )}
        </Paper>
    </Container>
  );
};

export default HelpPage;
