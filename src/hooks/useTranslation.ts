import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useTranslationStore } from '../stores/translationStore';
import { useSeriesStore } from '../stores/seriesStore';
import { useUIStore } from '../stores/uiStore';
import { useDebugStore } from '../stores/debugStore';
import { getMessages } from '../i18n';
import type {
  Chapter,
  ChapterContent,
  CharacterDictionaryEntry,
  CharacterDictionaryReview,
  ExportRequest,
  TranslationChunk,
  WatchlistViewedUpdate,
} from '../types';

export const markViewedChapter = async (
  invokeFn: typeof invoke,
  site: string,
  novelId: string,
  chapterNumber?: number,
): Promise<WatchlistViewedUpdate | null> => {
  if (!chapterNumber || chapterNumber < 1) {
    return null;
  }

  return invokeFn<WatchlistViewedUpdate>('mark_episode_viewed', {
    site,
    novelId,
    chapterNumber,
  });
};

const formatTokenCount = (count: number): string => {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
};

const isAutoProperNounDictionaryEnabled = async (): Promise<boolean> => {
  const settings = await invoke<{ key: string; value: string }[]>('get_settings');
  const setting = settings.find((entry) => entry.key === 'auto_proper_noun_dictionary_enabled');
  return setting ? setting.value !== 'false' : true;
};

const normalizeDictionaryKey = (entry: CharacterDictionaryEntry): string => {
  const source = entry.source_text.trim().toLowerCase();
  const reading = (entry.reading ?? '').trim().toLowerCase();
  return `${source}::${reading}`;
};

export const filterNewProperNounEntries = (
  existingEntries: CharacterDictionaryEntry[],
  extractedEntries: CharacterDictionaryEntry[],
): CharacterDictionaryEntry[] => {
  const existingKeys = new Set(existingEntries.map(normalizeDictionaryKey));
  const seenKeys = new Set<string>();

  return extractedEntries.filter((entry) => {
    const sourceText = entry.source_text.trim();
    const reading = (entry.reading ?? '').trim();
    const targetName = entry.target_name.trim();
    if (!sourceText || !reading || !targetName) {
      return false;
    }

    const key = normalizeDictionaryKey(entry);
    if (existingKeys.has(key) || seenKeys.has(key)) {
      return false;
    }

    seenKeys.add(key);
    return true;
  });
};

export const mergeCharacterDictionaryEntries = (
  existingEntries: CharacterDictionaryEntry[],
  reviewedEntries: CharacterDictionaryEntry[],
): CharacterDictionaryEntry[] => {
  const mergedEntries = [...existingEntries];
  const entryIndexes = new Map(
    existingEntries.map((entry, index) => [normalizeDictionaryKey(entry), index]),
  );

  for (const entry of reviewedEntries) {
    const key = normalizeDictionaryKey(entry);
    const existingIndex = entryIndexes.get(key);

    if (existingIndex === undefined) {
      entryIndexes.set(key, mergedEntries.length);
      mergedEntries.push(entry);
      continue;
    }

    mergedEntries[existingIndex] = entry;
  }

  return mergedEntries;
};

export interface CharacterDictionaryReviewContent {
  site: string;
  novel_id: string;
  chapter_number: number;
  title: string;
  subtitle: string;
  translatedTitle?: string;
  translatedSubtitle?: string;
  paragraphs: Array<{
    original: string;
    translated?: string;
  }>;
}

export const createCharacterDictionaryReviewContent = (
  content: ChapterContent,
): CharacterDictionaryReviewContent => ({
  site: content.site,
  novel_id: content.novel_id,
  chapter_number: content.chapter_number,
  title: content.title,
  subtitle: content.subtitle,
  translatedTitle: '',
  translatedSubtitle: '',
  paragraphs: content.paragraphs.map((paragraph) => ({
    original: paragraph,
    translated: '',
  })),
});

export const applyTranslationChunkToReviewContent = (
  content: CharacterDictionaryReviewContent,
  chunk: TranslationChunk,
): void => {
  if (chunk.paragraph_id === 'title') {
    content.translatedTitle = chunk.text;
    return;
  }

  if (chunk.paragraph_id === 'subtitle') {
    content.translatedSubtitle = chunk.text;
    return;
  }

  if (!chunk.paragraph_id.startsWith('p-')) {
    return;
  }

  const paragraphNumber = Number.parseInt(chunk.paragraph_id.slice(2), 10);
  if (!Number.isFinite(paragraphNumber) || paragraphNumber < 1) {
    return;
  }

  const paragraph = content.paragraphs[paragraphNumber - 1];
  if (paragraph) {
    paragraph.translated = chunk.text;
  }
};

export const buildCharacterDictionaryReviewTexts = (
  content: CharacterDictionaryReviewContent,
): { originals: string[]; translateds: string[] } => ({
  originals: [
    content.title,
    ...(content.subtitle ? [content.subtitle] : []),
    ...content.paragraphs.map((paragraph) => paragraph.original),
  ],
  translateds: [
    content.translatedTitle || '',
    ...(content.subtitle ? [content.translatedSubtitle || ''] : []),
    ...content.paragraphs.map((paragraph) => paragraph.translated || ''),
  ],
});

export const resolveCharacterDictionaryTarget = (
  dictionaryMode: 'review' | 'manual',
  chapter: { site: string; novelId: string } | null,
  pendingReview: CharacterDictionaryReview | null,
): { site: string; novelId: string } | null => {
  if (dictionaryMode === 'review') {
    if (!pendingReview) {
      return null;
    }

    return {
      site: pendingReview.site,
      novelId: pendingReview.novel_id,
    };
  }

  if (!chapter) {
    return null;
  }

  return {
    site: chapter.site,
    novelId: chapter.novelId,
  };
};

export const useTranslation = () => {
  const setChapterContent = useTranslationStore((s) => s.setChapterContent);
  const setIsTranslating = useTranslationStore((s) => s.setIsTranslating);
  const updateParagraphTranslation = useTranslationStore((s) => s.updateParagraphTranslation);
  const updateTitleTranslation = useTranslationStore((s) => s.updateTitleTranslation);
  const setFailedParagraphIndices = useTranslationStore((s) => s.setFailedParagraphIndices);
  const clearFailedParagraphIndices = useTranslationStore((s) => s.clearFailedParagraphIndices);
  const setPendingCharacterDictionaryReview = useTranslationStore((s) => s.setPendingCharacterDictionaryReview);
  
  const setChapterList = useSeriesStore((s) => s.setChapterList);
  const setBatchProgress = useSeriesStore((s) => s.setBatchProgress);
  const markWatchlistEpisodeViewed = useSeriesStore((s) => s.markWatchlistEpisodeViewed);
  
  const language = useUIStore((s) => s.language);
  const showError = useUIStore((s) => s.showError);
  const showToast = useUIStore((s) => s.showToast);
  
  const addDebugLog = useDebugStore((s) => s.addDebugLog);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const localeMessages = getMessages(language);
  const translationStatusMessages = localeMessages.translation.translation;

  const getCharacterDictionary = useCallback(async (site: string, novelId: string) => {
    return invoke<CharacterDictionaryEntry[]>('get_novel_character_dictionary', {
      site,
      novelId,
    });
  }, []);

  const saveCharacterDictionary = useCallback(async (
    site: string,
    novelId: string,
    entries: CharacterDictionaryEntry[],
  ) => {
    return invoke<{ cleared_cache: boolean }>('save_novel_character_dictionary', {
      site,
      novelId,
      entries,
    });
  }, []);

  const maybePrepareCharacterDictionaryReview = useCallback(async (
    content: CharacterDictionaryReviewContent,
  ) => {
    if (!(await isAutoProperNounDictionaryEnabled())) {
      return;
    }

    const existingEntries = await getCharacterDictionary(content.site, content.novel_id);
    const { originals, translateds } = buildCharacterDictionaryReviewTexts(content);

    if (translateds.every((text) => !text.trim())) {
      return;
    }

    const extractedEntries = await invoke<CharacterDictionaryEntry[]>('extract_character_dictionary_candidates', {
      request: {
        site: content.site,
        novelId: content.novel_id,
        chapterNumber: content.chapter_number,
        title: content.title,
        subtitle: content.subtitle || null,
        originals,
        translateds,
      },
    });

    const entries = filterNewProperNounEntries(existingEntries, extractedEntries);
    if (entries.length === 0) {
      return;
    }

    setPendingCharacterDictionaryReview({
      site: content.site,
      novel_id: content.novel_id,
      chapter_number: content.chapter_number,
      entries,
    });
    showToast(`새 고유명사 후보 ${entries.length}개를 확인해주세요.`);
  }, [getCharacterDictionary, setPendingCharacterDictionaryReview, showToast]);

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
          isSpacer: p.trim() === '',
        })),
        prev_url: content.prev_url,
        next_url: content.next_url,
        source_url: url,
      });

      const viewedUpdate = await markViewedChapter(
        invoke,
        content.site,
        content.novel_id,
        content.chapter_number,
      );
      if (viewedUpdate) {
        markWatchlistEpisodeViewed(
          viewedUpdate.site,
          viewedUpdate.novelId,
          viewedUpdate.chapterNumber,
          viewedUpdate.remainingNewEpisodeCount,
        );
      }

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
  }, [markWatchlistEpisodeViewed, setChapterContent, setChapterList, showError]);

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
        isSpacer: p.trim() === '',
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
        source_url: url,
      });

      const viewedUpdate = await markViewedChapter(
        invoke,
        content.site,
        content.novel_id,
        content.chapter_number,
      );
      if (viewedUpdate) {
        markWatchlistEpisodeViewed(
          viewedUpdate.site,
          viewedUpdate.novelId,
          viewedUpdate.chapterNumber,
          viewedUpdate.remainingNewEpisodeCount,
        );
      }

      try {
        const list = await invoke<{ chapters: Chapter[] }>('get_chapter_list', { url });
        setChapterList(list.chapters);
      } catch (e) {
        console.log("Could not fetch chapter list", e);
      }

      setLoading(false);
      setIsTranslating(true);
      const reviewContent = createCharacterDictionaryReviewContent(content);
      
      const unlistenChunk = await listen<TranslationChunk>('translation-chunk', (event) => {
        const paragraphId = event.payload.paragraph_id;
        const translatedPreview = event.payload.text.slice(0, 40) + (event.payload.text.length > 40 ? '...' : '');
        applyTranslationChunkToReviewContent(reviewContent, event.payload);
        
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
            translationStatusMessages.partialFailure(failedIndices.length)
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
          showToast(
            translationStatusMessages.completeWithTokens(
              formatTokenCount(input_tokens),
              formatTokenCount(output_tokens),
            ),
          );
        } else if (success) {
          showToast(translationStatusMessages.completeFromCache);
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

          try {
            await maybePrepareCharacterDictionaryReview(reviewContent);
          } catch (err) {
            addDebugLog('warn', `Character dictionary candidate extraction skipped: ${err}`);
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
          site: content.site,
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
  }, [markWatchlistEpisodeViewed, setChapterContent, setChapterList, setIsTranslating, updateParagraphTranslation, updateTitleTranslation, showError, showToast, setFailedParagraphIndices, clearFailedParagraphIndices, addDebugLog, maybePrepareCharacterDictionaryReview, translationStatusMessages]);

  const translateText = useCallback(async (site: string, novelId: string, text: string, note?: string) => {
    try {
      const result = await invoke<{ translated_text: string }>('translate_text', { site, novelId, text, note });
      return result.translated_text;
    } catch (err) {
      console.error("Translation failed:", err);
      throw err;
    }
  }, []);

  const translateParagraphs = useCallback(async (site: string, novelId: string, paragraphs: string[], note?: string) => {
    try {
      const result = await invoke<{ translated: string[] }>('translate_paragraphs', { site, novelId, paragraphs, note });
      return result.translated;
    } catch (err) {
      console.error("Translation failed:", err);
      throw err;
    }
  }, []);

  const translateParagraphsStreaming = useCallback(async (
    site: string,
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
      const result = await invoke<{ translated: string[] }>('translate_paragraphs_streaming', { site, novelId, paragraphs, hasSubtitle, note });
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
          showError(translationStatusMessages.batchFailed, errMsg);
      }
  }, [setIsTranslating, showError, translationStatusMessages]);

  const stopBatchTranslation = useCallback(async () => {
      try {
          await invoke('stop_translation');
          setIsTranslating(false);
          setBatchProgress(null);
      } catch (err) {
          const errMsg = String(err);
          setError(errMsg);
          showError(translationStatusMessages.stopFailed, errMsg);
      }
  }, [setIsTranslating, showError, setBatchProgress, translationStatusMessages]);

  const pauseBatchTranslation = useCallback(async () => {
      try {
          await invoke('pause_translation');
      } catch (err) {
          const errMsg = String(err);
          setError(errMsg);
          showError(translationStatusMessages.pauseFailed, errMsg);
      }
  }, [showError, translationStatusMessages]);

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
    
    const retryTexts: string[] = [];
    
    failedOriginalIndices.forEach((origIdx) => {
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
      
      let originalIdx: number;
      if (paragraphId === 'title') {
        originalIdx = 0;
      } else if (paragraphId === 'subtitle') {
        originalIdx = 1;
      } else if (paragraphId.startsWith('p-')) {
        const pNum = parseInt(paragraphId.slice(2), 10);
        originalIdx = hasSubtitle ? pNum + 1 : pNum;
      } else {
        return;
      }
      
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
      setFailedParagraphIndices(event.payload.failed_indices);
      if (event.payload.failed_indices.length > 0) {
        showError(
          '일부 번역 실패',
          `${event.payload.failed_indices.length}개 항목이 여전히 실패했습니다.`
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
        site: chapterContent.site,
        novelId: chapterContent.novel_id,
        paragraphs: retryTexts,
        hasSubtitle,
        originalIndices: failedOriginalIndices,
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
    getCharacterDictionary,
    saveCharacterDictionary,
    startBatchTranslation,
    stopBatchTranslation,
    pauseBatchTranslation,
    resumeBatchTranslation,
    retryFailedParagraphs,
    exportNovel
  };
};
