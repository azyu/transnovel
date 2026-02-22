# AI Novel Translator

일본 웹소설을 AI를 사용하여 한국어로 번역하는 데스크톱 애플리케이션입니다. Tauri 2.0, React, Rust로 개발되었습니다.

[English](./README.md)

## 기능

- **다중 사이트 지원**: 소설가가 되자, 하멜른, 카쿠요무, 녹턴에서 소설 파싱
- **다양한 AI 제공자**: Gemini API, OpenRouter, 또는 커스텀 제공자 중 선택
- **일괄 번역**: 진행 상황 추적과 함께 전체 시리즈 번역
- **스마트 캐싱**: SHA256 기반 캐시로 중복 API 호출 방지
- **소설별 캐시**: 번역 캐시가 소설별로 분리됨
- **스트리밍 출력**: AI가 텍스트를 생성하는 동안 실시간 번역 표시
- **다크 모드**: 전체 다크 테마 지원
- **내보내기**: 번역된 챕터를 TXT 파일로 저장

## 지원 사이트

| 사이트 | 도메인 |
|--------|--------|
| 소설가가 되자 (Syosetu) | ncode.syosetu.com |
| 하멜른 (Hameln) | syosetu.org |
| 카쿠요무 (Kakuyomu) | kakuyomu.jp |
| 녹턴 (Nocturne) | novel18.syosetu.com |

## AI 제공자

| 제공자 | 인증 방법 | 비고 |
|--------|-----------|------|
| Gemini API | API 키 | [Google AI Studio](https://aistudio.google.com/apikey)에서 무료 발급 |
| OpenRouter | API 키 | [OpenRouter](https://openrouter.ai)에서 Claude, GPT-4, Llama 등 사용 가능 |
| Custom | API 키 | OpenAI 호환 API 엔드포인트 |

## 설치

### 사전 요구사항

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) 1.77+
- [pnpm](https://pnpm.io/) (권장)

### 소스에서 빌드

```bash
# 저장소 클론
git clone https://github.com/azyu/ai-novel-translator.git
cd ai-novel-translator

# 의존성 설치
pnpm install

# 개발 모드로 실행
pnpm run tauri dev

# 프로덕션용 빌드
pnpm run tauri build
```

## 사용법

1. **API 키 추가**: 설정 → LLM 설정 → API 키 추가
2. **제공자 선택**: 하나의 제공자 선택 (Gemini, OpenRouter, 또는 Custom)
3. **URL 입력**: 지원 사이트의 챕터 또는 시리즈 URL 입력
4. **번역**: 번역 버튼 클릭 또는 시리즈의 경우 일괄 번역 사용

## 기술 스택

- **프론트엔드**: React 19, TypeScript, Tailwind CSS, Zustand
- **백엔드**: Rust, Tauri 2.0, SQLite (sqlx 사용)
- **빌드**: Vite, pnpm

## 라이선스

MIT
