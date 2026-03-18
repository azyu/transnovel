import { useEffect } from 'react';
import { useDebugStore } from '../stores/debugStore';

export function useKeyboardShortcuts() {
  const { debugMode, setDebugMode } = useDebugStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setDebugMode(!debugMode);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [debugMode, setDebugMode]);
}
