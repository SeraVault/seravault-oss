import React, { useEffect } from 'react';
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from '@mui/material';
import {
  Language as LanguageIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { getUserProfile, updateUserProfile } from '../firestore';
import { useSearchParams } from 'react-router-dom';

interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

const languages: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
];

const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  // Load user's language preference on login, but let an explicit ?lang= param win
  useEffect(() => {
    const loadUserLanguage = async () => {
      if (user) {
        const urlLang = searchParams.get('lang');
        if (urlLang) {
          // Landing page passed an explicit language — apply it and save to profile
          if (urlLang !== i18n.language) i18n.changeLanguage(urlLang);
          await updateUserProfile(user.uid, { language: urlLang }).catch(() => {});
          return;
        }
        const profile = await getUserProfile(user.uid);
        if (profile?.language && profile.language !== i18n.language) {
          i18n.changeLanguage(profile.language);
        }
      }
    };
    loadUserLanguage();
  }, [user, i18n, searchParams]);

  const handleLanguageChange = async (languageCode: string) => {
    i18n.changeLanguage(languageCode);
    setAnchorEl(null);
    
    // Save to user profile if logged in
    if (user) {
      try {
        await updateUserProfile(user.uid, { language: languageCode });
      } catch (error) {
        console.error('Failed to update language preference:', error);
      }
    }
  };

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  return (
    <>
      <Tooltip title={`Language: ${currentLanguage.nativeName}`}>
        <IconButton
          onClick={handleClick}
          color="inherit"
          size="medium"
          sx={{
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              transform: 'scale(1.1)',
            }
          }}
        >
          <span style={{ fontSize: '18px' }}>{currentLanguage.flag}</span>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          sx: {
            mt: 1,
            minWidth: 180,
          }
        }}
      >
        {languages.map((language) => (
          <MenuItem
            key={language.code}
            onClick={() => handleLanguageChange(language.code)}
            selected={language.code === i18n.language}
            sx={{ gap: 2 }}
          >
            <ListItemIcon sx={{ minWidth: 'auto !important' }}>
              <span style={{ fontSize: '18px' }}>{language.flag}</span>
            </ListItemIcon>
            <ListItemText
              primary={language.nativeName}
              secondary={language.name}
            />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default LanguageSwitcher;