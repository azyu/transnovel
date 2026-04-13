<div align="center">
  <img src="src-tauri/icons/icon.png" alt="TransNovel icon" width="128">
  <h1>TransNovel</h1>
  <p>일본 웹소설을 한국어로 편하게 읽기 위한 번역 데스크톱 앱입니다.</p>
</div>

<p align="center">
  <a href="https://github.com/azyu/transnovel/releases"><img src="https://img.shields.io/github/v/release/azyu/transnovel?display_name=tag" alt="Latest Release"></a>
  <a href="https://github.com/azyu/transnovel/actions/workflows/ci.yml"><img src="https://github.com/azyu/transnovel/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
</p>

<p align="center">
  <a href="./README.en.md">English</a>
</p>

## 소개

TransNovel은 일본 웹소설 URL만 붙여 넣으면 작품을 불러오고, 원하는 LLM으로 한국어 번역을 진행할 수 있게 만든 앱입니다. 한 화를 빠르게 읽고 저장하는 흐름에 맞춰 설계했습니다.

웹에서 원문을 찾아다니고, 번역기를 따로 붙여 넣고, 이미 읽은 화를 다시 정리하는 과정을 줄이는 데 초점을 맞췄습니다.

## 이런 점이 편합니다

- 지원 사이트 URL을 넣으면 챕터와 작품 정보를 바로 불러옵니다.
- 번역 결과가 문단 단위로 실시간 표시되어 긴 화도 기다리기 덜 답답합니다.
- 같은 문장을 다시 번역할 때는 캐시를 활용해 속도와 비용을 줄입니다.
- 자주 보는 작품은 관심작품에 넣고 새 화가 올라왔는지 확인할 수 있습니다.
- 번역 결과를 TXT 또는 HTML로 저장해 오프라인으로 보관할 수 있습니다.
- 앱 안에서 제공자, 모델, 프롬프트, 치환 규칙, 보기 방식을 바꿀 수 있습니다.
- 요청/응답 로그를 확인해 어떤 API 호출이 실패했는지 점검할 수 있습니다.

## 설치하기

가장 쉬운 방법은 [Releases](https://github.com/azyu/transnovel/releases) 페이지에서 운영체제에 맞는 설치 파일을 내려받는 것입니다.

| 운영체제 | 설치 파일 |
| --- | --- |
| macOS | `.dmg` |
| Windows | `.exe`, `.msi` |
| Linux | `.AppImage`, `.deb` |

> [!TIP]
> 일반 사용자라면 소스 실행보다 릴리즈 설치본을 사용하는 편이 간단합니다.

## 빠르게 시작하기

1. `설정 > LLM 설정`에서 사용할 제공자를 추가합니다.
2. API 키를 넣거나 `OpenAI (Codex)`를 선택해 로그인합니다.
3. 번역하고 싶은 작품 또는 화의 URL을 입력합니다.
4. 원하는 화를 번역해서 바로 읽습니다.
5. 필요하면 관심작품에 추가해 새 화를 확인합니다.
6. 읽은 결과를 TXT 또는 HTML로 내보냅니다.

> [!TIP]
> 처음에는 짧은 챕터 하나로 모델, 프롬프트, 치환 규칙이 마음에 드는지 확인해 두면 이후 읽는 흐름이 훨씬 편합니다.

## 지원 사이트

| 사이트 | 주소 | 현재 상태 |
| --- | --- | --- |
| Syosetu | `ncode.syosetu.com` | 챕터/시리즈 번역 지원 |
| Hameln | `syosetu.org` | 챕터/시리즈 번역 지원 |
| Kakuyomu | `kakuyomu.jp` | 개별 화 번역 지원 |
| Nocturne | `novel18.syosetu.com` | 챕터/시리즈 번역 지원 |

## 지원 LLM 제공자

| 제공자 | 인증 방식 | 메모 |
| --- | --- | --- |
| Gemini | API 키 | Google Gemini 계열 |
| OpenRouter | API 키 | 다양한 모델을 한 곳에서 사용 |
| Anthropic | API 키 | OpenAI 호환 방식으로 연결 |
| OpenAI | API 키 | OpenAI 호환 방식으로 연결 |
| OpenAI (Codex) | ChatGPT 로그인 | Codex Backend API 사용 |
| Custom | API 키 + Base URL | OpenAI 호환 서버 직접 연결 |

## 현재 제한 사항

- EPUB 내보내기는 아직 지원하지 않습니다.
- 관심작품 등록은 현재 Syosetu, Nocturne, Kakuyomu 작품 페이지에서 지원합니다.

> [!IMPORTANT]
> 번역 품질과 속도, 비용은 선택한 모델과 프롬프트 설정에 따라 크게 달라집니다. 같은 작품이라도 제공자를 바꾸면 결과가 꽤 달라질 수 있습니다.

## 소스에서 직접 실행하기

현재 저장소 기준으로는 소스에서 직접 실행하는 방식이 기본입니다.

### 준비 사항

- Node.js 18+
- pnpm
- Rust toolchain
- 사용 중인 OS에 맞는 Tauri 빌드 의존성

```bash
git clone https://github.com/azyu/transnovel.git
cd transnovel
pnpm install
```

### 개발 모드 실행

```bash
pnpm run tauri dev
```

### 빌드

```bash
pnpm run tauri build
```

<details>
<summary>개발자용 참고</summary>

### 기술 스택

- 프론트엔드: React 19, TypeScript, Vite, Zustand, Headless UI, Tailwind CSS
- 백엔드: Rust, Tauri 2.0, tokio, sqlx, reqwest, scraper
- 저장소: 설정, API 로그, 진행 상태 메타데이터를 SQLite에 저장

### 프로젝트 구조

```text
src/                    React UI, hooks, Zustand stores
src-tauri/src/          Tauri commands, services, parsers, DB code
docs/references.md      상세 아키텍처 및 명령 참고 문서
.context/               공유 작업 추적 및 방향성 문서
```

### 검증 명령

```bash
pnpm run lint
pnpm run build
pnpm run test
cd src-tauri && cargo test
cd src-tauri && cargo clippy -- -D warnings
```

</details>

## 더 보기

- 자세한 아키텍처와 내부 명령은 [docs/references.md](./docs/references.md)에서 확인할 수 있습니다.
