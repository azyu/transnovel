import { create } from 'zustand';
import type { TabType, NovelMetadata, Chapter, Paragraph, TranslationProgress } from '../types';

interface AppState {
  currentTab: TabType;
  setTab: (tab: TabType) => void;

  currentUrl: string;
  setUrl: (url: string) => void;
  chapterContent: {
    site: string;
    novel_id: string;
    title: string;
    subtitle: string;
    paragraphs: Paragraph[];
  } | null;
  setChapterContent: (content: { site: string; novel_id: string; title: string; subtitle: string; paragraphs: Paragraph[] } | null) => void;
  updateParagraphTranslation: (id: string, text: string) => void;
  isTranslating: boolean;
  setIsTranslating: (isTranslating: boolean) => void;

  novelMetadata: NovelMetadata | null;
  setNovelMetadata: (metadata: NovelMetadata | null) => void;
  chapterList: Chapter[];
  setChapterList: (chapters: Chapter[]) => void;
  batchProgress: TranslationProgress | null;
  setBatchProgress: (progress: TranslationProgress | null) => void;
  updateBatchProgress: (update: Partial<TranslationProgress>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentTab: 'translation',
  setTab: (tab) => set({ currentTab: tab }),

  currentUrl: '',
  setUrl: (url) => set({ currentUrl: url }),
  chapterContent: null,
  setChapterContent: (content) => set({ chapterContent: content }),
  updateParagraphTranslation: (id, text) =>
    set((state) => {
      if (!state.chapterContent) return {};
      const newParagraphs = state.chapterContent.paragraphs.map((p) =>
        p.id === id ? { ...p, translated: text } : p
      );
      return { chapterContent: { ...state.chapterContent, paragraphs: newParagraphs } };
    }),
  isTranslating: false,
  setIsTranslating: (isTranslating) => set({ isTranslating }),

  novelMetadata: null,
  setNovelMetadata: (metadata) => set({ novelMetadata: metadata }),
  chapterList: [],
  setChapterList: (chapters) => set({ chapterList: chapters }),
  batchProgress: null,
  setBatchProgress: (progress) => set({ batchProgress: progress }),
  updateBatchProgress: (update) =>
    set((state) => ({
      batchProgress: state.batchProgress ? { ...state.batchProgress, ...update } : null,
    })),
}));
