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
      setError(err instanceof Error ? err.message : String(err));
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

      try {
        const titlesToTranslate = [content.title];
        if (content.subtitle) titlesToTranslate.push(content.subtitle);
        
        const result = await invoke<{ translated: string[] }>('translate_paragraphs', {
          paragraphs: titlesToTranslate,
        });
        
        updateTitleTranslation(
          result.translated[0] || content.title,
          content.subtitle ? result.translated[1] : undefined
        );
      } catch (e) {
        console.error('Failed to translate title:', e);
      }

      // Then translate body with streaming
      const unlistenChunk = await listen<TranslationChunk>('translation-chunk', (event) => {
        const idx = decodeParagraphId(event.payload.paragraph_id);
        if (idx !== null) {
          updateParagraphTranslation(`p-${idx}`, event.payload.text);
        }
      });

      const unlistenComplete = await listen<boolean>('translation-complete', async () => {
        unlistenChunk();
        unlistenComplete();
        setIsTranslating(false);
      });

      try {
        await invoke('translate_paragraphs_streaming', { 
          paragraphs: content.paragraphs 
        });
      } catch (err) {
        unlistenChunk();
        unlistenComplete();
        setIsTranslating(false);
        throw err;
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error(err);
      setLoading(false);
      setIsTranslating(false);
    }
  }, [setChapterContent, setChapterList, setIsTranslating, updateParagraphTranslation]);

  const translateText = useCallback(async (text: string, note?: string) => {
    try {
      const result = await invoke<{ translated_text: string }>('translate_text', { text, note });
      return result.translated_text;
    } catch (err) {
      console.error("Translation failed:", err);
      throw err;
    }
  }, []);

  const translateParagraphs = useCallback(async (paragraphs: string[], note?: string) => {
    try {
      const result = await invoke<{ translated: string[] }>('translate_paragraphs', { paragraphs, note });
      return result.translated;
    } catch (err) {
      console.error("Translation failed:", err);
      throw err;
    }
  }, []);

  const translateParagraphsStreaming = useCallback(async (
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
      const result = await invoke<{ translated: string[] }>('translate_paragraphs_streaming', { paragraphs, note });
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
                  novel_id: novelId, 
                  site, 
                  start_chapter: start, 
                  end_chapter: end,
                  base_url: baseUrl
              } 
          });
      } catch (err) {
          setIsTranslating(false);
          setError(String(err));
      }
  }, [setIsTranslating]);

  const stopBatchTranslation = useCallback(async () => {
      try {
          await invoke('stop_translation');
          setIsTranslating(false);
      } catch (err) {
          setError(String(err));
      }
  }, [setIsTranslating]);

  const pauseBatchTranslation = useCallback(async () => {
      try {
          await invoke('pause_translation');
      } catch (err) {
          setError(String(err));
      }
  }, []);

  const resumeBatchTranslation = useCallback(async () => {
      try {
          await invoke('resume_translation');
      } catch (err) {
          setError(String(err));
      }
  }, []);

  const exportNovel = useCallback(async (novelId: string, options: ExportOptions) => {
      try {
          await invoke('export_novel', { request: { novel_id: novelId, options } });
      } catch (err) {
          setError(String(err));
          throw err;
      }
  }, []);

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
    exportNovel
  };
};
