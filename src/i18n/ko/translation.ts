export const translationMessages = {
  addToWatchlist: '관심작품에 추가',
  navigation: {
    prevChapter: '이전 화',
    nextChapter: '다음 화',
  },
  dictionary: {
    open: '사용자 정의 사전',
    loading: '사전 불러오는 중...',
    loadFailed: '사전 불러오기 실패',
    saveFailed: '사전 저장 실패',
    saveSuccess: '사용자 정의 고유명사 사전을 저장했습니다.',
    missingTarget: '저장할 작품 정보를 확인할 수 없습니다.',
    reviewTitle: '고유명사 사전 후보 확인',
    reviewDescription:
      '이번 화 번역에서 새로 추출된 고유명사 후보입니다. 저장하면 현재 작품의 이후 번역에 자동으로 적용됩니다.',
    manualTitle: '사용자 정의 고유명사 사전',
    manualDescription:
      '현재 작품에 등록된 고유명사 사전을 수정합니다. 저장 시 기존 번역 캐시는 초기화됩니다.',
    reviewSaveLabel: '후보 저장',
    manualSaveLabel: '사전 저장',
  },
  watchlist: {
    addFailed: '관심작품 추가 실패',
    unsupportedSite: '현재는 Syosetu, Novel18, Kakuyomu 작품만 관심작품에 추가할 수 있습니다.',
    buildUrlFailed: '관심작품 URL을 만들지 못했습니다.',
  },
  translation: {
    stop: '번역 중지',
    stopFailed: '번역 중지 실패',
    completeFromCache: '번역이 완료되었습니다. (캐시에서 로드됨)',
    completeWithTokens: (input: string, output: string) =>
      `번역이 완료되었습니다. (input=${input}, output=${output})`,
    partialFailure: (count: number) =>
      `${count}개 항목 번역에 실패했습니다. 재시도 버튼을 눌러 다시 시도할 수 있습니다.`,
    batchFailed: '일괄 번역 실패',
    pauseFailed: '번역 일시정지 실패',
    retry: '재시도',
    retrying: '재시도 중...',
    failedItems: (count: number) => `${count}개 항목 실패`,
  },
  urlInput: {
    label: '소설 URL 입력',
    supportedSites: '지원 사이트',
    supportedSiteLinks: [
      { name: 'syosetu.com', url: 'https://syosetu.com' },
      { name: 'novel18.syosetu.com', url: 'https://novel18.syosetu.com' },
      { name: 'syosetu.org (Hameln)', url: 'https://syosetu.org' },
      { name: 'kakuyomu.jp', url: 'https://kakuyomu.jp' },
    ],
    emptyState: '번역할 소설의 URL을 입력하고 불러오세요',
    historyChapterLabel: (chapterNumber: number) => `${chapterNumber}화`,
  },
  paragraphList: {
    pending: '번역 대기 중...',
  },
  llmConfig: {
    requiredTitle: 'LLM 설정 필요',
    requiredDescription: 'API 서비스 제공자를 등록 후 모델을 선택해주세요.',
  },
  saveModal: {
    title: '번역 저장',
    cancel: '취소',
    save: '저장',
    formatLabel: '저장 형식',
    includeOriginal: {
      label: '원문 포함',
      description: '번역문과 함께 일본어 원문을 저장합니다',
    },
    formats: {
      txt: {
        label: 'Text (.txt)',
        description: '단순 텍스트 형식',
      },
      html: {
        label: 'HTML (.html)',
        description: '웹 브라우저에서 열 수 있는 형식, 루비 텍스트 지원',
      },
    },
  },
  saveResult: {
    successTitle: '저장 완료',
    successMessage: (path: string) => `저장 완료: ${path}`,
    failureTitle: '오류',
    failureMessage: (detail: string) => `저장 실패: ${detail}`,
  },
  dictionaryModal: {
    actions: {
      cancel: '취소',
      remove: '삭제',
      addEntry: '항목 추가',
    },
    fields: {
      sourceText: {
        label: '원문 표기',
        placeholder: '鳳黎院学園',
      },
      reading: {
        label: '읽기',
        placeholder: 'ほうれいいん',
      },
      targetName: {
        label: '번역 표기',
        placeholder: '호레이인 학원',
      },
      note: {
        label: '메모',
        placeholder: '주인공',
      },
    },
  },
} as const;
