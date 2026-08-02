import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTranslation } from './useTranslation';
import { useSeriesStore } from '../stores/seriesStore';
import { useTranslationStore } from '../stores/translationStore';
import { useUpdateStore } from '../stores/updateStore';
import type { TranslationProgress } from '../types';
import {
  applyTranslationChunkToReviewContent,
  buildCharacterDictionaryReviewTexts,
  createCharacterDictionaryReviewContent,
  filterNewProperNounEntries,
  isUpdateInstallationActive,
  markViewedChapter,
  mergeCharacterDictionaryEntries,
  resolveCharacterDictionaryTarget,
} from './useTranslation';

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(async (command: string) => {
    if (command === 'parse_chapter') {
      return {
        site: 'syosetu',
        novel_id: 'n1234',
        chapter_number: 2,
        content_hash: 'content-hash-2',
        title: '제2화',
        subtitle: '',
        paragraphs: ['본문'],
        prev_url: null,
        next_url: null,
        novel_title: '작품',
      };
    }

    if (command === 'get_chapter_list') {
      return {
        chapters: [{ number: 2, title: '제2화', url: 'https://example.com/2' }],
      };
    }

    return null;
  }),
  listenMock: vi.fn(async () => vi.fn()),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock,
}));

let container: HTMLDivElement;
let root: Root;
type ParseAndTranslate = (url: string) => Promise<void>;
type RetryFailedParagraphs = () => Promise<void>;

let parseAndTranslate: ParseAndTranslate | null = null;
let retryFailedParagraphs: RetryFailedParagraphs | null = null;
let batchProgressWhenInteractive: TranslationProgress | null | 'not-observed';
let unsubscribeTranslationState: (() => void) | null = null;

function TranslationHarness() {
  const {
    parseAndTranslate: runParseAndTranslate,
    retryFailedParagraphs: runRetryFailedParagraphs,
  } = useTranslation();

  useEffect(() => {
    parseAndTranslate = runParseAndTranslate;
    retryFailedParagraphs = runRetryFailedParagraphs;
  }, [runParseAndTranslate, runRetryFailedParagraphs]);

  return null;
}

describe('useTranslation interactive flow', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    batchProgressWhenInteractive = 'not-observed';
    parseAndTranslate = null;
    retryFailedParagraphs = null;

    useUpdateStore.setState({ status: 'idle' });
    useTranslationStore.setState({ isTranslating: false });
    useSeriesStore.setState({
      batchProgress: {
        current_chapter: 2,
        total_chapters: 2,
        chapter_title: '제2화',
        status: 'completed',
      },
    });

    unsubscribeTranslationState = useTranslationStore.subscribe((state) => {
      if (state.isTranslating && batchProgressWhenInteractive === 'not-observed') {
        batchProgressWhenInteractive = useSeriesStore.getState().batchProgress;
      }
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    unsubscribeTranslationState?.();
    unsubscribeTranslationState = null;
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it('clears completed batch state before interactive translation becomes active', async () => {
    await act(async () => {
      root.render(createElement(TranslationHarness));
    });

    expect(parseAndTranslate).not.toBeNull();

    await act(async () => {
      await parseAndTranslate?.('https://example.com/2');
    });

    expect(batchProgressWhenInteractive).toBeNull();
    expect(useSeriesStore.getState().batchProgress).toBeNull();
    expect(useTranslationStore.getState().isTranslating).toBe(true);
  });

  it('clears completed batch state before an interactive retry becomes active', async () => {
    useTranslationStore.getState().setChapterContent({
      site: 'syosetu',
      novel_id: 'n1234',
      novel_title: '작품',
      chapter_number: 2,
      content_hash: 'content-hash-2',
      title: '제2화',
      subtitle: '',
      paragraphs: [{ id: 'p-1', original: '본문', isSpacer: false }],
      prev_url: null,
      next_url: null,
      source_url: 'https://example.com/2',
    });
    useTranslationStore.getState().setFailedParagraphIndices([1]);

    await act(async () => {
      root.render(createElement(TranslationHarness));
    });

    expect(retryFailedParagraphs).not.toBeNull();

    await act(async () => {
      await retryFailedParagraphs?.();
    });

    expect(batchProgressWhenInteractive).toBeNull();
    expect(useSeriesStore.getState().batchProgress).toBeNull();
    expect(useTranslationStore.getState().isTranslating).toBe(true);
  });
});

describe('filterNewProperNounEntries', () => {
  it('filters out entries that already exist in the saved dictionary', () => {
    const result = filterNewProperNounEntries(
      [
        {
          source_text: '鳳黎院学園',
          reading: 'ほうれいいん',
          target_name: '호레이인 학원',
          note: '학교',
        },
      ],
      [
        {
          source_text: '鳳黎院学園',
          reading: 'ほうれいいん',
          target_name: '호레이인 학원',
          note: '학교',
        },
        {
          source_text: '生徒会',
          reading: undefined,
          target_name: '학생회',
          note: '조직',
        },
      ],
    );

    expect(result).toEqual([]);
  });

  it('deduplicates repeated candidates from the same chapter', () => {
    const result = filterNewProperNounEntries(
      [],
      [
        {
          source_text: '鳳黎院学園',
          reading: 'ほうれいいん',
          target_name: '호레이인 학원',
          note: '학교',
        },
        {
          source_text: '鳳黎院学園',
          reading: 'ほうれいいん',
          target_name: '호레이인 학원',
          note: '반복',
        },
      ],
    );

    expect(result).toHaveLength(1);
    expect(result[0].source_text).toBe('鳳黎院学園');
  });

  it('ignores entries without reading information', () => {
    const result = filterNewProperNounEntries(
      [],
      [
        {
          source_text: '鳳黎院学園',
          reading: 'ほうれいいん',
          target_name: '호레이인 학원',
          note: '학교',
        },
        {
          source_text: '剣術',
          reading: undefined,
          target_name: '검술',
          note: '일반 명사',
        },
      ],
    );

    expect(result).toEqual([
      {
        source_text: '鳳黎院学園',
        reading: 'ほうれいいん',
        target_name: '호레이인 학원',
        note: '학교',
      },
    ]);
  });
});

describe('mergeCharacterDictionaryEntries', () => {
  it('preserves existing dictionary entries when adding review candidates', () => {
    const result = mergeCharacterDictionaryEntries(
      [
        {
          source_text: '周',
          reading: 'あまね',
          target_name: '아마네',
          note: '주인공',
        },
      ],
      [
        {
          source_text: '鳳黎院学園',
          reading: 'ほうれいいん',
          target_name: '호레이인 학원',
          note: '학교',
        },
      ],
    );

    expect(result).toEqual([
      {
        source_text: '周',
        reading: 'あまね',
        target_name: '아마네',
        note: '주인공',
      },
      {
        source_text: '鳳黎院学園',
        reading: 'ほうれいいん',
        target_name: '호레이인 학원',
        note: '학교',
      },
    ]);
  });

  it('prefers reviewed candidates when they replace an existing key', () => {
    const result = mergeCharacterDictionaryEntries(
      [
        {
          source_text: '周',
          reading: 'あまね',
          target_name: '기존 이름',
          note: '이전 메모',
        },
      ],
      [
        {
          source_text: '周',
          reading: 'あまね',
          target_name: '아마네',
          note: '주인공',
        },
      ],
    );

    expect(result).toEqual([
      {
        source_text: '周',
        reading: 'あまね',
        target_name: '아마네',
        note: '주인공',
      },
    ]);
  });
});

describe('createCharacterDictionaryReviewContent', () => {
  it('captures translated chunks against the completed chapter snapshot', () => {
    const reviewContent = createCharacterDictionaryReviewContent({
      site: 'syosetu',
      novel_id: 'n1234',
      chapter_number: 7,
      content_hash: 'test-content-hash',
      title: '原題',
      subtitle: '副題',
      paragraphs: ['一段落', '二段落'],
      prev_url: null,
      next_url: null,
      novel_title: null,
    });

    applyTranslationChunkToReviewContent(reviewContent, {
      paragraph_id: 'title',
      text: '번역 제목',
      is_complete: true,
    });
    applyTranslationChunkToReviewContent(reviewContent, {
      paragraph_id: 'subtitle',
      text: '번역 부제',
      is_complete: true,
    });
    applyTranslationChunkToReviewContent(reviewContent, {
      paragraph_id: 'p-2',
      text: '둘째 문단 번역',
      is_complete: true,
    });

    expect(buildCharacterDictionaryReviewTexts(reviewContent)).toEqual({
      originals: ['原題', '副題', '一段落', '二段落'],
      translateds: ['번역 제목', '번역 부제', '', '둘째 문단 번역'],
    });
  });
});

describe('resolveCharacterDictionaryTarget', () => {
  it('uses the pending review target instead of the current chapter in review mode', () => {
    expect(
      resolveCharacterDictionaryTarget(
        'review',
        { site: 'kakuyomu', novelId: 'current-work' },
        { site: 'syosetu', novel_id: 'review-work', chapter_number: 3, entries: [] },
      ),
    ).toEqual({
      site: 'syosetu',
      novelId: 'review-work',
    });
  });

  it('uses the current chapter in manual mode', () => {
    expect(
      resolveCharacterDictionaryTarget(
        'manual',
        { site: 'kakuyomu', novelId: 'current-work' },
        { site: 'syosetu', novel_id: 'review-work', chapter_number: 3, entries: [] },
      ),
    ).toEqual({
      site: 'kakuyomu',
      novelId: 'current-work',
    });
  });
});

describe('markViewedChapter', () => {
  it('returns the backend view update only when chapter number is present', async () => {
    const invokeMock = vi.fn(async () => ({
      site: 'kakuyomu',
      novelId: 'review-work',
      chapterNumber: 3,
      remainingNewEpisodeCount: 1,
    }));

    const update = await markViewedChapter(invokeMock as never, 'kakuyomu', 'review-work', 3);
    const skipped = await markViewedChapter(invokeMock as never, 'kakuyomu', 'review-work', 0);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('mark_episode_viewed', {
      site: 'kakuyomu',
      novelId: 'review-work',
      chapterNumber: 3,
    });
    expect(update).toEqual({
      site: 'kakuyomu',
      novelId: 'review-work',
      chapterNumber: 3,
      remainingNewEpisodeCount: 1,
    });
    expect(skipped).toBeNull();
  });
});

describe('isUpdateInstallationActive', () => {
  it('blocks translation only while an update is being downloaded or installed', () => {
    expect(isUpdateInstallationActive('available')).toBe(false);
    expect(isUpdateInstallationActive('downloading')).toBe(true);
    expect(isUpdateInstallationActive('installing')).toBe(true);
    expect(isUpdateInstallationActive('error')).toBe(false);
  });
});
