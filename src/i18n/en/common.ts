export const commonMessages = {
  actions: {
    load: 'Load',
    refresh: 'Refresh',
    save: 'Save',
  },
  placeholders: {
    url: 'https://',
  },
  tabs: {
    translation: 'Translation',
    series: 'Watchlist',
    settings: 'Settings',
    main: 'Main tabs',
    language: 'Language',
  },
  accessibility: {
    loading: 'Loading',
    decrement: (label?: string) => label ? `${label} decrease` : 'Decrease',
    increment: (label?: string) => label ? `${label} increase` : 'Increase',
  },
} as const;
