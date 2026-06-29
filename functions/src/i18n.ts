import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import * as path from 'path';

// Initialize i18next for server-side translations
let isInitialized = false;

export async function initI18n(): Promise<void> {
  if (isInitialized) return;

  await i18next
    .use(Backend)
    .init({
      fallbackLng: 'en',
      supportedLngs: ['en', 'es', 'fr'],
      ns: ['notifications'],
      defaultNS: 'notifications',
      backend: {
        loadPath: path.join(__dirname, '../locales/{{lng}}/{{ns}}.json'),
      },
      interpolation: {
        escapeValue: false, // Not needed for server-side
      },
    });

  isInitialized = true;
}

/**
 * Get translated notification strings for a specific language
 * @param language User's preferred language (en, es, fr)
 * @returns i18next instance with the language set
 */
export async function getI18n(language: string = 'en') {
  await initI18n();
  return i18next.getFixedT(language, 'notifications');
}
