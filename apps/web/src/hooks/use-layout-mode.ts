import { createContext, useContext, useLayoutEffect } from 'react';

export type LayoutMode = 'default' | 'editor' | 'editor-expanded';

export const LayoutModeContext = createContext<{
  mode: LayoutMode;
  setMode: (mode: LayoutMode) => void;
}>({ mode: 'default', setMode: () => {} });

export function useLayoutMode(mode: LayoutMode) {
  const { setMode } = useContext(LayoutModeContext);
  useLayoutEffect(() => {
    setMode(mode);
    return () => setMode('default');
  }, [mode, setMode]);
}
