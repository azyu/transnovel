import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../stores/appStore';
import type { ChapterContent, Chapter, ExportOptions } from '../types';

export const useTranslation = () => {
  const { 
    setChapterContent, 
    setChapterList, 
    setIsTranslating 
  } = useAppStore();
  
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
        title: content.title,
        subtitle: content.subtitle,
        paragraphs: content.paragraphs.map((p, index) => ({
          id: `p-${index}`,
          original: p,
        })),
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
    translateText,
    translateParagraphs,
    startBatchTranslation,
    stopBatchTranslation,
    pauseBatchTranslation,
    resumeBatchTranslation,
    exportNovel
  };
};
