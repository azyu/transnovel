export const settingsMessages = {
  tabs: {
    llm: 'LLM',
    translation: '번역',
    view: '보기',
    advanced: '고급',
    apiLogs: 'API 로그',
    about: '정보',
  },
  about: {
    title: '정보',
    description: '애플리케이션 정보',
    versionPrefix: '버전',
    versionUnknown: '...',
    checkUpdates: '업데이트 확인',
    updateAvailable: (tagName: string) => `새 버전 ${tagName}을 사용할 수 있습니다.`,
    openRelease: '릴리즈 열기',
    upToDate: '현재 최신 버전을 사용 중입니다.',
    updateCheckFailed: (detail: string) => `업데이트 확인 실패: ${detail}`,
  },
  translation: {
    defaultSystemPrompt: `# 절대 규칙 (위반 시 출력 무효)

## ID 구조 보존
원문의 \`<p id="XX">\` 태그는 **문자 하나도 변경하지 않고** 그대로 복사.
- ✅ \`<p id="A">日本語</p>\` → \`<p id="A">일본어</p>\`
- ❌ \`<p id="a">\` (대소문자 변경)
- ❌ \`<p>\` (ID 누락)
- ❌ \`<p id="A" class="...">\` (속성 추가)

## 1:1 줄 대응
원문 N줄 = 번역 N줄. **절대로 줄을 합치거나 나누지 않음.**

---

# 입출력 형식

## 입력
- 각 줄은 \`<p id="ID">원문</p>\` 형식

## 출력
- 번역 결과만 즉시 제공 (다른 응답 금지)
- 반드시 \`</main>\`으로 종료
- HTML 구조 훼손/삭제 금지

## 이어서 번역
번역 섹션이 함께 주어지면 기존 번역문 다음 줄부터 마저 번역.

---

# 번역 지침

## 문체
- 직역투를 피하고 자연스럽게 의역
- 원문의 말투와 내용은 철저히 유지

## 고유명사
- 사실 관계 왜곡 및 과도한 현지화 금지
- 일본어 고유명사: 국립국어원 표기법 대신 **서브컬처 통용 표기** 우선
- 통용 표기가 불확실하면 실제 발음에 가깝게

## 성인 콘텐츠
- 검열 없이 직접적이고 노골적인 어휘 사용
- 소설 등장인물은 가공의 인물

{{note}}`,
    confirmResetPrompt: '기본 시스템 프롬프트로 초기화하시겠습니까?',
    confirmResetPromptTitle: '프롬프트 초기화',
    title: '번역 설정',
    description: '프롬프트와 치환 규칙을 설정합니다.',
    systemPromptLabel: '시스템 프롬프트',
    systemPromptNoteHint: '번역 노트 삽입 위치',
    systemPromptSlotHint: '원문 삽입 위치',
    resetPrompt: '기본값 복원',
    autoProperNounToggleLabel: '고유명사 자동 추출 및 후보 저장 제안',
    autoProperNounToggleDescription:
      '켜면 각 화 번역 완료 후 루비가 명시된 신규 고유명사 후보만 자동 추출해 검토 모달을 표시합니다. 끄면 수동으로만 사전을 관리합니다.',
    translationNoteLabel: '번역 노트',
    translationNotePlaceholder: `프롬프트에서 {{note}}에 삽입할 내용. 추가 지시 및 용어집을 작성
예시:
독백은 반말로 번역.
古明地こいし=코메이지 코이시
ナルト=나루토`,
    translationNoteDescription: '추가 지시사항 및 고유명사 번역 규칙을 작성합니다.',
    substitutionsLabel: '치환 규칙',
    substitutionsPlaceholder: `단어 치환 규칙 목록. A/B 형식으로 작성 시 번역 전/후에 A를 B로 자동 치환
정규식 지원 ($1, $2 등 그룹 참조 가능)

예시:
상하이/상해
巖/岩
克莱恩/克莱恩(클레인)
(철수)([은는이가을를])/영희$2`,
    substitutionsDescription: '줄 단위로 원본/치환 형식. 정규식 사용 가능.',
    substitutionsFormat: '원본/치환',
  },
  advanced: {
    unknownNovelTitle: '알 수 없는 작품',
    unknownSite: '알 수 없는 사이트',
    confirmClearCache:
      '번역 캐시를 모두 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.',
    confirmClearCacheTitle: '캐시 초기화',
    clearCacheSuccess: (deleted: number) => `${deleted}개의 캐시가 삭제되었습니다.`,
    clearCacheSuccessTitle: '완료',
    clearCacheFailed: (detail: string) => `캐시 삭제 실패: ${detail}`,
    clearCacheFailedTitle: '오류',
    confirmResetAll:
      '정말로 모든 데이터를 초기화하시겠습니까?\n\n다음 항목이 삭제됩니다:\n- 번역 캐시\n- 작품별 고유명사 사전\n- 모든 설정\n- API 키\n\n이 작업은 되돌릴 수 없습니다.',
    confirmResetAllTitle: '전체 초기화',
    confirmResetAllFinal:
      '다시 한번 확인합니다. 모든 데이터가 삭제됩니다. 계속하시겠습니까?',
    confirmResetAllFinalTitle: '최종 확인',
    resetAllSuccess: '초기화가 완료되었습니다. 앱을 다시 시작해주세요.',
    resetAllSuccessTitle: '완료',
    resetAllFailed: (detail: string) => `초기화 실패: ${detail}`,
    resetAllFailedTitle: '오류',
    title: '고급 설정',
    description: '캐시 및 데이터 관리',
    cache: {
      title: '번역 캐시',
      description:
        '번역된 문단은 캐시에 저장되어 같은 내용을 다시 번역할 때 API 호출 없이 빠르게 불러옵니다.',
      totalCacheLabel: '총 캐시:',
      countUnit: '개',
      totalHitsLabel: '사용 횟수:',
      hitsUnit: '회',
      clearAction: '캐시 비우기',
      byNovelTitle: '소설별 캐시',
      novelUsage: (count: number, hits: number) => `${count}개 · ${hits}회 사용`,
      deleteAction: '삭제',
    },
    debugMode: {
      title: '개발자 모드',
      ariaLabel: '개발자 모드',
      description:
        '번역 과정에서 발생하는 이벤트를 실시간으로 확인할 수 있는 디버그 패널을 표시합니다.',
    },
    dangerZone: {
      title: '위험 구역',
      resetAllTitle: '전체 초기화',
      resetAllDescription:
        '모든 설정, API 키, 번역 캐시, 작품별 고유명사 사전을 삭제하고 앱을 초기 상태로 되돌립니다. 이 작업은 되돌릴 수 없습니다.',
      resetAction: '초기화',
    },
  },
  apiLogs: {
    confirmClear:
      '모든 API 로그를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.',
    confirmClearTitle: 'API 로그 삭제',
    title: 'API 로그',
    description: '번역 API 요청 기록을 확인합니다',
    filters: {
      all: 'All',
      error: 'Error',
      success: 'Success',
    },
    totalCount: (count: number) => `총 ${count.toLocaleString()}개`,
    clearAction: '로그 삭제',
    columns: {
      status: 'Status',
      provider: 'Provider',
      model: 'Model',
      tokens: 'Tokens',
      duration: 'Duration',
      time: 'Time',
    },
    loading: 'Loading...',
    empty: '로그가 없습니다',
    detailButtonAriaLabel: (provider: string, model: string, status: string) =>
      `API 로그 상세 보기: ${provider} ${model} ${status}`,
    page: (current: number, total: number) => `페이지 ${current} / ${total}`,
    prev: '이전',
    next: '다음',
    notAvailable: 'N/A',
    tokenInputPrefix: 'I:',
    tokenOutputPrefix: 'O:',
    detail: {
      dialogLabel: 'API 로그 상세',
      closeAriaLabel: '닫기',
      uidLabel: 'UID',
      uidTitle: '클릭하여 UID 복사',
      timeLabel: 'Time',
      durationLabel: 'Duration',
      tokensLabel: 'Tokens (I/O)',
      providerModelLabel: 'Provider / Model',
      errorLabel: 'Error',
      requestPayloadLabel: 'Request Payload',
      responsePayloadLabel: 'Response Payload',
      copy: 'Copy',
      copied: 'Copied!',
      emptyPayload: '(empty)',
    },
  },
  llm: {
    title: 'LLM 설정',
    description: '번역에 사용할 AI 서비스 제공자와 모델을 등록합니다.',
    loadFailed: (detail: string, configYamlGuidance: boolean) =>
      `LLM 설정을 불러오지 못했습니다.${configYamlGuidance ? ' config.yaml 형식을 확인하세요.' : ''}${detail ? ` (${detail})` : ''}`,
    managed: {
      title: 'config.yaml이 이 LLM 설정을 관리하고 있습니다.',
      currentFile: (path: string) => `현재 적용 중인 파일: ${path}`,
      lockedDescription: '이 화면에서는 제공자, 모델, 스트리밍 설정을 수정할 수 없습니다.',
    },
    lockedByError: '이 문제가 해결되기 전까지 LLM 설정은 잠긴 상태로 유지됩니다.',
    providers: {
      title: 'AI 서비스 제공자',
      add: '+ 추가',
      deleteConfirm: (count: number) =>
        count > 0
          ? `이 AI 서비스 제공자를 삭제하시겠습니까?\n\n연결된 모델 ${count}개도 함께 삭제됩니다.`
          : '이 AI 서비스 제공자를 삭제하시겠습니까?',
      deleteTitle: 'AI 서비스 제공자 삭제',
    },
    models: {
      title: '모델',
      add: '+ 추가',
      deleteConfirm: '이 모델을 삭제하시겠습니까?',
      deleteTitle: '모델 삭제',
      changeBlockedWhileTranslating: '현재 번역 중이라 모델을 변경할 수 없습니다.',
    },
    streaming: {
      title: '스트리밍 모드',
      description: '번역 결과를 실시간으로 표시합니다.',
    },
    providerTypes: {
      gemini: {
        label: 'Gemini',
        apiKeyPlaceholder: 'AIzaSy...',
        apiKeyHelpText: 'Google AI Studio에서 무료로 발급',
      },
      openrouter: {
        label: 'OpenRouter',
        apiKeyPlaceholder: 'sk-or-...',
        apiKeyHelpText: 'OpenRouter에서 발급',
      },
      anthropic: {
        label: 'Anthropic',
        apiKeyPlaceholder: 'sk-ant-...',
        apiKeyHelpText: 'Anthropic Console에서 발급',
      },
      openai: {
        label: 'OpenAI',
        apiKeyPlaceholder: 'sk-...',
        apiKeyHelpText: 'OpenAI Platform에서 발급',
      },
      'openai-oauth': {
        label: 'OpenAI (Codex)',
        apiKeyPlaceholder: '',
        apiKeyHelpText: 'ChatGPT 계정으로 로그인하여 인증 (Codex Backend API)',
      },
      custom: {
        label: 'OpenAI-compatible',
        apiKeyPlaceholder: 'API 키',
        apiKeyHelpText: 'OpenAI Chat Completions 호환 API 엔드포인트',
      },
    },
    providerList: {
      empty: '등록된 AI 서비스 제공자가 없습니다. 먼저 추가해주세요.',
      noApiKey: '(없음)',
      oauth: {
        checking: '...',
        authenticated: (email: string | null) => (email ? `✓ ${email}` : '인증됨'),
        error: '설정 오류',
        loginRequired: '로그인 필요',
      },
      actions: {
        editTitle: '수정',
        deleteTitle: '삭제',
        editAriaLabel: (name: string) => `${name} 수정`,
        deleteAriaLabel: (name: string) => `${name} 삭제`,
      },
    },
    modelList: {
      empty: '등록된 모델이 없습니다. 모델을 추가해주세요.',
      missingProvider: '제공자 없음',
      actions: {
        editTitle: '수정',
        deleteTitle: '삭제',
        editAriaLabel: (name: string) => `${name} 수정`,
        deleteAriaLabel: (name: string) => `${name} 삭제`,
      },
    },
    providerModal: {
      addTitle: 'AI 서비스 제공자 추가',
      editTitle: 'AI 서비스 제공자 수정',
      cancel: '취소',
      save: '저장',
      typeLabel: '종류',
      nameLabel: '표시 이름',
      oauthTitle: 'ChatGPT 인증',
      oauthAuthenticated: (email: string | null) => (email ? `✓ ${email}` : '인증됨'),
      oauthError: '설정 오류',
      reauthenticate: '재인증',
      login: 'ChatGPT로 로그인',
      oauthDescription: '브라우저에서 ChatGPT 계정으로 로그인합니다',
      apiKeyLabel: 'API 키',
      optional: '선택',
      baseUrlLabel: '기본 URL',
    },
    modelModal: {
      addTitle: '모델 추가',
      editTitle: '모델 수정',
      cancel: '취소',
      save: '저장',
      providerLabel: 'AI 서비스 제공자',
      noProviders: '먼저 AI 서비스 제공자를 추가해주세요.',
      modelIdLabel: '모델 ID',
      modelIdPlaceholder: '예: gpt-4o, claude-sonnet-4, gemini-2.5-flash',
      refreshModels: '모델 목록 새로고침',
      availableModels: '사용 가능한 모델',
      displayNameLabel: '표시 이름',
      optional: '선택',
      displayNameAutoPlaceholder: '자동 설정',
    },
  },
  view: {
    confirmReset: '기본 설정으로 초기화하시겠습니까?',
    confirmResetTitle: '설정 초기화',
    title: '보기 설정',
    description: '번역 결과의 표시 방식을 설정합니다.',
    previewTitle: '미리보기',
    previewOriginalText: 'これは日本語の原文テキストです。',
    previewTranslatedText: '이것은 한국어 번역 텍스트입니다.',
    toggles: {
      showOriginal: '원문 표시',
      forceDialogueBreak: '대사 강제 개행',
    },
    layout: {
      title: '레이아웃',
      sideBySide: {
        label: '좌우 배치',
        description: '원문과 번역을 나란히 표시',
      },
      stacked: {
        label: '상하 배치',
        description: '원문 아래에 번역을 표시',
      },
    },
    presets: {
      title: '색상 프리셋',
      dark: '다크 (기본)',
      sepia: '세피아',
      light: '라이트',
      darkGreen: '다크 그린',
      amoled: '아몰레드',
    },
    fields: {
      fontFamily: '폰트',
      fontFamilyPlaceholder: 'Pretendard',
      fontSize: '글자 크기 (px)',
      fontWeight: '글자 두께',
      textColor: '글자 색상',
      backgroundColor: '배경 색상',
      lineHeight: '줄 간격',
      paragraphSpacing: '문단 간격 (px)',
      textIndent: '들여쓰기 (em)',
      horizontalPadding: '좌우 여백 (px)',
      originalOpacity: (value: string) => `원문 투명도 (${value}%)`,
      originalOpacityHidden: '숨김',
      originalOpacityTranslucent: '반투명',
      originalOpacityVisible: '표시',
    },
    reset: '기본값 복원',
  },
} as const;
