import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useTranslationStore } from '../stores/translationStore';
import { useSeriesStore } from '../stores/seriesStore';
import { useUIStore } from '../stores/uiStore';
import { useDebugStore } from '../stores/debugStore';
import type { ChapterContent, Chapter, ExportRequest, TranslationChunk } from '../types';

const formatTokenCount = (count: number): string => {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
};

export const useTranslation = () => {
  const setChapterContent = useTranslationStore((s) => s.setChapterContent);
  const setIsTranslating = useTranslationStore((s) => s.setIsTranslating);
  const updateParagraphTranslation = useTranslationStore((s) => s.updateParagraphTranslation);
  const updateTitleTranslation = useTranslationStore((s) => s.updateTitleTranslation);
  const setFailedParagraphIndices = useTranslationStore((s) => s.setFailedParagraphIndices);
  const clearFailedParagraphIndices = useTranslationStore((s) => s.clearFailedParagraphIndices);
  
  const setChapterList = useSeriesStore((s) => s.setChapterList);
  const setBatchProgress = useSeriesStore((s) => s.setBatchProgress);
  
  const showError = useUIStore((s) => s.showError);
  const showToast = useUIStore((s) => s.showToast);
  
  const addDebugLog = useDebugStore((s) => s.addDebugLog);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseChapter = useCallback(async (url: string) => {
    setLoading(true);
    setError(null);
    try {
      const content = await invoke<ChapterContent>('parse_chapter', { url });
      setChapterContent({
        site: content.site,
        novel_id: content.novel_id,
        novel_title: content.novel_title,
        chapter_number: content.chapter_number,
        title: content.title,
        subtitle: content.subtitle,
        paragraphs: content.paragraphs.map((p, index) => ({
          id: `p-${index + 1}`,
          original: p,
        })),
        prev_url: content.prev_url,
        next_url: content.next_url,
      });

      try {
         const list = await invoke<{ chapters: Chapter[] }>('get_chapter_list', { url });
         const completedChapters = await invoke<number[]>('get_completed_chapters', { novelId: content.novel_id });
         const chaptersWithStatus = list.chapters.map(ch => ({
           ...ch,
           status: completedChapters.includes(ch.number) ? 'completed' as const : ch.status,
         }));
         setChapterList(chaptersWithStatus);
      } catch (e) {
          console.log("Could not fetch chapter list", e);
      }

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
      showError('챕터 파싱 실패', errMsg);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [setChapterContent, setChapterList, showError]);

  const parseAndTranslate = useCallback(async (url: string) => {
    if (useTranslationStore.getState().isTranslating) {
      showError('번역 진행 중', '현재 번역이 진행 중입니다. 완료 후 다시 시도해주세요.');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const content = await invoke<ChapterContent>('parse_chapter', { url });
      const paragraphs = content.paragraphs.map((p, index) => ({
        id: `p-${index + 1}`,
        original: p,
      }));
      
      setChapterContent({
        site: content.site,
        novel_id: content.novel_id,
        novel_title: content.novel_title,
        chapter_number: content.chapter_number,
        title: content.title,
        subtitle: content.subtitle,
        paragraphs,
        prev_url: content.prev_url,
        next_url: content.next_url,
      });

      try {
        const list = await invoke<{ chapters: Chapter[] }>('get_chapter_list', { url });
        setChapterList(list.chapters);
      } catch (e) {
        console.log("Could not fetch chapter list", e);
      }

      setLoading(false);
      setIsTranslating(true);
      
      const unlistenChunk = await listen<TranslationChunk>('translation-chunk', (event) => {
        const paragraphId = event.payload.paragraph_id;
        const translatedPreview = event.payload.text.slice(0, 40) + (event.payload.text.length > 40 ? '...' : '');
        
        if (event.payload.text.trim() === '') {
          addDebugLog('warn', `Empty translation received for [${paragraphId}]`);
        }
        
        if (paragraphId === 'title') {
          const originalPreview = content.title.slice(0, 30) + (content.title.length > 30 ? '...' : '');
          addDebugLog('chunk', `[${paragraphId}] title: "${originalPreview}" → "${translatedPreview}"`);
          updateTitleTranslation(event.payload.text, undefined);
        } else if (paragraphId === 'subtitle') {
          const originalPreview = (content.subtitle ?? '').slice(0, 30) + ((content.subtitle?.length ?? 0) > 30 ? '...' : '');
          addDebugLog('chunk', `[${paragraphId}] subtitle: "${originalPreview}" → "${translatedPreview}"`);
          updateTitleTranslation(undefined, event.payload.text);
        } else if (paragraphId.startsWith('p-')) {
          const paragraphNum = parseInt(paragraphId.slice(2), 10);
          const paragraphIdx = paragraphNum - 1;
          const original = content.paragraphs[paragraphIdx] ?? '';
          const originalPreview = original.slice(0, 30) + (original.length > 30 ? '...' : '');
          addDebugLog('chunk', `[${paragraphId}]: "${originalPreview}" → "${translatedPreview}"`);
          updateParagraphTranslation(paragraphId, event.payload.text);
        } else {
          addDebugLog('warn', `Unknown paragraph_id format: ${paragraphId}`);
        }
      });

      const unlistenFailed = await listen<{ failed_indices: number[]; total: number }>('translation-failed-paragraphs', (event) => {
        const failedIndices = event.payload.failed_indices;
        addDebugLog('warn', `Failed indices (original): [${failedIndices.join(', ')}]`);
        setFailedParagraphIndices(failedIndices);
        if (failedIndices.length > 0) {
          showError(
            '일부 번역 실패',
            `${failedIndices.length}개 항목 번역에 실패했습니다. 재시도 버튼을 눌러 다시 시도할 수 있습니다.`
          );
        }
      });

      const unlistenError = await listen<{ error_type: string; title: string; message: string; request_preview?: string; response_preview?: string }>('translation-error', (event) => {
        const { title, message, request_preview, response_preview } = event.payload;
        addDebugLog('error', `${title}: ${message}`);
        if (request_preview) {
          addDebugLog('error', `[Request] ${request_preview}`);
        }
        if (response_preview) {
          addDebugLog('error', `[Response] ${response_preview}`);
        }
        showError(title, message);
      });

      const unlistenComplete = await listen<{ success: boolean; total: number; failed_count: number; input_tokens: number; output_tokens: number }>('translation-complete', async (event) => {
        const { success, total, failed_count, input_tokens, output_tokens } = event.payload;
        addDebugLog('complete', `Translation complete: ${success ? 'SUCCESS' : 'PARTIAL FAILURE'} (${total - failed_count}/${total})`);
        unlistenChunk();
        unlistenFailed();
        unlistenComplete();
        unlistenCache();
        unlistenError();
        unlistenDebugApi();
        setIsTranslating(false);
        
        if (success && (input_tokens > 0 || output_tokens > 0)) {
          showToast(`번역이 완료되었습니다. (input=${formatTokenCount(input_tokens)}, output=${formatTokenCount(output_tokens)})`);
        } else if (success) {
          showToast('번역이 완료되었습니다. (캐시에서 로드됨)');
        }
        
        if (content.chapter_number > 0 && success) {
          try {
            await invoke('mark_chapter_complete', {
              novelId: content.novel_id,
              chapterNumber: content.chapter_number,
              paragraphCount: content.paragraphs.length,
            });
            addDebugLog('info', `Chapter ${content.chapter_number} marked as completed`);
            
            const completedChapters = await invoke<number[]>('get_completed_chapters', { novelId: content.novel_id });
            const currentChapterList = useSeriesStore.getState().chapterList;
            if (currentChapterList.length > 0) {
              const updatedChapters = currentChapterList.map((ch: Chapter) => ({
                ...ch,
                status: completedChapters.includes(ch.number) ? 'completed' as const : ch.status,
              }));
              setChapterList(updatedChapters);
            }
          } catch (err) {
            addDebugLog('warn', `Failed to mark chapter complete: ${err}`);
          }
        } else if (!success && content.chapter_number > 0) {
          addDebugLog('warn', `Chapter ${content.chapter_number} NOT marked as completed due to ${failed_count} failed translations`);
        }
      });

      const unlistenCache = await listen<{ paragraph_id: string; cache_hit: boolean; original_preview: string }>('debug-cache', (event) => {
        const { paragraph_id, cache_hit, original_preview } = event.payload;
        addDebugLog(
          cache_hit ? 'info' : 'info',
          `[${paragraph_id}] ${cache_hit ? '✓ cache hit' : '✗ cache miss'}: "${original_preview}${original_preview.length >= 30 ? '...' : ''}"`
        );
      });

      const unlistenDebugApi = await listen<{ type: string; provider: string; model?: string; status?: number; body: string }>('debug-api', (event) => {
        const { type, provider, model, status, body } = event.payload;
        if (type === 'request') {
          addDebugLog('info', `[API Request] ${provider}/${model}`);
          addDebugLog('info', body);
        } else if (type === 'warning') {
          addDebugLog('warn', `[${provider}] ${body}`);
        } else {
          const isSuccess = status && status >= 200 && status < 300;
          addDebugLog(isSuccess ? 'info' : 'error', `[API Response] ${provider} - Status ${status}`);
          addDebugLog(isSuccess ? 'info' : 'error', body);
        }
      });

      clearFailedParagraphIndices();

      const hasSubtitle = Boolean(content.subtitle);
      const allTexts = [
        content.title,
        ...(content.subtitle ? [content.subtitle] : []),
        ...content.paragraphs,
      ];

      addDebugLog('info', `${url} | Starting translation: ${allTexts.length} items (title + ${content.subtitle ? 'subtitle + ' : ''}${content.paragraphs.length} paragraphs)`);

      try {
        await invoke('translate_paragraphs_streaming', { 
          novelId: content.novel_id,
          paragraphs: allTexts,
          hasSubtitle,
        });
      } catch (err) {
        addDebugLog('error', `Translation error: ${err}`);
        unlistenChunk();
        unlistenFailed();
        unlistenError();
        unlistenComplete();
        unlistenCache();
        unlistenDebugApi();
        setIsTranslating(false);
        throw err;
      }

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
      showError('번역 실패', errMsg);
      console.error(err);
      setLoading(false);
      setIsTranslating(false);
    }
  }, [setChapterContent, setChapterList, setIsTranslating, updateParagraphTranslation, updateTitleTranslation, showError, showToast, setFailedParagraphIndices, clearFailedParagraphIndices, addDebugLog]);

  const translateText = useCallback(async (novelId: string, text: string, note?: string) => {
    try {
      const result = await invoke<{ translated_text: string }>('translate_text', { novelId, text, note });
      return result.translated_text;
    } catch (err) {
      console.error("Translation failed:", err);
      throw err;
    }
  }, []);

  const translateParagraphs = useCallback(async (novelId: string, paragraphs: string[], note?: string) => {
    try {
      const result = await invoke<{ translated: string[] }>('translate_paragraphs', { novelId, paragraphs, note });
      return result.translated;
    } catch (err) {
      console.error("Translation failed:", err);
      throw err;
    }
  }, []);

  const translateParagraphsStreaming = useCallback(async (
    novelId: string,
    paragraphs: string[],
    onChunk: (chunk: TranslationChunk) => void,
    onComplete: () => void,
    hasSubtitle?: boolean,
    note?: string
  ) => {
    const unlistenChunk = await listen<TranslationChunk>('translation-chunk', (event) => {
      onChunk(event.payload);
    });
    
    const unlistenComplete = await listen<{ success: boolean; total: number; failed_count: number }>('translation-complete', () => {
      onComplete();
      unlistenChunk();
      unlistenComplete();
    });
    
    try {
      const result = await invoke<{ translated: string[] }>('translate_paragraphs_streaming', { novelId, paragraphs, hasSubtitle, note });
      return result.translated;
    } catch (err) {
      unlistenChunk();
      unlistenComplete();
      console.error("Streaming translation failed:", err);
      throw err;
    }
  }, []);

  const startBatchTranslation = useCallback(async (novelId: string, site: string, start: number, end: number, baseUrl: string) => {
      if (useTranslationStore.getState().isTranslating) {
        showError('번역 진행 중', '현재 번역이 진행 중입니다. 완료 후 다시 시도해주세요.');
        return;
      }
      
      try {
          setIsTranslating(true);
await invoke('start_batch_translation', { 
               request: { 
                   novelId, 
                   site, 
                   startChapter: start, 
                   endChapter: end,
                   baseUrl
               } 
           });
      } catch (err) {
          setIsTranslating(false);
          const errMsg = String(err);
          setError(errMsg);
          showError('일괄 번역 실패', errMsg);
      }
  }, [setIsTranslating, showError]);

  const stopBatchTranslation = useCallback(async () => {
      try {
          await invoke('stop_translation');
          setIsTranslating(false);
          setBatchProgress(null);
      } catch (err) {
          const errMsg = String(err);
          setError(errMsg);
          showError('번역 중지 실패', errMsg);
      }
  }, [setIsTranslating, showError, setBatchProgress]);

  const pauseBatchTranslation = useCallback(async () => {
      try {
          await invoke('pause_translation');
      } catch (err) {
          const errMsg = String(err);
          setError(errMsg);
          showError('번역 일시정지 실패', errMsg);
      }
  }, [showError]);

  const resumeBatchTranslation = useCallback(async () => {
      try {
          await invoke('resume_translation');
      } catch (err) {
          const errMsg = String(err);
          setError(errMsg);
          showError('번역 재개 실패', errMsg);
      }
  }, [showError]);

  const retryFailedParagraphs = useCallback(async () => {
    const chapterContent = useTranslationStore.getState().getChapterContent();
    const failedOriginalIndices = useTranslationStore.getState().failedParagraphIndices;
    
    if (!chapterContent || failedOriginalIndices.length === 0) return;

    const hasSubtitle = Boolean(chapterContent.subtitle);
    
    const retryIndexToOriginalIndex = new Map<number, number>();
    const retryTexts: string[] = [];
    
    failedOriginalIndices.forEach((origIdx, retryIdx) => {
      retryIndexToOriginalIndex.set(retryIdx, origIdx);
      
      if (origIdx === 0) {
        retryTexts.push(chapterContent.title);
      } else if (origIdx === 1 && hasSubtitle) {
        retryTexts.push(chapterContent.subtitle);
      } else {
        const paragraphIdx = hasSubtitle ? origIdx - 2 : origIdx - 1;
        const paragraph = chapterContent.paragraphs[paragraphIdx];
        if (paragraph?.original) {
          retryTexts.push(paragraph.original);
        }
      }
    });

    if (retryTexts.length === 0) return;

    setIsTranslating(true);
    clearFailedParagraphIndices();

    const unlistenChunk = await listen<TranslationChunk>('translation-chunk', (event) => {
      const paragraphId = event.payload.paragraph_id;
      
      let retryIdx: number;
      if (paragraphId === 'title') {
        retryIdx = 0;
      } else if (paragraphId === 'subtitle') {
        retryIdx = 1;
      } else if (paragraphId.startsWith('p-')) {
        const pNum = parseInt(paragraphId.slice(2), 10);
        retryIdx = pNum;
      } else {
        return;
      }
      
      const originalIdx = retryIndexToOriginalIndex.get(retryIdx);
      if (originalIdx === undefined) return;
      
      if (originalIdx === 0) {
        updateTitleTranslation(event.payload.text, undefined);
      } else if (originalIdx === 1 && hasSubtitle) {
        updateTitleTranslation(undefined, event.payload.text);
      } else {
        const paragraphIdx = hasSubtitle ? originalIdx - 2 : originalIdx - 1;
        updateParagraphTranslation(`p-${paragraphIdx + 1}`, event.payload.text);
      }
    });

    const unlistenFailed = await listen<{ failed_indices: number[]; total: number }>('translation-failed-paragraphs', (event) => {
      const originalFailedIndices = event.payload.failed_indices
        .map(retryIdx => retryIndexToOriginalIndex.get(retryIdx))
        .filter((idx): idx is number => idx !== undefined);
      
      setFailedParagraphIndices(originalFailedIndices);
      if (originalFailedIndices.length > 0) {
        showError(
          '일부 번역 실패',
          `${originalFailedIndices.length}개 항목이 여전히 실패했습니다.`
        );
      }
    });

    const unlistenError = await listen<{ error_type: string; title: string; message: string; request_preview?: string; response_preview?: string }>('translation-error', (event) => {
      const { title, message, request_preview, response_preview } = event.payload;
      addDebugLog('error', `${title}: ${message}`);
      if (request_preview) {
        addDebugLog('error', `[Request] ${request_preview}`);
      }
      if (response_preview) {
        addDebugLog('error', `[Response] ${response_preview}`);
      }
      showError(title, message);
    });

    const unlistenComplete = await listen<{ success: boolean; total: number; failed_count: number }>('translation-complete', async () => {
      unlistenChunk();
      unlistenFailed();
      unlistenError();
      unlistenComplete();
      setIsTranslating(false);
    });

    try {
      await invoke('translate_paragraphs_streaming', {
        novelId: chapterContent.novel_id,
        paragraphs: retryTexts,
        hasSubtitle: false,
      });
    } catch (err) {
      unlistenChunk();
      unlistenFailed();
      unlistenError();
      unlistenComplete();
      setIsTranslating(false);
      showError('재시도 실패', String(err));
    }
  }, [setIsTranslating, updateParagraphTranslation, updateTitleTranslation, showError, setFailedParagraphIndices, clearFailedParagraphIndices, addDebugLog]);

  const exportNovel = useCallback(async (request: ExportRequest) => {
      try {
          await invoke('export_novel', { request });
      } catch (err) {
          const errMsg = String(err);
          setError(errMsg);
          showError('내보내기 실패', errMsg);
          throw err;
      }
  }, [showError]);

  return {
    loading,
    error,
    parseChapter,
    parseAndTranslate,
    translateText,
    translateParagraphs,
    translateParagraphsStreaming,
    startBatchTranslation,
    stopBatchTranslation,
    pauseBatchTranslation,
    resumeBatchTranslation,
    retryFailedParagraphs,
    exportNovel
  };
};
