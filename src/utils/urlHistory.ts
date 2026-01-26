const MAX_HISTORY = 5;

export interface UrlHistoryItem {
  url: string;
  novelTitle?: string;
  chapterNumber?: number;
  title?: string;
}

export const getUrlHistory = (key: string): UrlHistoryItem[] => {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    // Migration: convert old string[] format to new object format
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
      return parsed.map((url: string) => ({ url }));
    }
    return parsed;
  } catch {
    return [];
  }
};

export const saveUrlHistory = (key: string, url: string, meta?: { novelTitle?: string; chapterNumber?: number; title?: string }) => {
  const history = getUrlHistory(key).filter(item => item.url !== url);
  history.unshift({ url, ...meta });
  localStorage.setItem(key, JSON.stringify(history.slice(0, MAX_HISTORY)));
};
