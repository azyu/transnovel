import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../stores/appStore';
import type { TranslationProgress } from '../types';

export const useTauriEvents = () => {
  const { setBatchProgress, updateBatchProgress, setIsTranslating } = useAppStore();

  useEffect(() => {
    const unlistenProgress = listen<TranslationProgress>('translation-progress', (event) => {
      setBatchProgress(event.payload);
    });

    const unlistenComplete = listen<{ novel_id: string }>('batch-translation-complete', () => {
      setIsTranslating(false);
      updateBatchProgress({ status: 'completed' });
    });

    const unlistenError = listen<{ error: string }>('translation-error', (event) => {
       console.error("Translation error:", event.payload.error);
       updateBatchProgress({ status: 'error', error_message: event.payload.error });
    });

    return () => {
      unlistenProgress.then((f) => f());
      unlistenComplete.then((f) => f());
      unlistenError.then((f) => f());
    };
  }, [setBatchProgress, updateBatchProgress, setIsTranslating]);
};
