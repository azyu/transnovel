# TransNovel

일본 웹소설을 한국어로 번역하는 데스크톱 앱입니다. React 프론트엔드, Rust 백엔드, Tauri 2.0 셸로 구성되어 있습니다.

[English](./README.md)

## 무엇을 하는 앱인가

- 소설가가 되자, 하멜른, 카쿠요무, 녹턴에서 챕터와 시리즈 메타데이터를 파싱합니다.
- 문단 단위 스트리밍으로 번역 결과를 실시간 표시합니다.
- 시리즈 전체를 배치 번역하고 진행 상태와 완료 챕터를 추적합니다.
- 소설별 번역 캐시를 저장해 중복 API 호출을 줄입니다.
- 번역 결과를 TXT 또는 HTML로 저장합니다.
- 설정 화면에서 API 요청/응답 로그를 확인합니다.
- 제공자, 모델, 프롬프트, 치환 규칙, 보기 설정을 앱 안에서 관리합니다.

## 지원 사이트

| 사이트 | 도메인 | 비고 |
| --- | --- | --- |
| Syosetu | `ncode.syosetu.com` | 기준이 되는 파서 |
| Hameln | `syosetu.org` | Syosetu와 유사한 흐름 |
| Kakuyomu | `kakuyomu.jp` | 내장 JSON 파싱, 배치 미지원 |
| Nocturne | `novel18.syosetu.com` | 18+ 쿠키 전송 |

## 지원 제공자

| 제공자 타입 | 프로토콜 | 인증 |
| --- | --- | --- |
| Gemini | Google Generative AI | API 키 |
| OpenRouter | OpenAI 호환 Chat Completions | Bearer 토큰 |
| Custom | OpenAI 호환 Chat Completions | Bearer 토큰 |

내부적으로 `anthropic`, `openai`, `custom` 타입은 모두 OpenAI 호환 클라이언트 경로를 사용합니다.

## 현재 구현 기능

- Tauri 이벤트 기반 실시간 번역 스트리밍
- 문단 의미 ID (`title`, `subtitle`, `p-1`, ...)
- 정규식 기반 전/후처리 치환 파이프라인
- 소설별 SHA256 캐시 분리
- 설정 화면에서 제공자/모델 CRUD
- 요청/응답 상세를 보는 API 로그 뷰어
- 배치 번역 일시정지, 재개, 중지, 완료 챕터 추적
- 테마 및 보기 설정 커스터마이징
- TXT / HTML 내보내기

## 기술 스택

- 프론트엔드: React 19, TypeScript, Vite, Zustand, Headless UI, Tailwind CSS
- 백엔드: Rust, Tauri 2.0, tokio, sqlx, reqwest, scraper
- 저장소: 설정, API 로그, 진행 상태 메타데이터를 SQLite에 저장

## 프로젝트 구조

```text
src/                    React UI, hooks, Zustand stores
src-tauri/src/          Tauri commands, services, parsers, DB code
docs/references.md      상세 아키텍처 및 명령 참고 문서
.context/               공유 작업 추적 및 방향성 문서
```

## 시작하기

### 준비 사항

- Node.js 18+
- pnpm
- Rust toolchain
- 사용 중인 OS에 맞는 Tauri 빌드 의존성

### 설치

```bash
git clone git@github.com:azyu/transnovel.git
cd transnovel
pnpm install
```

### 실행

```bash
pnpm run tauri dev
```

### 빌드

```bash
pnpm run tauri build
```

## 개발 검증 명령

```bash
pnpm run lint
pnpm run build
pnpm run test
cd src-tauri && cargo test
cd src-tauri && cargo clippy -- -D warnings
```

## 사용 방법

1. `설정 -> LLM 설정`에서 제공자와 API 키를 추가합니다.
2. 사용할 제공자와 모델을 선택합니다.
3. 지원 사이트의 챕터 또는 시리즈 URL을 입력합니다.
4. 단일 챕터를 번역하거나 시리즈 전체 배치 번역을 시작합니다.
5. 필요하면 TXT 또는 HTML로 내보냅니다.

## 구현 상태

현재 구현됨:

- 다중 사이트 파싱
- 스트리밍 번역
- 배치 번역
- 소설별 캐시
- API 로그
- 제공자/모델 관리
- TXT/HTML 내보내기

아직 미구현:

- EPUB 내보내기
- 현재 제한을 넘는 자동 재시도
- API 키 순환
- 메인 플로우에서 `novels`, `chapters`, `translations` 테이블의 본격 활용

## 참고 문서

명령 목록, 이벤트 페이로드, 스키마 메모, 모듈 구조는 [docs/references.md](./docs/references.md)에서 확인할 수 있습니다.
