// @ts-nocheck
/**
 * Global context for tracking import/export progress
 * Persists across navigation so users can see progress even if they leave the page
 */

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ImportProgress {
  stage: 'preparing' | 'files' | 'chats' | 'forms' | 'complete' | 'error';
  currentItem?: string;
  itemsProcessed: number;
  totalItems: number;
}

interface ImportResults {
  filesImported: number;
  formsImported: number;
  chatsImported?: number;
  errors: string[];
}

interface ImportProgressContextType {
  isImporting: boolean;
  progress: ImportProgress | null;
  results: ImportResults | null;
  startImport: () => void;
  updateProgress: (progress: ImportProgress) => void;
  completeImport: (results: ImportResults) => void;
  cancelImport: () => void;
  clearResults: () => void;
}

const ImportProgressContext = createContext<ImportProgressContextType | undefined>(undefined);

export const ImportProgressProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [results, setResults] = useState<ImportResults | null>(null);

  const startImport = () => {
    setIsImporting(true);
    setProgress({ stage: 'preparing', itemsProcessed: 0, totalItems: 0 });
    setResults(null);
  };

  const updateProgress = (newProgress: ImportProgress) => {
    setProgress(newProgress);
  };

  const completeImport = (importResults: ImportResults) => {
    setIsImporting(false);
    setProgress(null);
    setResults(importResults);
  };

  const cancelImport = () => {
    setIsImporting(false);
    setProgress(null);
  };

  const clearResults = () => {
    setResults(null);
  };

  return (
    <ImportProgressContext.Provider
      value={{
        isImporting,
        progress,
        results,
        startImport,
        updateProgress,
        completeImport,
        cancelImport,
        clearResults,
      }}
    >
      {children}
    </ImportProgressContext.Provider>
  );
};

export const useImportProgress = (): ImportProgressContextType => {
  const context = useContext(ImportProgressContext);
  if (!context) {
    throw new Error('useImportProgress must be used within ImportProgressProvider');
  }
  return context;
};
