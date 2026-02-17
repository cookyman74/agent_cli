# Long-Term Memory (PostgreSQL) Proposal

## 배경

현재 Gemini CLI는 세션 기록을 로컬 파일에 저장합니다.

- 세션 대화: `~/.didim/tmp/<project_hash>/chats/*.json`
- 디버그 활동 로그:
  `~/.didim/tmp/<project_hash>/logs/session-<session_id>.jsonl` (debug mode)
- 훅 입력: `transcript_path`가 전달되어 후처리 가능 (`SessionEnd`, `AfterTool`,
  `BeforeAgent`)

이 구조는 로컬 복구/재개에는 충분하지만, 팀 단위 운영관리(SE) 관점에서는 아래
요구를 만족하기 어렵습니다.

- 프로젝트/세션/이슈 단위의 통합 검색
- 장기 이력 기반 의사결정(유사 장애, 이전 조치, 실패 패턴)
- 감사/거버넌스 및 보존 정책

## 목표

- 작업/도구/결과 로그를 PostgreSQL에 중앙 저장
- 질의 시 과거 이력을 검색해 현재 작업 컨텍스트로 주입
- 운영관리 시나리오(장애 대응, 재발 방지, 변경 승인)에서 재사용 가능한 장기
  메모리 제공

## 비목표

- 기존 `save_memory` 도구 대체
- 전체 히스토리를 매 턴 모델 컨텍스트에 전부 주입
- 즉시 완전 자동화(초기 단계는 승인/검토 흐름 유지)

## 제안 아키텍처

### 단계 1 (빠른 적용: Hook 기반)

- `SessionEnd` 훅에서 `transcript_path`를 읽어 PostgreSQL에 upsert
- `AfterTool` 훅에서 주요 도구 결과를 구조화 저장 (선택)
- `BeforeAgent` 훅에서 질의와 메타데이터 기반 검색 후 `additionalContext`로 주입

장점:

- 코어 대규모 수정 없이 빠르게 PoC 가능
- 실패 시 기능 비활성화가 쉬움

한계:

- 훅 스크립트 품질/운영 복잡도에 의존
- 검색/랭킹/보안 규칙이 분산될 가능성

### 단계 2 (정식 기능: Core 내장)

- `HistoryStore` 인터페이스 + `PostgresHistoryStore` 구현 추가
- 인제스트/검색/요약을 코어 서비스로 통합
- 설정(`settings.json`)과 정책(approval/policy/hook) 연동

장점:

- 일관된 실패 처리, 테스트 가능성, 운영 가시성 향상
- 확장(다른 DB, 하이브리드 검색, 보안정책) 용이

## 추가 구현이 필요한 영역

1. 설정 계층

- `packages/cli/src/config/settingsSchema.ts`: `longTermMemory` 섹션 추가
  (enabled, provider, dsn/env, retrieval 정책, redaction 옵션)
- `docs/get-started/configuration.md`: 신규 설정 문서화

2. 저장/조회 인터페이스

- `packages/core/src/services/`:
  - `historyStore.ts` (interface)
  - `postgresHistoryStore.ts` (implementation)
  - `longTermMemoryService.ts` (ingest + retrieve orchestration)

3. 수집 파이프라인

- 소스:
  - `ChatRecordingService` 세션 JSON
  - Activity JSONL (옵션)
  - Hook 이벤트 페이로드
- 요구사항:
  - idempotent upsert
  - 배치/재시도/백오프
  - 부분 실패 시 로컬 스풀(queue) 저장

4. 검색/주입 경로

- `BeforeAgent` 단계에서 질의 기반 검색
- top-k 결과를 토큰 예산 내 요약 후 prompt context에 삽입
- 민감정보 및 prompt-injection 방어 필터 적용

5. 운영 기능

- 백필 스크립트(기존 `chats/*.json` 적재)
- 보존 정책(TTL), 삭제/익명화, 감사 로그
- 지표(적재율, 검색적중률, p95 지연, context 기여도)

## 권장 도입 순서

1. Hook 기반 PoC (2~3주)
2. PostgreSQL 스키마 고정 + 백필 도구
3. Core 서비스 통합 (read path 먼저)
4. write path 전환 + 운영 하드닝

## 성공 기준

- 세션 적재 성공률 >= 99.9%
- 검색 p95 <= 300ms (metadata+vector hybrid 기준)
- “과거 이력 기반 해결” 비율 증가(운영 KPI)
- 장애 대응 시 평균 triage 시간 단축
