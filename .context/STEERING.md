# Steering

## Current Priority

1. **안정성** — 기존 번역 워크플로우의 안정성 유지 (파서, 스트리밍, 캐시)
2. **EPUB 내보내기** — 사용자 요청이 가장 많은 기능
3. **API 신뢰성** — 자동 재시도 + 키 순환으로 장시간 배치 번역 안정화
4. **DB 활용** — novels/chapters/translations 테이블을 실제 기능에 연결

## Constraints

- Tauri 2.0 + React 19 + SQLite 스택 유지
- 프론트엔드는 thin UI layer — 무거운 로직은 Rust 백엔드에서 처리
- API 키는 SQLite `api_keys` 테이블에 저장, 환경변수 사용 금지
- 기존 캐시 시스템(파일 기반) 유지 — DB 캐시로 전환하지 않음

## Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-20 | Codex Backend API로 전환 | OpenAI OAuth 제거, 직접 API 클라이언트 사용 |
| 2026-03-12 | `.context/` 기반 멀티 에이전트 조율 도입 | PLAN.md/PROGRESS.md 방식에서 전환 |
