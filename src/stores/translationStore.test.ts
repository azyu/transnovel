import { describe, it, expect, beforeEach } from 'vitest';
import { useTranslationStore } from './translationStore';

describe('useTranslationStore', () => {
  beforeEach(() => {
    useTranslationStore.setState({
      currentUrl: '',
      chapter: null,
      translatedTitle: undefined,
      translatedSubtitle: undefined,
      paragraphIds: [],
      paragraphById: {},
      translatedCount: 0,
      isTranslating: false,
      failedParagraphIndices: [],
    });
  });

  describe('setChapterContent', () => {
    it('should set chapter content and calculate translatedCount', () => {
      const { setChapterContent } = useTranslationStore.getState();
      
      setChapterContent({
        site: 'syosetu',
        novel_id: 'n123',
        title: 'タイトル',
        subtitle: 'サブタイトル',
        paragraphs: [
          { id: 'p-1', original: 'テスト1', translated: '번역1' },
          { id: 'p-2', original: 'テスト2' },
        ],
        prev_url: null,
        next_url: 'https://example.com/2',
        source_url: 'https://example.com/1',
      });

      const state = useTranslationStore.getState();
      expect(state.translatedCount).toBe(1);
      expect(state.paragraphIds).toEqual(['p-1', 'p-2']);
      expect(state.chapter?.novelId).toBe('n123');
      expect(state.chapter?.title).toBe('タイトル');
    });

    it('should clear state when content is null', () => {
      const { setChapterContent } = useTranslationStore.getState();
      
      setChapterContent({
        site: 'syosetu',
        novel_id: 'n123',
        title: 'タイトル',
        subtitle: '',
        paragraphs: [{ id: 'p-1', original: 'テスト1' }],
        prev_url: null,
        next_url: null,
        source_url: 'https://example.com/1',
      });
      
      setChapterContent(null);

      const state = useTranslationStore.getState();
      expect(state.chapter).toBeNull();
      expect(state.paragraphIds).toEqual([]);
      expect(state.translatedCount).toBe(0);
    });
  });

  describe('updateParagraphTranslation', () => {
    beforeEach(() => {
      useTranslationStore.getState().setChapterContent({
        site: 'syosetu',
        novel_id: 'n123',
        title: 'タイトル',
        subtitle: '',
        paragraphs: [
          { id: 'p-1', original: 'テスト1' },
          { id: 'p-2', original: 'テスト2' },
        ],
        prev_url: null,
        next_url: null,
        source_url: 'https://example.com/1',
      });
    });

    it('should update paragraph and increment count', () => {
      const { updateParagraphTranslation } = useTranslationStore.getState();
      
      updateParagraphTranslation('p-1', '번역1');

      const state = useTranslationStore.getState();
      expect(state.paragraphById['p-1'].translated).toBe('번역1');
      expect(state.translatedCount).toBe(1);
    });

    it('should decrement count when translation is cleared', () => {
      const { updateParagraphTranslation } = useTranslationStore.getState();
      
      updateParagraphTranslation('p-1', '번역1');
      expect(useTranslationStore.getState().translatedCount).toBe(1);
      
      updateParagraphTranslation('p-1', '');
      expect(useTranslationStore.getState().translatedCount).toBe(0);
    });

    it('should not change count when updating already translated paragraph', () => {
      const { updateParagraphTranslation } = useTranslationStore.getState();
      
      updateParagraphTranslation('p-1', '번역1');
      updateParagraphTranslation('p-1', '수정된 번역1');

      expect(useTranslationStore.getState().translatedCount).toBe(1);
    });

    it('should do nothing for non-existent paragraph', () => {
      const { updateParagraphTranslation } = useTranslationStore.getState();
      const beforeState = useTranslationStore.getState();
      
      updateParagraphTranslation('non-existent', '번역');

      const afterState = useTranslationStore.getState();
      expect(afterState.translatedCount).toBe(beforeState.translatedCount);
    });
  });

  describe('updateTitleTranslation', () => {
    beforeEach(() => {
      useTranslationStore.getState().setChapterContent({
        site: 'syosetu',
        novel_id: 'n123',
        title: 'タイトル',
        subtitle: 'サブタイトル',
        paragraphs: [],
        prev_url: null,
        next_url: null,
        source_url: 'https://example.com/1',
      });
    });

    it('should update title translation', () => {
      const { updateTitleTranslation } = useTranslationStore.getState();
      
      updateTitleTranslation('번역된 제목', undefined);

      expect(useTranslationStore.getState().translatedTitle).toBe('번역된 제목');
      expect(useTranslationStore.getState().translatedSubtitle).toBeUndefined();
    });

    it('should update subtitle translation', () => {
      const { updateTitleTranslation } = useTranslationStore.getState();
      
      updateTitleTranslation(undefined, '번역된 부제목');

      expect(useTranslationStore.getState().translatedTitle).toBeUndefined();
      expect(useTranslationStore.getState().translatedSubtitle).toBe('번역된 부제목');
    });

    it('should update both title and subtitle', () => {
      const { updateTitleTranslation } = useTranslationStore.getState();
      
      updateTitleTranslation('번역된 제목', '번역된 부제목');

      expect(useTranslationStore.getState().translatedTitle).toBe('번역된 제목');
      expect(useTranslationStore.getState().translatedSubtitle).toBe('번역된 부제목');
    });
  });

  describe('failedParagraphIndices', () => {
    it('should set and clear failed indices', () => {
      const { setFailedParagraphIndices, clearFailedParagraphIndices } = useTranslationStore.getState();
      
      setFailedParagraphIndices([1, 3, 5]);
      expect(useTranslationStore.getState().failedParagraphIndices).toEqual([1, 3, 5]);
      
      clearFailedParagraphIndices();
      expect(useTranslationStore.getState().failedParagraphIndices).toEqual([]);
    });
  });

  describe('getChapterContent', () => {
    it('should return null when no chapter is set', () => {
      const { getChapterContent } = useTranslationStore.getState();
      expect(getChapterContent()).toBeNull();
    });

    it('should return reconstructed chapter content', () => {
      const { setChapterContent, updateParagraphTranslation, updateTitleTranslation, getChapterContent } = useTranslationStore.getState();
      
      setChapterContent({
        site: 'syosetu',
        novel_id: 'n123',
        title: 'タイトル',
        subtitle: 'サブタイトル',
        paragraphs: [
          { id: 'p-1', original: 'テスト1' },
          { id: 'p-2', original: 'テスト2' },
        ],
        prev_url: 'https://example.com/prev',
        next_url: 'https://example.com/next',
        source_url: 'https://example.com/current',
      });
      
      updateTitleTranslation('번역 제목', '번역 부제목');
      updateParagraphTranslation('p-1', '번역1');

      const content = getChapterContent();
      
      expect(content).not.toBeNull();
      expect(content?.novel_id).toBe('n123');
      expect(content?.translatedTitle).toBe('번역 제목');
      expect(content?.translatedSubtitle).toBe('번역 부제목');
      expect(content?.paragraphs[0].translated).toBe('번역1');
      expect(content?.paragraphs[1].translated).toBeUndefined();
    });
  });
});
