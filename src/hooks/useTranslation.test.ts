import { describe, expect, it } from 'vitest';
import {
  filterNewProperNounEntries,
  mergeCharacterDictionaryEntries,
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
