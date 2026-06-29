import React, { createContext, useContext, useState } from 'react';
import { type FileData } from '../files';
import { type Folder as FolderData } from '../firestore';

interface ClipboardItem {
  type: 'file' | 'folder';
  item: FileData | FolderData;
  operation: 'cut' | 'copy';
}

interface ClipboardState {
  items: ClipboardItem[];
  operation: 'cut' | 'copy' | null;
}

interface ClipboardContextType {
  clipboardItem: ClipboardItem | null; // Backward compatibility
  clipboardItems: ClipboardItem[];
  hasMultipleItems: boolean;
  operation: 'cut' | 'copy' | null;
  cutItem: (type: 'file' | 'folder', data: FileData | FolderData) => void;
  copyItem: (type: 'file' | 'folder', data: FileData | FolderData) => void;
  cutItems: (items: ClipboardItem[]) => void;
  copyItems: (items: ClipboardItem[]) => void;
  clearClipboard: () => void;
}

const ClipboardContext = createContext<ClipboardContextType | undefined>(undefined);

export const ClipboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [clipboardState, setClipboardState] = useState<ClipboardState>({ items: [], operation: null });

  // Backward compatibility - return first item for single-item operations
  const clipboardItem = clipboardState.items.length > 0 ? clipboardState.items[0] : null;
  
  const cutItem = (type: 'file' | 'folder', data: FileData | FolderData) => {
    setClipboardState({ items: [{ type, item: data, operation: 'cut' }], operation: 'cut' });
  };

  const copyItem = (type: 'file' | 'folder', data: FileData | FolderData) => {
    // Check if this is a chat file - chat files can't be copied, only moved
    if (type === 'file' && ((data as any).fileType === 'chat' || (data as any).fileType === 'attachment')) {
      console.warn('Cannot copy chat conversations or form attachments - use cut/paste to move instead');
      return;
    }
    setClipboardState({ items: [{ type, item: data, operation: 'copy' }], operation: 'copy' });
  };

  const cutItems = (items: ClipboardItem[]) => {
    const itemsWithOperation = items.map(item => ({ ...item, operation: 'cut' as const }));
    setClipboardState({ items: itemsWithOperation, operation: 'cut' });
  };

  const copyItems = (items: ClipboardItem[]) => {
    const itemsWithOperation = items.map(item => ({ ...item, operation: 'copy' as const }));
    setClipboardState({ items: itemsWithOperation, operation: 'copy' });
  };

  const clearClipboard = () => {
    setClipboardState({ items: [], operation: null });
  };

  return (
    <ClipboardContext.Provider value={{ 
      clipboardItem,
      clipboardItems: clipboardState.items,
      hasMultipleItems: clipboardState.items.length > 1,
      operation: clipboardState.operation,
      cutItem, 
      copyItem, 
      cutItems,
      copyItems,
      clearClipboard 
    }}>
      {children}
    </ClipboardContext.Provider>
  );
};

export const useClipboard = () => {
  const context = useContext(ClipboardContext);
  if (context === undefined) {
    throw new Error('useClipboard must be used within a ClipboardProvider');
  }
  return context;
};