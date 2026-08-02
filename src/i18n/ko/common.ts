export const commonMessages = {
  actions: {
    load: '불러오기',
    refresh: '새로고침',
    save: '저장',
  },
  placeholders: {
    url: 'https://',
  },
  tabs: {
    translation: '번역',
    series: '관심작품',
    settings: '설정',
    main: '메인 탭',
    language: '언어',
  },
  accessibility: {
    loading: '불러오는 중',
    decrement: (label?: string) => label ? `${label} 감소` : '감소',
    increment: (label?: string) => label ? `${label} 증가` : '증가',
  },
} as const;
