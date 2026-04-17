export const translationMessages = {
  addToWatchlist: 'Add to watchlist',
  navigation: {
    prevChapter: 'Previous',
    nextChapter: 'Next',
  },
  dictionary: {
    open: 'Custom dictionary',
    loading: 'Loading dictionary...',
    loadFailed: 'Failed to load dictionary',
    saveFailed: 'Failed to save dictionary',
    saveSuccess: 'Saved the custom proper noun dictionary.',
    missingTarget: 'Unable to determine which work to save.',
    reviewTitle: 'Review proper noun candidates',
    reviewDescription:
      'These are newly extracted proper noun candidates from this chapter. If you save them, they will be applied automatically to future translations of this work.',
    manualTitle: 'Custom proper noun dictionary',
    manualDescription:
      'Edit the proper noun dictionary registered for the current work. Saving will clear the existing translation cache.',
    reviewSaveLabel: 'Save candidates',
    manualSaveLabel: 'Save dictionary',
  },
  watchlist: {
    addFailed: 'Failed to add to watchlist',
    unsupportedSite: 'Only Syosetu, Novel18, and Kakuyomu works can currently be added to the watchlist.',
    buildUrlFailed: 'Failed to build the watchlist URL.',
  },
  translation: {
    stop: 'Stop translation',
    stopFailed: 'Failed to stop translation',
    completeFromCache: 'Translation completed. (Loaded from cache)',
    completeWithTokens: (input: string, output: string) =>
      `Translation completed. (input=${input}, output=${output})`,
    partialFailure: (count: number) =>
      `${count} items failed to translate. You can retry them with the retry button.`,
    batchFailed: 'Batch translation failed',
    pauseFailed: 'Failed to pause translation',
    retry: 'Retry',
    retrying: 'Retrying...',
    failedItems: (count: number) => `${count} failed items`,
  },
  urlInput: {
    label: 'Novel URL',
    supportedSites: 'Supported sites',
    supportedSiteLinks: [
      { name: 'syosetu.com', url: 'https://syosetu.com' },
      { name: 'novel18.syosetu.com', url: 'https://novel18.syosetu.com' },
      { name: 'syosetu.org (Hameln)', url: 'https://syosetu.org' },
      { name: 'kakuyomu.jp', url: 'https://kakuyomu.jp' },
    ],
    emptyState: 'Enter the novel URL you want to translate and load it.',
    historyChapterLabel: (chapterNumber: number) => `Episode ${chapterNumber}`,
  },
  paragraphList: {
    pending: 'Waiting for translation...',
  },
  llmConfig: {
    requiredTitle: 'LLM setup required',
    requiredDescription: 'Register a provider and select a model first.',
  },
  saveModal: {
    title: 'Save translation',
    cancel: 'Cancel',
    save: 'Save',
    formatLabel: 'Save format',
    includeOriginal: {
      label: 'Include original text',
      description: 'Save the Japanese original together with the translation',
    },
    formats: {
      txt: {
        label: 'Text (.txt)',
        description: 'Plain text format',
      },
      html: {
        label: 'HTML (.html)',
        description: 'Open in a web browser, supports ruby text',
      },
    },
  },
  saveResult: {
    successTitle: 'Saved',
    successMessage: (path: string) => `Saved: ${path}`,
    failureTitle: 'Error',
    failureMessage: (detail: string) => `Save failed: ${detail}`,
  },
  dictionaryModal: {
    actions: {
      cancel: 'Cancel',
      remove: 'Delete',
      addEntry: 'Add entry',
    },
    fields: {
      sourceText: {
        label: 'Original',
        placeholder: '鳳黎院学園',
      },
      reading: {
        label: 'Reading',
        placeholder: 'ほうれいいん',
      },
      targetName: {
        label: 'Translation',
        placeholder: 'Horeiin Academy',
      },
      note: {
        label: 'Note',
        placeholder: 'Main character',
      },
    },
  },
} as const;
