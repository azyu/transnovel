import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../stores/appStore';
import type { ChapterContent, Chapter, ExportOptions, TranslationChunk } from '../types';

export const useTranslation = () => {
  const { 
    setChapterContent, 
    setChapterList, 
    setIsTranslating,
    updateParagraphTranslation,
    updateTitleTranslation,
    showError,
    setFailedParagraphIndices,
    clearFailedParagraphIndices,
  } = useAppStore();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decodeParagraphId = (id: string): number | null => {
    const chars = id.split('');
    if (chars.length === 0 || chars.length > 6) return null;
    
    const decodeChar = (c: string): number | null => {
      if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 65;
      if (c >= 'a' && c <= 'z') return c.charCodeAt(0) - 71;
      return null;
    };
    
    if (chars.length === 1) {
      return decodeChar(chars[0]);
    }
    
    let result = 0;
    for (let i = 0; i < chars.length; i++) {
      const charValue = decodeChar(chars[i]);
      if (charValue === null) return null;
      
      if (i === 0) {
        result = charValue;
      } else {
        result = (result + 1) * 52 + charValue;
      }
    }
    
    return result;
  };

  const parseChapter = useCallback(async (url: string) => {
    setLoading(true);
    setError(null);
    try {
      const content = await invoke<ChapterContent>('parse_chapter', { url });
      setChapterContent({
        site: content.site,
        novel_id: content.novel_id,
        title: content.title,
        subtitle: content.subtitle,
        paragraphs: content.paragraphs.map((p, index) => ({
          id: `p-${index}`,
          original: p,
        })),
        prev_url: content.prev_url,
        next_url: content.next_url,
      });

      try {
         const list = await invoke<{ chapters: Chapter[] }>('get_chapter_list', { url });
         setChapterList(list.chapters);
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
  }, [setChapterContent, setChapterList]);

  const parseAndTranslate = useCallback(async (url: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const content = await invoke<ChapterContent>('parse_chapter', { url });
      const paragraphs = content.paragraphs.map((p, index) => ({
        id: `p-${index}`,
        original: p,
      }));
      
      setChapterContent({
        site: content.site,
        novel_id: content.novel_id,
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

      const titleOffset = content.subtitle ? 2 : 1;
      
      const unlistenChunk = await listen<TranslationChunk>('translation-chunk', (event) => {
        const idx = decodeParagraphId(event.payload.paragraph_id);
        if (idx === null) return;
        
        if (idx === 0) {
          updateTitleTranslation(event.payload.text, undefined);
        } else if (idx === 1 && content.subtitle) {
          updateTitleTranslation(undefined, event.payload.text);
        } else {
          const paragraphIdx = idx - titleOffset;
          updateParagraphTranslation(`p-${paragraphIdx}`, event.payload.text);
        }
      });

      const unlistenFailed = await listen<{ failed_indices: number[]; total: number }>('translation-failed-paragraphs', (event) => {
        const adjustedIndices = event.payload.failed_indices
          .filter(idx => idx >= titleOffset)
          .map(idx => idx - titleOffset);
        setFailedParagraphIndices(adjustedIndices);
        if (adjustedIndices.length > 0) {
          showError(
            '일부 문단 번역 실패',
            `${adjustedIndices.length}개 문단 번역에 실패했습니다. 재시도 버튼을 눌러 다시 시도할 수 있습니다.`
          );
        }
      });

      const unlistenComplete = await listen<boolean>('translation-complete', async () => {
        unlistenChunk();
        unlistenFailed();
        unlistenComplete();
        setIsTranslating(false);
      });

      clearFailedParagraphIndices();

      const allTexts = [
        content.title,
        ...(content.subtitle ? [content.subtitle] : []),
        ...content.paragraphs,
      ];

      try {
        await invoke('translate_paragraphs_streaming', { 
          novelId: content.novel_id,
          paragraphs: allTexts 
        });
      } catch (err) {
        unlistenChunk();
        unlistenFailed();
        unlistenComplete();
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
  }, [setChapterContent, setChapterList, setIsTranslating, updateParagraphTranslation, updateTitleTranslation, showError, setFailedParagraphIndices, clearFailedParagraphIndices]);

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
    note?: string
  ) => {
    const unlistenChunk = await listen<TranslationChunk>('translation-chunk', (event) => {
      onChunk(event.payload);
    });
    
    const unlistenComplete = await listen<boolean>('translation-complete', () => {
      onComplete();
      unlistenChunk();
      unlistenComplete();
    });
    
    try {
      const result = await invoke<{ translated: string[] }>('translate_paragraphs_streaming', { novelId, paragraphs, note });
      return result.translated;
    } catch (err) {
      unlistenChunk();
      unlistenComplete();
      console.error("Streaming translation failed:", err);
      throw err;
    }
  }, []);

  const startBatchTranslation = useCallback(async (novelId: string, site: string, start: number, end: number, baseUrl: string) => {
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
          useAppStore.getState().setBatchProgress(null);
      } catch (err) {
          const errMsg = String(err);
          setError(errMsg);
          showError('번역 중지 실패', errMsg);
      }
  }, [setIsTranslating, showError]);

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
    const store = useAppStore.getState();
    const { chapterContent, failedParagraphIndices } = store;
    
    if (!chapterContent || failedParagraphIndices.length === 0) return;

    const failedParagraphs = failedParagraphIndices.map(idx => chapterContent.paragraphs[idx]?.original).filter(Boolean);
    if (failedParagraphs.length === 0) return;

    setIsTranslating(true);
    clearFailedParagraphIndices();

    const unlistenChunk = await listen<TranslationChunk>('translation-chunk', (event) => {
      const idx = decodeParagraphId(event.payload.paragraph_id);
      if (idx !== null) {
        updateParagraphTranslation(`p-${idx}`, event.payload.text);
      }
    });

    const unlistenFailed = await listen<{ failed_indices: number[]; total: number }>('translation-failed-paragraphs', (event) => {
      setFailedParagraphIndices(event.payload.failed_indices);
      if (event.payload.failed_indices.length > 0) {
        showError(
          '일부 문단 번역 실패',
          `${event.payload.failed_indices.length}개 문단이 여전히 실패했습니다.`
        );
      }
    });

    const unlistenComplete = await listen<boolean>('translation-complete', async () => {
      unlistenChunk();
      unlistenFailed();
      unlistenComplete();
      setIsTranslating(false);
    });

    try {
      await invoke('translate_paragraphs_streaming', {
        novelId: chapterContent.novel_id,
        paragraphs: failedParagraphs,
      });
    } catch (err) {
      unlistenChunk();
      unlistenFailed();
      unlistenComplete();
      setIsTranslating(false);
      showError('재시도 실패', String(err));
    }
  }, [setIsTranslating, updateParagraphTranslation, showError, setFailedParagraphIndices, clearFailedParagraphIndices]);

  const exportNovel = useCallback(async (novelId: string, options: ExportOptions) => {
      try {
          await invoke('export_novel', { request: { novel_id: novelId, options } });
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
