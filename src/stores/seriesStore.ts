import { create } from 'zustand';
import type {
  NovelMetadata,
  Chapter,
  TranslationProgress,
  WatchlistEpisode,
  WatchlistItem,
} from '../types';

interface SeriesState {
  novelMetadata: NovelMetadata | null;
  setNovelMetadata: (metadata: NovelMetadata | null) => void;

  chapterList: Chapter[];
  setChapterList: (chapters: Chapter[]) => void;
  updateChapterStatus: (chapterNum: number, status: 'pending' | 'completed') => void;

  batchProgress: TranslationProgress | null;
  setBatchProgress: (progress: TranslationProgress | null) => void;
  updateBatchProgress: (update: Partial<TranslationProgress>) => void;

  watchlistItems: WatchlistItem[];
  setWatchlistItems: (items: WatchlistItem[]) => void;
  selectedWatchlistNovelId: string | null;
  setSelectedWatchlistNovelId: (novelId: string | null) => void;
  watchlistEpisodes: WatchlistEpisode[];
  setWatchlistEpisodes: (episodes: WatchlistEpisode[]) => void;
  markWatchlistEpisodeViewed: (chapterNumber: number) => void;
  isRefreshingWatchlist: boolean;
  setIsRefreshingWatchlist: (value: boolean) => void;
  watchlistLoaded: boolean;
  setWatchlistLoaded: (value: boolean) => void;
  watchlistError: string | null;
  setWatchlistError: (value: string | null) => void;
  watchlistBadgeCount: number;
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

  watchlistItems: [],
  setWatchlistItems: (items) =>
    set({
      watchlistItems: items,
      watchlistBadgeCount: items.filter((item) => item.newEpisodeCount > 0).length,
    }),
  selectedWatchlistNovelId: null,
  setSelectedWatchlistNovelId: (novelId) => set({ selectedWatchlistNovelId: novelId }),
  watchlistEpisodes: [],
  setWatchlistEpisodes: (episodes) => set({ watchlistEpisodes: episodes }),
  markWatchlistEpisodeViewed: (chapterNumber) =>
    set((state) => ({
      watchlistEpisodes: state.watchlistEpisodes.map((episode) =>
        episode.chapterNumber === chapterNumber
          ? { ...episode, isNew: false, isViewed: true }
          : episode
      ),
    })),
  isRefreshingWatchlist: false,
  setIsRefreshingWatchlist: (value) => set({ isRefreshingWatchlist: value }),
  watchlistLoaded: false,
  setWatchlistLoaded: (value) => set({ watchlistLoaded: value }),
  watchlistError: null,
  setWatchlistError: (value) => set({ watchlistError: value }),
  watchlistBadgeCount: 0,
}));
