import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Translation files
import en from './locales/en.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
import de from './locales/de.json';

const resources = {
  en: {
    translation: en,
  },
  fr: {
    translation: fr,
  },
  es: {
    translation: es,
  },
  de: {
    translation: de,
  },
};

i18n
  .use(LanguageDetector) // Automatically detect user language
  .use(initReactI18next) // Pass the i18n instance to react-i18next
  .init({
    resources,
    lng: 'en', // Default language if detection fails
    fallbackLng: 'en', // Fallback language
    
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    
    detection: {
      // Language detection options
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
    
    react: {
      useSuspense: false, // Disable suspense to ensure immediate updates
      bindI18n: 'languageChanged', // Re-render on language change
      bindI18nStore: '', // Don't bind to store events
      transEmptyNodeValue: '', // Return empty string for empty translations
      transSupportBasicHtmlNodes: true, // Support basic HTML in translations
      transKeepBasicHtmlNodesFor: ['br', 'strong', 'i'], // Keep these HTML tags
    },
  });

export default i18n;