export type TabType = 'translation' | 'series' | 'settings';

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
}

export interface Paragraph {
  id: string;
  original: string;
  translated?: string;
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
}

export interface ApiKey {
  id: number;
  key_type: 'gemini' | 'antigravity';
  api_key: string;
  is_active: boolean;
}

export interface Setting {
  key: string;
  value: string;
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

export interface TranslationChunk {
  paragraph_id: string;
  text: string;
  is_complete: boolean;
}
