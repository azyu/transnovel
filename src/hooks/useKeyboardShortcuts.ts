import { useEffect } from 'react';
import { useDebugStore } from '../stores/debugStore';
import { useUIStore } from '../stores/uiStore';
import {
  FOCUS_TRANSLATION_URL_INPUT_EVENT,
  getMainTabForShortcut,
  isApplePlatform,
} from '../utils/tabShortcuts';

export function useKeyboardShortcuts() {
  const { debugMode, setDebugMode } = useDebugStore();
  const currentTab = useUIStore((s) => s.currentTab);
  const setTab = useUIStore((s) => s.setTab);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const primaryModifierPressed = isApplePlatform() ? e.metaKey : e.ctrlKey;

      if (primaryModifierPressed && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'l') {
        if (currentTab === 'translation') {
          e.preventDefault();
          window.dispatchEvent(new Event(FOCUS_TRANSLATION_URL_INPUT_EVENT));
        }
        return;
      }

      if (primaryModifierPressed && !e.shiftKey && !e.altKey) {
        const targetTab = getMainTabForShortcut(e.key);

        if (targetTab) {
          e.preventDefault();
          setTab(targetTab);
          return;
        }
      }

      if (primaryModifierPressed && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setDebugMode(!debugMode);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTab, debugMode, setDebugMode, setTab]);
}
