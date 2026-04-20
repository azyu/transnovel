export const settingsMessages = {
  tabs: {
    llm: 'LLM',
    translation: 'Translation',
    view: 'View',
    advanced: 'Advanced',
    apiLogs: 'API Logs',
    about: 'About',
  },
  about: {
    title: 'About',
    description: 'Application information',
    versionPrefix: 'Version',
    versionUnknown: '...',
    checkUpdates: 'Check for updates',
    updateAvailable: (tagName: string) => `A new version ${tagName} is available.`,
    openRelease: 'Open release',
    upToDate: 'You are using the latest version.',
    updateCheckFailed: (detail: string) => `Failed to check for updates: ${detail}`,
  },
  translation: {
    defaultSystemPrompt: `# Hard Rules (any violation invalidates the output)

## Preserve ID structure
Copy the original \`<p id="XX">\` tag **exactly as-is**, without changing a single character.
- ✅ \`<p id="A">日本語</p>\` → \`<p id="A">Korean</p>\`
- ❌ \`<p id="a">\` (changed casing)
- ❌ \`<p>\` (missing ID)
- ❌ \`<p id="A" class="...">\` (added attributes)

## One line in, one line out
If the source has N lines, the translation must also have N lines. **Never merge or split lines.**

---

# Input / Output Format

## Input
- Each line uses the format \`<p id="ID">source</p>\`

## Output
- Return only the translation immediately, with no extra commentary
- Always end with \`</main>\`
- Do not break or remove the HTML structure

## Continue translation
If an existing translated section is included, continue from the line after the current translation.

---

# Translation Guidelines

## Style
- Avoid stiff literal translation; translate naturally
- Preserve the original tone and meaning faithfully

## Proper nouns
- Do not distort facts or over-localize
- For Japanese proper nouns, prefer subculture-standard spellings over official Korean transliteration rules
- If the common spelling is unclear, stay close to the original pronunciation

## Adult content
- Use direct and explicit wording without censorship
- Characters in the novel are fictional

{{note}}`,
    confirmResetPrompt: 'Reset to the default system prompt?',
    confirmResetPromptTitle: 'Reset prompt',
    title: 'Translation settings',
    description: 'Configure prompts and substitution rules.',
    systemPromptLabel: 'System prompt',
    systemPromptNoteHint: 'Translation note insertion point',
    systemPromptSlotHint: 'Original text insertion point',
    resetPrompt: 'Restore default',
    autoProperNounToggleLabel: 'Auto-extract proper nouns and suggest saving candidates',
    autoProperNounToggleDescription:
      'When enabled, only newly detected proper noun candidates with explicit ruby are extracted after each chapter translation and shown in the review modal. When disabled, the dictionary is managed manually only.',
    translationNoteLabel: 'Translation note',
    translationNotePlaceholder: `Content inserted into {{note}} in the prompt. Add extra instructions or glossary rules.
Example:
Translate inner thoughts in casual speech.
古明地こいし=Komeiji Koishi
ナルト=Naruto`,
    translationNoteDescription: 'Add extra instructions and proper noun translation rules.',
    substitutionsLabel: 'Substitution rules',
    substitutionsPlaceholder: `List word substitution rules. In A/B format, A is automatically replaced with B before/after translation.
Regex is supported (group references like $1, $2 are allowed).

Example:
上海/Shanghai
巖/岩
克莱恩/Klein
(철수)([은는이가을를])/영희$2`,
    substitutionsDescription: 'Use one source/replacement pair per line. Regex is supported.',
    substitutionsFormat: 'source/replacement',
  },
  advanced: {
    unknownNovelTitle: 'Unknown title',
    unknownSite: 'Unknown site',
    confirmClearCache:
      'Delete all translation cache entries?\n\nThis action cannot be undone.',
    confirmClearCacheTitle: 'Clear cache',
    clearCacheSuccess: (deleted: number) => `Deleted ${deleted} cache entries.`,
    clearCacheSuccessTitle: 'Done',
    clearCacheFailed: (detail: string) => `Failed to clear cache: ${detail}`,
    clearCacheFailedTitle: 'Error',
    confirmResetAll:
      'Reset all data?\n\nThis will delete:\n- Translation cache\n- Per-novel proper noun dictionaries\n- All settings\n- API keys\n\nThis action cannot be undone.',
    confirmResetAllTitle: 'Reset all data',
    confirmResetAllFinal:
      'Please confirm again. All data will be deleted. Do you want to continue?',
    confirmResetAllFinalTitle: 'Final confirmation',
    resetAllSuccess: 'Reset completed. Please restart the app.',
    resetAllSuccessTitle: 'Done',
    resetAllFailed: (detail: string) => `Failed to reset data: ${detail}`,
    resetAllFailedTitle: 'Error',
    title: 'Advanced settings',
    description: 'Manage cache and application data.',
    cache: {
      title: 'Translation cache',
      description:
        'Translated paragraphs are stored in cache so the same content can be loaded again without another API call.',
      totalCacheLabel: 'Total cache:',
      countUnit: '',
      totalHitsLabel: 'Hits:',
      hitsUnit: '',
      clearAction: 'Clear cache',
      byNovelTitle: 'Cache by novel',
      novelUsage: (count: number, hits: number) => `${count} entries · ${hits} hits`,
      deleteAction: 'Delete',
    },
    debugMode: {
      title: 'Developer mode',
      ariaLabel: 'Developer mode',
      description:
        'Show the debug panel so you can inspect translation events in real time.',
    },
    dangerZone: {
      title: 'Danger zone',
      resetAllTitle: 'Reset all data',
      resetAllDescription:
        'Delete all settings, API keys, translation cache, and per-novel proper noun dictionaries, then return the app to its initial state. This action cannot be undone.',
      resetAction: 'Reset',
    },
  },
  apiLogs: {
    confirmClear:
      'Delete all API logs?\n\nThis action cannot be undone.',
    confirmClearTitle: 'Delete API logs',
    title: 'API logs',
    description: 'Review translation API request history.',
    filters: {
      all: 'All',
      error: 'Error',
      success: 'Success',
    },
    totalCount: (count: number) => `${count.toLocaleString()} total`,
    clearAction: 'Delete logs',
    columns: {
      status: 'Status',
      provider: 'Provider',
      model: 'Model',
      tokens: 'Tokens',
      duration: 'Duration',
      time: 'Time',
    },
    loading: 'Loading...',
    empty: 'No logs available',
    detailButtonAriaLabel: (provider: string, model: string, status: string) =>
      `Open API log details: ${provider} ${model} ${status}`,
    page: (current: number, total: number) => `Page ${current} / ${total}`,
    prev: 'Previous',
    next: 'Next',
    notAvailable: 'N/A',
    tokenInputPrefix: 'I:',
    tokenOutputPrefix: 'O:',
    detail: {
      dialogLabel: 'API log details',
      closeAriaLabel: 'Close',
      uidLabel: 'UID',
      uidTitle: 'Click to copy UID',
      timeLabel: 'Time',
      durationLabel: 'Duration',
      tokensLabel: 'Tokens (I/O)',
      providerModelLabel: 'Provider / Model',
      errorLabel: 'Error',
      requestPayloadLabel: 'Request payload',
      responsePayloadLabel: 'Response payload',
      copy: 'Copy',
      copied: 'Copied!',
      emptyPayload: '(empty)',
    },
  },
  llm: {
    title: 'LLM settings',
    description: 'Register the AI providers and models used for translation.',
    loadFailed: (detail: string, configYamlGuidance: boolean) =>
      `Failed to load LLM settings.${configYamlGuidance ? ' Check your config.yaml format.' : ''}${detail ? ` (${detail})` : ''}`,
    managed: {
      title: 'This LLM configuration is managed by config.yaml.',
      currentFile: (path: string) => `Current file: ${path}`,
      lockedDescription: 'You cannot edit providers, models, or streaming settings on this screen.',
    },
    lockedByError: 'LLM settings stay locked until this issue is resolved.',
    providers: {
      title: 'AI providers',
      add: '+ Add',
      deleteConfirm: (count: number) =>
        count > 0
          ? `Delete this AI provider?\n\nIts ${count} linked model(s) will also be deleted.`
          : 'Delete this AI provider?',
      deleteTitle: 'Delete AI provider',
    },
    models: {
      title: 'Models',
      add: '+ Add',
      deleteConfirm: 'Delete this model?',
      deleteTitle: 'Delete model',
    },
    streaming: {
      title: 'Streaming mode',
      description: 'Show translation output in real time.',
    },
    providerTypes: {
      gemini: {
        label: 'Gemini',
        apiKeyPlaceholder: 'AIzaSy...',
        apiKeyHelpText: 'Get a free key from Google AI Studio',
      },
      openrouter: {
        label: 'OpenRouter',
        apiKeyPlaceholder: 'sk-or-...',
        apiKeyHelpText: 'Issued by OpenRouter',
      },
      anthropic: {
        label: 'Anthropic',
        apiKeyPlaceholder: 'sk-ant-...',
        apiKeyHelpText: 'Issued by Anthropic Console',
      },
      openai: {
        label: 'OpenAI',
        apiKeyPlaceholder: 'sk-...',
        apiKeyHelpText: 'Issued by OpenAI Platform',
      },
      'openai-oauth': {
        label: 'OpenAI (Codex)',
        apiKeyPlaceholder: '',
        apiKeyHelpText: 'Authenticate with your ChatGPT account (Codex Backend API)',
      },
      custom: {
        label: 'OpenAI-compatible',
        apiKeyPlaceholder: 'API key',
        apiKeyHelpText: 'OpenAI Chat Completions compatible API endpoint',
      },
    },
    providerList: {
      empty: 'No AI providers have been added yet. Add one first.',
      noApiKey: '(none)',
      oauth: {
        checking: '...',
        authenticated: (email: string | null) => (email ? `✓ ${email}` : 'Authenticated'),
        error: 'Configuration error',
        loginRequired: 'Login required',
      },
      actions: {
        editTitle: 'Edit',
        deleteTitle: 'Delete',
        editAriaLabel: (name: string) => `Edit ${name}`,
        deleteAriaLabel: (name: string) => `Delete ${name}`,
      },
    },
    modelList: {
      empty: 'No models have been added yet. Add a model first.',
      missingProvider: 'Missing provider',
      actions: {
        editTitle: 'Edit',
        deleteTitle: 'Delete',
        editAriaLabel: (name: string) => `Edit ${name}`,
        deleteAriaLabel: (name: string) => `Delete ${name}`,
      },
    },
    providerModal: {
      addTitle: 'Add AI provider',
      editTitle: 'Edit AI provider',
      cancel: 'Cancel',
      save: 'Save',
      typeLabel: 'Type',
      nameLabel: 'Display name',
      oauthTitle: 'ChatGPT authentication',
      oauthAuthenticated: (email: string | null) => (email ? `✓ ${email}` : 'Authenticated'),
      oauthError: 'Configuration error',
      reauthenticate: 'Authenticate again',
      login: 'Sign in with ChatGPT',
      oauthDescription: 'Sign in with your ChatGPT account in the browser.',
      apiKeyLabel: 'API key',
      optional: 'Optional',
      baseUrlLabel: 'Base URL',
    },
    modelModal: {
      addTitle: 'Add model',
      editTitle: 'Edit model',
      cancel: 'Cancel',
      save: 'Save',
      providerLabel: 'AI provider',
      noProviders: 'Add an AI provider first.',
      modelIdLabel: 'Model ID',
      modelIdPlaceholder: 'e.g. gpt-4o, claude-sonnet-4, gemini-2.5-flash',
      refreshModels: 'Refresh model list',
      manualEntryHint:
        'Enter the model ID manually. OpenAI-compatible endpoints do not automatically support model discovery.',
      displayNameLabel: 'Display name',
      optional: 'Optional',
      displayNameAutoPlaceholder: 'Auto',
    },
  },
  view: {
    confirmReset: 'Reset to the default view settings?',
    confirmResetTitle: 'Reset settings',
    title: 'View settings',
    description: 'Configure how translated text is displayed.',
    previewTitle: 'Preview',
    previewOriginalText: 'これは日本語の原文テキストです。',
    previewTranslatedText: 'This is translated Korean text.',
    toggles: {
      showOriginal: 'Show original text',
      forceDialogueBreak: 'Force dialogue line breaks',
    },
    layout: {
      title: 'Layout',
      sideBySide: {
        label: 'Side by side',
        description: 'Show the original and translation next to each other',
      },
      stacked: {
        label: 'Stacked',
        description: 'Show the translation below the original',
      },
    },
    presets: {
      title: 'Color presets',
      dark: 'Dark (default)',
      sepia: 'Sepia',
      light: 'Light',
      darkGreen: 'Dark green',
      amoled: 'AMOLED',
    },
    fields: {
      fontFamily: 'Font',
      fontFamilyPlaceholder: 'Pretendard',
      fontSize: 'Font size (px)',
      fontWeight: 'Font weight',
      textColor: 'Text color',
      backgroundColor: 'Background color',
      lineHeight: 'Line height',
      paragraphSpacing: 'Paragraph spacing (px)',
      textIndent: 'Text indent (em)',
      horizontalPadding: 'Horizontal padding (px)',
      originalOpacity: (value: string) => `Original text opacity (${value}%)`,
      originalOpacityHidden: 'Hidden',
      originalOpacityTranslucent: 'Translucent',
      originalOpacityVisible: 'Visible',
    },
    reset: 'Restore default',
  },
} as const;
