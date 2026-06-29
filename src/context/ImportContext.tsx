import React, { createContext, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { type SecureFormData, saveFormAsFile } from '../utils/formFiles';
import { createFormFromTemplate } from '../utils/embeddedTemplates';

interface ImportItem {
  title: string;
  tags?: string[];
  notes?: string;
  type: 'note' | 'account' | 'credit_card' | 'key';
  url?: string;
  login?: string;
  password?: string;
  cardholder_name?: string;
  card_number?: string;
  card_month?: string;
  card_year?: string;
  security_code?: string;
  public_key?: string;
  private_key?: string;
  createdAt?: string;
  updatedAt?: string;
  shared_with?: string[];
  folders?: string[];
}

interface ImportResult {
  success: boolean;
  title: string;
  error?: string;
}

interface ImportContextType {
  importing: boolean;
  progress: { current: number; total: number };
  results: ImportResult[];
  error: string | null;
  startImport: (file: File) => Promise<void>;
  clearResults: () => void;
}

const ImportContext = createContext<ImportContextType>({
  importing: false,
  progress: { current: 0, total: 0 },
  results: [],
  error: null,
  startImport: async () => {},
  clearResults: () => {},
});

export const useImport = () => useContext(ImportContext);

export const ImportProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const { t } = useTranslation();
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<ImportResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const importItem = async (item: ImportItem, userId: string, userPrivateKey: string) => {
    let formData: SecureFormData;

    // Wrap i18next's t function to match our TranslateFn signature
    const translateFn = (key: string, fallback?: string) => t(key, fallback || key);

    if (item.type === 'account') {
      formData = await createFormFromTemplate('password', item.title, userId, translateFn);
      formData.data = {
        site_service: item.title || '',
        website_url: item.url || '',
        username: item.login || '',
        password: item.password || '',
        notes: item.notes || '',
      };
    } else if (item.type === 'note') {
      formData = await createFormFromTemplate('secure_note', item.title, userId, translateFn);
      formData.data = {
        title: item.title || '',
        content: item.notes || '',
      };
    } else if (item.type === 'credit_card') {
      formData = await createFormFromTemplate('credit_card', item.title, userId, translateFn);
      formData.data = {
        card_name: item.title || '',
        cardholder_name: item.cardholder_name || '',
        card_number: item.card_number || '',
        expiration_month: item.card_month || '',
        expiration_year: item.card_year || '',
        cvv: item.security_code || '',
        notes: item.notes || '',
      };
    } else if (item.type === 'key') {
      formData = await createFormFromTemplate('crypto_wallet', item.title, userId, translateFn);
      formData.data = {
        wallet_name: item.title || '',
        private_key: item.private_key || '',
        public_address: item.public_key || '',
        notes: item.notes || '',
      };
    } else {
      throw new Error(`Unknown item type: ${item.type}`);
    }

    if (item.tags && item.tags.length > 0) {
      formData.tags = item.tags;
    }

    if (item.createdAt) {
      formData.metadata = {
        ...formData.metadata,
        created: item.createdAt,
      };
    }

    await saveFormAsFile(formData, userId, userPrivateKey, null);
  };

  const startImport = async (file: File) => {
    // Capture current user and privateKey at the moment of import
    const currentUser = user;
    const currentPrivateKey = privateKey;

    if (!currentUser || !currentPrivateKey) {
      const missingItems = [];
      if (!currentUser) missingItems.push('user authentication');
      if (!currentPrivateKey) missingItems.push('private key');
      setError(`Import cannot start: ${missingItems.join(' and ')} not available. Please ensure you are logged in and have unlocked your vault.`);
      return;
    }

    setError(null);
    setResults([]);
    setProgress({ current: 0, total: 0 });
    setImporting(true);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.items || !Array.isArray(data.items)) {
        throw new Error('Invalid JSON format. Expected an object with "items" array.');
      }

      const importResults: ImportResult[] = [];
      const totalItems = data.items.length;
      setProgress({ current: 0, total: totalItems });

      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i] as ImportItem;
        try {
          await importItem(item, currentUser.uid, currentPrivateKey);
          importResults.push({
            success: true,
            title: item.title || 'Untitled',
          });
        } catch (err) {
          let errorMessage = err instanceof Error ? err.message : 'Unknown error';
          importResults.push({
            success: false,
            title: item.title || 'Untitled',
            error: errorMessage,
          });
        }
        setProgress({ current: i + 1, total: totalItems });
        setResults([...importResults]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import JSON file');
    } finally {
      setImporting(false);
    }
  };

  const clearResults = () => {
    setResults([]);
    setError(null);
    setProgress({ current: 0, total: 0 });
  };

  return (
    <ImportContext.Provider
      value={{
        importing,
        progress,
        results,
        error,
        startImport,
        clearResults,
      }}
    >
      {children}
    </ImportContext.Provider>
  );
};
