import React, { createContext, useContext, useState } from 'react';

interface ContentActions {
  onNewFolder: (() => void) | null;
  onUpload: (() => void) | null;
  onNewForm: (() => void) | null;
  onNewChat: (() => void) | null;
  setActions: (actions: Omit<ContentActions, 'setActions'>) => void;
}

const ContentActionsContext = createContext<ContentActions>({
  onNewFolder: null,
  onUpload: null,
  onNewForm: null,
  onNewChat: null,
  setActions: () => {},
});

export const ContentActionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [actions, setActionsState] = useState<Omit<ContentActions, 'setActions'>>({
    onNewFolder: null,
    onUpload: null,
    onNewForm: null,
    onNewChat: null,
  });

  const setActions = (a: Omit<ContentActions, 'setActions'>) => setActionsState(a);

  return (
    <ContentActionsContext.Provider value={{ ...actions, setActions }}>
      {children}
    </ContentActionsContext.Provider>
  );
};

export const useContentActions = () => useContext(ContentActionsContext);
