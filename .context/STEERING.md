# Steering

## Current Priority

1. **안정성** — 기존 번역 워크플로우의 안정성 유지 (파서, 스트리밍, 캐시)
2. **EPUB 내보내기** — 사용자 요청이 가장 많은 기능
3. **API 신뢰성** — 자동 재시도 + 키 순환으로 장시간 배치 번역 안정화
4. **DB 활용** — novels/chapters/translations 테이블을 실제 기능에 연결

## Constraints

- Tauri 2.0 + React 19 + SQLite 스택 유지
- 프론트엔드는 thin UI layer — 무거운 로직은 Rust 백엔드에서 처리
- UI에서 관리하는 API 키는 SQLite `api_keys` 테이블에 저장한다. 외부 YAML override 사용 시 API 키는 `config.yaml`에서 관리하며, 환경변수 입력 경로는 지원하지 않는다.
- 기존 SQLite `translation_cache` 기반 캐시를 유지한다. `novels`/`chapters`/`translations` 영속화와 캐시는 별도 책임으로 다룬다.

## Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-20 | Codex Backend API 직접 호출로 전환 (Superseded) | 당시에는 OpenAI OAuth를 제거하는 방향이었으나 현재 OAuth 기반 토큰 관리 경로로 대체됨 |
| 2026-03-12 | `.context/` 기반 멀티 에이전트 조율 도입 | PLAN.md/PROGRESS.md 방식에서 전환 |
| 2026-04-09 | 사용자 노출 UI 문구는 구현 방식보다 사용자 효용을 먼저 설명하고, URL placeholder는 탭별 예외 없이 구체 예시보다 `https://` 같은 일반 입력 힌트를 우선한다 | 개발자 중심 문구와 과한 예시 노출을 줄이고 입력 경험을 일관되게 유지하기 위해 |
| 2026-04-17 | GitHub Issues를 backlog와 non-trivial task context의 source of truth로 사용하고, `.context/TASKS.md`는 로컬 실행 스냅샷으로만 유지한다 | 세션 간 연속성을 GitHub에 남기고, 로컬 tracker와 장기 backlog의 역할을 분리하기 위해 |
| 2026-04-17 | 작업 문서가 필요하면 `docs/` 아래에 두고, 복잡한 작업에만 작성한다 | `mydocs/`식 문서 과잉을 피하면서도 재사용 가능한 설계/조사 결과는 저장하기 위해 |
| 2026-07-13 | OpenAI OAuth로 토큰을 발급·갱신하고 `CodexClient`로 Codex Backend API를 호출한다 | 인증 수명주기와 Codex 요청 전송의 책임을 분리하고 현재 provider routing과 일치시키기 위해 |
