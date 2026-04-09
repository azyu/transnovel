export type TabType = 'translation' | 'series' | 'settings';

export interface WatchlistItem {
  site: string;
  workUrl: string;
  novelId: string;
  title: string;
  author: string | null;
  lastKnownChapter: number;
  lastCheckedAt: string | null;
  lastCheckStatus: string;
  lastCheckError: string | null;
  newEpisodeCount: number;
}

export interface WatchlistEpisode {
  chapterNumber: number;
  chapterUrl: string;
  title: string | null;
  isNew: boolean;
  isViewed: boolean;
}

export interface WatchlistViewedUpdate {
  site: string;
  novelId: string;
  chapterNumber: number;
  clearedNewFlag: boolean;
  remainingNewEpisodeCount: number;
}

export interface NovelMetadata {
  site: string;
  novel_id: string;
  title: string;
  author: string;
  total_chapters: number;
}

export interface Chapter {
  number: number;
  title: string;
  url: string;
  status?: 'pending' | 'completed';
}

export interface Paragraph {
  id: string;
  original: string;
  translated?: string;
}

export interface CharacterDictionaryEntry {
  source_text: string;
  reading?: string | null;
  target_name: string;
  note?: string | null;
}

export interface CharacterDictionaryReview {
  site: string;
  novel_id: string;
  chapter_number: number;
  entries: CharacterDictionaryEntry[];
}

export interface ChapterContent {
  site: string;
  novel_id: string;
  chapter_number: number;
  title: string;
  subtitle: string;
  paragraphs: string[];
  prev_url: string | null;
  next_url: string | null;
  novel_title: string | null;
}

export interface ApiKey {
  id: number;
  key_type: 'gemini' | 'openrouter';
  api_key: string;
  is_active: boolean;
}

export interface TranslationProgress {
  current_chapter: number;
  total_chapters: number;
  chapter_title: string;
  status: 'pending' | 'translating' | 'completed' | 'error' | 'paused';
  error_message?: string;
}

export interface ExportOptions {
  format: 'TxtSingle' | 'TxtChapters' | 'Html' | 'Epub';
  include_original: boolean;
  include_notes: boolean;
  output_dir?: string;
}

export interface ExportParagraph {
  original: string;
  translated: string | null;
}

export interface ExportChapter {
  number: number;
  title: string;
  paragraphs: ExportParagraph[];
}

export interface ExportRequest {
  novel_id: string;
  novel_title: string;
  chapters: ExportChapter[];
  options: ExportOptions;
}

export interface TranslationChunk {
  paragraph_id: string;
  text: string;
  is_complete: boolean;
}

export interface ApiLogSummary {
  id: string;
  timestamp: number;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  model?: string;
  provider: string;
  protocol: string;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

export interface ApiLogEntry extends ApiLogSummary {
  requestBody?: string;
  responseBody?: string;
}
