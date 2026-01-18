import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../stores/appStore';
import type { TranslationProgress } from '../types';

export const useTauriEvents = () => {
  const { setBatchProgress, updateBatchProgress, setIsTranslating, updateChapterStatus } = useAppStore();

  useEffect(() => {
    const unlistenProgress = listen<TranslationProgress>('translation-progress', (event) => {
      setBatchProgress(event.payload);
    });

    const unlistenComplete = listen<{ novel_id: string }>('batch-translation-complete', () => {
      setIsTranslating(false);
      updateBatchProgress({ status: 'completed' });
    });

    const unlistenError = listen<TranslationProgress>('translation-error', (event) => {
       console.error("Translation error:", event.payload.error_message);
       updateBatchProgress({ 
         status: 'error', 
         error_message: event.payload.error_message ?? 'Unknown error',
         current_chapter: event.payload.current_chapter,
       });
    });

    const unlistenChapterCompleted = listen<{ chapter: number; novel_id: string }>('chapter-completed', (event) => {
      updateChapterStatus(event.payload.chapter, 'completed');
    });

    return () => {
      unlistenProgress.then((f) => f());
      unlistenComplete.then((f) => f());
      unlistenError.then((f) => f());
      unlistenChapterCompleted.then((f) => f());
    };
  }, [setBatchProgress, updateBatchProgress, setIsTranslating, updateChapterStatus]);
};
