// @ts-nocheck
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { backendService } from '../backend/BackendService';
import type { FileData } from '../files';
import { getOrDecryptMetadata, type CachedFileMetadata } from '../services/metadataCache';
import { isFormFile } from '../utils/formFiles';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deepIndexService, type DeepIndexProgress, extractFileVersion } from '../services/deepIndexService';

export interface FileIndexEntry {
  fileId: string;
  rawFile: FileData;
  indexedFile: FileData;
  metadata: CachedFileMetadata;
  folderId: string | null;
  searchableName: string;
  searchableTags: string[];
  searchableFormText?: string;
}

export type { DeepIndexProgress };

interface GlobalFileIndexState {
  entries: FileIndexEntry[];
  isBuilding: boolean;
  refresh: (force?: boolean) => void;
  lastBuiltAt: number | null;
  deepIndexProgress: DeepIndexProgress;
  startDeepIndexing: () => Promise<void>;
  indexSingleForm: (fileId: string) => Promise<void>;
  hasDeepIndex: boolean;
}

export const useGlobalFileIndex = (): GlobalFileIndexState => {
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const [rawFiles, setRawFiles] = useState<FileData[]>([]);
  const [entries, setEntries] = useState<FileIndexEntry[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [lastBuiltAt, setLastBuiltAt] = useState<number | null>(null);
  const [buildTrigger, setBuildTrigger] = useState(0);
  const subscriptionRef = useRef<null | (() => void)>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [deepIndexProgress, setDeepIndexProgress] = useState<DeepIndexProgress>(() => 
    deepIndexService.getProgress()
  );
  const [hasDeepIndex, setHasDeepIndex] = useState(() => 
    deepIndexService.hasAnyIndex()
  );

  // Subscribe to deep indexing progress updates
  useEffect(() => {
    const unsubscribe = deepIndexService.addProgressListener((progress) => {
      setDeepIndexProgress({
        isIndexing: progress.isIndexing,
        total: progress.total,
        processed: progress.processed,
        currentFile: progress.currentFile,
      });
      setHasDeepIndex(deepIndexService.hasAnyIndex());
    });

    return unsubscribe;
  }, []);

  // Subscribe to all accessible files for the authenticated user
  useEffect(() => {
    if (!user) {
      setRawFiles([]);
      if (subscriptionRef.current) {
        subscriptionRef.current();
        subscriptionRef.current = null;
      }
      return;
    }

    subscriptionRef.current?.();
    subscriptionRef.current = backendService.files.subscribeAll(user.uid, (files) => {
      setRawFiles(files as FileData[]);
    });

    return () => {
      subscriptionRef.current?.();
      subscriptionRef.current = null;
    };
  }, [user?.uid]);

  // Debounce build requests when snapshots arrive rapidly
  useEffect(() => {
    if (!user || !privateKey) {
      setEntries([]);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setBuildTrigger((prev) => prev + 1);
    }, 250);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [rawFiles, user?.uid, privateKey]);

  useEffect(() => {
    if (!user || !privateKey) {
      setEntries([]);
      setIsBuilding(false);
      return;
    }

    let isCancelled = false;

    const buildIndex = async () => {
      if (rawFiles.length === 0) {
        setEntries([]);
        setLastBuiltAt(Date.now());
        setIsBuilding(false);
        return;
      }

      setIsBuilding(true);

      // Process files in parallel batches to keep the UI responsive
      const validFiles = rawFiles.filter((f) => {
        if (!f?.id) return false;
        // Exclude files archived by this user from the search index
        if (user && f.archivedBy && Array.isArray(f.archivedBy) && f.archivedBy.includes(user.uid)) {
          return false;
        }
        return true;
      });
      const BATCH_SIZE = (navigator.hardwareConcurrency ?? 4) <= 4 ? 4 : 10;
      const nextEntries: FileIndexEntry[] = [];

      for (let i = 0; i < validFiles.length; i += BATCH_SIZE) {
        if (isCancelled) break;
        const batch = validFiles.slice(i, i + BATCH_SIZE);

        const batchResults = await Promise.all(
          batch.map(async (file) => {
            try {
              const metadata = await getOrDecryptMetadata(file, user.uid, privateKey);
              const folderId = file.userFolders?.[user.uid] ?? file.parent ?? null;

              let searchableFormText: string | undefined;

              // OPTIMIZATION: Form content indexing is opt-in via startDeepIndexing()
              // By default, only file names/titles are indexed for fast performance
              // Users can trigger deep indexing to search within form field contents
              if (isFormFile(metadata.decryptedName)) {
                const version = extractFileVersion(file);
                if (deepIndexService.hasCache(file.id!, version)) {
                  searchableFormText = deepIndexService.getCache(file.id!, version);
                }
              }

              const indexedFile: FileData = {
                ...file,
                name: metadata.decryptedName,
                size: metadata.decryptedSize,
              };

              return {
                fileId: file.id!,
                rawFile: file,
                indexedFile,
                metadata,
                folderId,
                searchableName: metadata.decryptedName.toLowerCase(),
                searchableTags: metadata.tags.map((tag) => tag.toLowerCase()),
                searchableFormText,
              } satisfies FileIndexEntry;
            } catch (error) {
              console.warn('Skipping file from search index due to metadata error:', file.id, error);
              return null;
            }
          })
        );

        for (const entry of batchResults) {
          if (entry) nextEntries.push(entry);
        }
      }

      if (!isCancelled) {
        setEntries(nextEntries);
        setIsBuilding(false);
        setLastBuiltAt(Date.now());
      }
    };

    buildIndex().catch((error) => {
      console.error('Failed to build global file index:', error);
      if (!isCancelled) {
        setIsBuilding(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [buildTrigger, rawFiles, user?.uid, privateKey]);

  const refresh = useCallback(
    (force = false) => {
      if (force) {
        deepIndexService.clearCache();
        setHasDeepIndex(false);
      }
      setBuildTrigger((prev) => prev + 1);
    },
    []
  );

  // Deep indexing function - decrypt form contents for full-text search
  const startDeepIndexing = useCallback(async () => {
    if (!user || !privateKey) {
      console.warn('❌ Cannot start deep indexing: no user or privateKey');
      return;
    }

    try {
      // Build a Map for O(1) lookups instead of O(n) entries.find() per file
      const entryMap = new Map(entries.map(e => [e.fileId, e]));

      const formFilesToIndex = rawFiles
        .filter(file => file?.id)
        .reduce<{ file: FileData; metadata: CachedFileMetadata }[]>((acc, file) => {
          const entry = entryMap.get(file.id!);
          if (entry && isFormFile(entry.metadata.decryptedName)) {
            acc.push({ file, metadata: entry.metadata });
          }
          return acc;
        }, []);

      if (formFilesToIndex.length === 0) return;

      await deepIndexService.startIndexing(formFilesToIndex, user.uid, privateKey);
      setBuildTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Deep indexing failed:', error);
      setDeepIndexProgress({ isIndexing: false, total: 0, processed: 0 });
    }
  }, [user, privateKey, rawFiles, entries]);

  // Index a single form file (used after saving/updating forms)
  // Only runs if the user has already enabled deep search this session,
  // so that saving a form doesn't falsely show the Deep Search chip
  // while all other forms remain unindexed.
  const indexSingleForm = useCallback(async (fileId: string) => {
    if (!user || !privateKey) return;
    if (!deepIndexService.hasAnyIndex()) return; // Deep search not enabled this session

    // Invalidate any existing cache entries for this fileId
    deepIndexService.invalidateFileCache(fileId);

    // Wait for the file to appear in rawFiles and entries (with timeout)
    const maxAttempts = 10;
    const delayMs = 500;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const file = rawFiles.find(f => f.id === fileId);
        const entry = entries.find(e => e.fileId === fileId);
        
        // If both are found, proceed with indexing
        if (file && entry) {
          const searchText = await deepIndexService.indexSingleForm(
            file, 
            entry.metadata, 
            user.uid, 
            privateKey, 
            true // Force refresh
          );
          
          if (searchText) {
            // Update just this entry in the index (no full rebuild needed)
            setEntries(prev => prev.map(e => 
              e.fileId === fileId 
                ? { ...e, searchableFormText: searchText }
                : e
            ));
            setHasDeepIndex(true);
          }
          return; // Success, exit
        }
        
        // File not found yet, wait and retry
        if (attempt < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        console.warn(`Failed to index form ${fileId}:`, error);
        return;
      }
    }
    
    try {
      const file = await backendService.files.get(fileId, true);
      if (!file) return;
      
      const metadata = await getOrDecryptMetadata(file, user.uid, privateKey);
      
      const searchText = await deepIndexService.indexSingleForm(
        file, 
        metadata, 
        user.uid, 
        privateKey, 
        true
      );
      
      if (searchText) {
        // Check if entry exists in current index
        const existingEntry = entries.find(e => e.fileId === fileId);
        if (existingEntry) {
          // Update existing entry with new search text
          setEntries(prev => prev.map(e => 
            e.fileId === fileId 
              ? { ...e, searchableFormText: searchText }
              : e
          ));
        } else {
          setBuildTrigger(prev => prev + 1);
        }
        setHasDeepIndex(true);
      }
    } catch (fallbackError) {
      console.warn(`Failed to index form ${fileId} via direct fetch:`, fallbackError);
    }
  }, [user, privateKey, rawFiles, entries, hasDeepIndex]);

  return useMemo(
    () => ({
      entries,
      rawFiles,
      isBuilding,
      refresh,
      lastBuiltAt,
      deepIndexProgress,
      startDeepIndexing,
      indexSingleForm,
      hasDeepIndex,
    }),
    [entries, rawFiles, isBuilding, refresh, lastBuiltAt, deepIndexProgress, startDeepIndexing, indexSingleForm, hasDeepIndex]
  );
};
