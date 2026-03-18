import { create } from 'zustand';
import type { Paragraph } from '../types';

interface ChapterMeta {
  site: string;
  novelId: string;
  novelTitle: string | null;
  chapterNumber: number;
  title: string;
  subtitle: string;
  prevUrl: string | null;
  nextUrl: string | null;
  sourceUrl: string;
}

interface TranslationState {
  currentUrl: string;
  setUrl: (url: string) => void;

  chapter: ChapterMeta | null;
  translatedTitle?: string;
  translatedSubtitle?: string;

  paragraphIds: string[];
  paragraphById: Record<string, Paragraph>;
  translatedCount: number;

  isTranslating: boolean;
  setIsTranslating: (v: boolean) => void;

  failedParagraphIndices: number[];
  setFailedParagraphIndices: (indices: number[]) => void;
  clearFailedParagraphIndices: () => void;

  setChapterContent: (content: {
    site: string;
    novel_id: string;
    novel_title?: string | null;
    chapter_number?: number;
    title: string;
    subtitle: string;
    paragraphs: Paragraph[];
    prev_url: string | null;
    next_url: string | null;
    source_url: string;
    translatedTitle?: string;
    translatedSubtitle?: string;
  } | null) => void;

  updateTitleTranslation: (title?: string, subtitle?: string) => void;
  updateParagraphTranslation: (id: string, text: string) => void;
  updateAllTranslations: (translations: string[]) => void;

  getChapterContent: () => {
    site: string;
    novel_id: string;
    novel_title: string | null;
    chapter_number: number;
    title: string;
    subtitle: string;
    translatedTitle?: string;
    translatedSubtitle?: string;
    paragraphs: Paragraph[];
    prev_url: string | null;
    next_url: string | null;
    source_url: string;
  } | null;
}

export const useTranslationStore = create<TranslationState>((set, get) => ({
  currentUrl: '',
  setUrl: (url) => set({ currentUrl: url }),

  chapter: null,
  translatedTitle: undefined,
  translatedSubtitle: undefined,

  paragraphIds: [],
  paragraphById: {},
  translatedCount: 0,

  isTranslating: false,
  setIsTranslating: (v) => set({ isTranslating: v }),

  failedParagraphIndices: [],
  setFailedParagraphIndices: (indices) => set({ failedParagraphIndices: indices }),
  clearFailedParagraphIndices: () => set({ failedParagraphIndices: [] }),

  setChapterContent: (content) => {
    if (!content) {
      set({
        chapter: null,
        translatedTitle: undefined,
        translatedSubtitle: undefined,
        paragraphIds: [],
        paragraphById: {},
        translatedCount: 0,
      });
      return;
    }

    const ids: string[] = [];
    const byId: Record<string, Paragraph> = {};
    let count = 0;

    for (const p of content.paragraphs) {
      ids.push(p.id);
      byId[p.id] = p;
      if (p.translated) count++;
    }

    set({
      chapter: {
        site: content.site,
        novelId: content.novel_id,
        novelTitle: content.novel_title ?? null,
        chapterNumber: content.chapter_number ?? 0,
        title: content.title,
        subtitle: content.subtitle,
        prevUrl: content.prev_url,
        nextUrl: content.next_url,
        sourceUrl: content.source_url,
      },
      translatedTitle: content.translatedTitle,
      translatedSubtitle: content.translatedSubtitle,
      paragraphIds: ids,
      paragraphById: byId,
      translatedCount: count,
    });
  },

  updateTitleTranslation: (title, subtitle) =>
    set(() => ({
      ...(title !== undefined && { translatedTitle: title }),
      ...(subtitle !== undefined && { translatedSubtitle: subtitle }),
    })),

  updateParagraphTranslation: (id, text) =>
    set((s) => {
      const prev = s.paragraphById[id];
      if (!prev) return {};

      const wasTranslated = Boolean(prev.translated);
      const isNowTranslated = text.trim() !== '';

      return {
        paragraphById: {
          ...s.paragraphById,
          [id]: { ...prev, translated: text },
        },
        translatedCount: wasTranslated === isNowTranslated
          ? s.translatedCount
          : s.translatedCount + (isNowTranslated ? 1 : -1),
      };
    }),

  updateAllTranslations: (translations) =>
    set((state) => {
      const ids = state.paragraphIds;
      const newById = { ...state.paragraphById };
      let count = 0;

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const translated = translations[i] || newById[id]?.translated;
        if (newById[id]) {
          newById[id] = { ...newById[id], translated };
          if (translated) count++;
        }
      }

      return { paragraphById: newById, translatedCount: count };
    }),

  getChapterContent: () => {
    const state = get();
    if (!state.chapter) return null;

    const paragraphs = state.paragraphIds.map((id) => state.paragraphById[id]);

    return {
      site: state.chapter.site,
      novel_id: state.chapter.novelId,
      novel_title: state.chapter.novelTitle,
      chapter_number: state.chapter.chapterNumber,
      title: state.chapter.title,
      subtitle: state.chapter.subtitle,
      translatedTitle: state.translatedTitle,
      translatedSubtitle: state.translatedSubtitle,
      paragraphs,
      prev_url: state.chapter.prevUrl,
      next_url: state.chapter.nextUrl,
      source_url: state.chapter.sourceUrl,
    };
  },
}));
