export const translationMessages = {
  addToWatchlist: '관심작품에 추가',
  dictionary: {
    open: '사용자 정의 사전',
    loading: '사전 불러오는 중...',
    loadFailed: '사전 불러오기 실패',
    saveFailed: '사전 저장 실패',
    saveSuccess: '사용자 정의 고유명사 사전을 저장했습니다.',
    missingTarget: '저장할 작품 정보를 확인할 수 없습니다.',
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
  },
  llmConfig: {
    requiredTitle: 'LLM 설정 필요',
    requiredDescription: 'API 서비스 제공자를 등록 후 모델을 선택해주세요.',
  },
} as const;
