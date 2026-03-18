import { describe, expect, it } from 'vitest';
import {
  applyTranslationChunkToReviewContent,
  buildCharacterDictionaryReviewTexts,
  createCharacterDictionaryReviewContent,
  filterNewProperNounEntries,
  mergeCharacterDictionaryEntries,
  resolveCharacterDictionaryTarget,
} from './useTranslation';

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
