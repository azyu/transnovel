import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useTranslationStore } from '../stores/translationStore';
import { useSeriesStore } from '../stores/seriesStore';
import type { TranslationProgress } from '../types';

export const useTauriEvents = () => {
  const setIsTranslating = useTranslationStore((s) => s.setIsTranslating);
  const setBatchProgress = useSeriesStore((s) => s.setBatchProgress);
  const updateBatchProgress = useSeriesStore((s) => s.updateBatchProgress);
  const updateChapterStatus = useSeriesStore((s) => s.updateChapterStatus);

  useEffect(() => {
    const unlistenProgress = listen<TranslationProgress>('translation-progress', (event) => {
      setBatchProgress(event.payload);
    });

    const unlistenComplete = listen<{ novel_id: string }>('batch-translation-complete', () => {
      setIsTranslating(false);
      updateBatchProgress({ status: 'completed' });
    });

    const unlistenError = listen<{ message?: string; title?: string; error_type?: string }>('translation-error', (event) => {
       console.error("Translation error:", event.payload.message);
       updateBatchProgress({ 
         status: 'error', 
         error_message: event.payload.message ?? event.payload.title ?? 'Unknown error',
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
