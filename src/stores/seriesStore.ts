import { create } from 'zustand';
import type { NovelMetadata, Chapter, TranslationProgress } from '../types';

interface SeriesState {
  novelMetadata: NovelMetadata | null;
  setNovelMetadata: (metadata: NovelMetadata | null) => void;

  chapterList: Chapter[];
  setChapterList: (chapters: Chapter[]) => void;
  updateChapterStatus: (chapterNum: number, status: 'pending' | 'completed') => void;

  batchProgress: TranslationProgress | null;
  setBatchProgress: (progress: TranslationProgress | null) => void;
  updateBatchProgress: (update: Partial<TranslationProgress>) => void;
}

export const useSeriesStore = create<SeriesState>((set) => ({
  novelMetadata: null,
  setNovelMetadata: (metadata) => set({ novelMetadata: metadata }),

  chapterList: [],
  setChapterList: (chapters) => set({ chapterList: chapters }),
  updateChapterStatus: (chapterNum, status) =>
    set((state) => ({
      chapterList: state.chapterList.map((ch) =>
        ch.number === chapterNum ? { ...ch, status } : ch
      ),
    })),

  batchProgress: null,
  setBatchProgress: (progress) => set({ batchProgress: progress }),
  updateBatchProgress: (update) =>
    set((state) => ({
      batchProgress: state.batchProgress ? { ...state.batchProgress, ...update } : null,
    })),
}));
