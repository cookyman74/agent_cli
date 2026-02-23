# Phase 3 작업 결과서 — 프로바이더별 쿼타 통합 (Rate-Limit Header → UI)

- **작업일**: 2026-02-21
- **브랜치**: `v0.2.0/stats_multi_provider`
- **상태**: ✅ 완료
- **참조 계획서**:
  `docs/00_project/command_for_multi_provider/phase_plan/phase3_quota_integration.md`
- **선행 Phase**: Phase 2 (cacheCreation 토큰 파이프라인)

## 작업 목표

Claude/OpenAI SDK 응답의 rate-limit 헤더를 추출하여
`LlmMessageEndEvent.rateLimits` → `ProviderQuotaService` →
`CommandContext.services` → `statsCommand` → `StatsDisplay` UI까지 전 경로를
연결한다.

## 데이터 흐름

```
SDK Response Headers
  ↓ (.withResponse() API)
adapter.ts [parseRateLimitHeaders]
  ↓ (RateLimitInfo on LlmMessageEndEvent / LlmGenerateResponse)
LoggingContentGenerator [bridge to ProviderQuotaService]
  ↓
ProviderQuotaService.update(provider, rateLimits)
  ↓ (CommandContext.services.providerQuotaService)
statsCommand → HistoryItemStats.providerQuotas
  ↓
HistoryItemDisplay → StatsDisplay [ProviderQuotaSection]
```

## 작업 순서 및 결과

| 순서 | TASK      | 작업 내용                                                                 | 테스트 결과           |
| ---- | --------- | ------------------------------------------------------------------------- | --------------------- |
| 1    | RED-1     | events.test.ts: RateLimitInfo 타입 + LlmMessageEndEvent.rateLimits 테스트 | TS 컴파일 에러 (예상) |
| 2    | RED-1     | claude/adapter.test.ts: rate-limit 헤더 추출 테스트 3개                   | 2 FAIL (예상)         |
| 3    | RED-1     | openai/adapter.test.ts: rate-limit 헤더 추출 테스트 3개                   | 2 FAIL (예상)         |
| 4    | RED-2     | providerQuotaService.test.ts: ProviderQuota 타입 + Service CRUD 테스트    | Module Not Found      |
| 5    | RED-3~4   | statsCommand.test.ts + StatsDisplay.test.tsx: providerQuotas 테스트       | 2 FAIL (예상)         |
| 6    | TASK-000  | RateLimitInfo interface + LlmMessageEndEvent/LlmGenerateResponse 확장     | TS 컴파일 통과        |
| 7    | TASK-001  | Claude adapter: parseClaudeRateLimitHeaders + extractWithRateLimits       | 40/40 PASS            |
| 8    | TASK-002  | OpenAI adapter: parseOpenAiRateLimitHeaders + extractWithRateLimits       | 33/33 PASS            |
| 9    | TASK-003  | ProviderQuota interface + ProviderQuotaService class + export             | 8/8 PASS              |
| 10   | TASK-003A | LoggingContentGenerator: MessageEnd.rateLimits → ProviderQuotaService     | core 전체 PASS        |
| 11   | TASK-004  | HistoryItemStats.providerQuotas 필드 추가                                 | TS 컴파일 통과        |
| 12   | TASK-005  | StatsDisplay: ProviderQuotaSection 컴포넌트 + providerQuotas prop         | 4788/4788 PASS        |
| 13   | TASK-006  | HistoryItemDisplay → StatsDisplay providerQuotas prop 전달                | PASS                  |
| 14   | TASK-007  | CommandContext.services.providerQuotaService 타입 + statsCommand 분기     | PASS                  |
| 15   | TASK-007  | slashCommandProcessor.ts: ProviderQuotaService 인스턴스 생성 및 주입      | PASS                  |
| 16   | REFACTOR  | rateLimitUtils.ts: 공통 헤더 파싱 유틸리티 추출 (DRY)                     | 7/7 PASS              |
| 17   | POST      | typecheck + lint + 전체 테스트                                            | ✅                    |

## 변경 파일 목록

### 신규 파일 (5)

| 파일                                                       | 설명                                |
| ---------------------------------------------------------- | ----------------------------------- |
| `packages/core/src/providers/rateLimitUtils.ts`            | 공통 rate-limit 헤더 파싱 유틸리티  |
| `packages/core/src/providers/rateLimitUtils.test.ts`       | 유틸리티 단위 테스트 (7 tests)      |
| `packages/core/src/providers/events.test.ts`               | RateLimitInfo 타입 테스트 (4 tests) |
| `packages/core/src/telemetry/providerQuotaService.ts`      | ProviderQuotaService 구현           |
| `packages/core/src/telemetry/providerQuotaService.test.ts` | Service CRUD 테스트 (8 tests)       |

### 수정 파일 (12)

| 파일                                                    | 변경 내용                                                |
| ------------------------------------------------------- | -------------------------------------------------------- |
| `packages/core/src/providers/events.ts`                 | RateLimitInfo interface + LlmMessageEndEvent.rateLimits  |
| `packages/core/src/providers/types.ts`                  | LlmGenerateResponse.rateLimits                           |
| `packages/core/src/providers/claude/adapter.ts`         | .withResponse() 헤더 추출 → rateLimits                   |
| `packages/core/src/providers/claude/adapter.test.ts`    | rate-limit 헤더 추출 테스트 3개 추가                     |
| `packages/core/src/providers/openai/adapter.ts`         | .withResponse() 헤더 추출 → rateLimits                   |
| `packages/core/src/providers/openai/adapter.test.ts`    | rate-limit 헤더 추출 테스트 3개 추가                     |
| `packages/core/src/core/loggingContentGenerator.ts`     | ProviderQuotaService 연결 (스트림 + 비스트림)            |
| `packages/core/src/telemetry/index.ts`                  | ProviderQuotaService + ProviderQuota export 추가         |
| `packages/core/src/telemetry/types.ts`                  | ProviderQuota interface 추가                             |
| `packages/cli/src/ui/types.ts`                          | HistoryItemStats.providerQuotas 필드                     |
| `packages/cli/src/ui/commands/types.ts`                 | CommandContext.services.providerQuotaService             |
| `packages/cli/src/ui/commands/statsCommand.ts`          | providerQuotaService.getAll() → statsItem.providerQuotas |
| `packages/cli/src/ui/commands/statsCommand.test.ts`     | providerQuotas 테스트 추가                               |
| `packages/cli/src/ui/components/StatsDisplay.tsx`       | ProviderQuotaSection 컴포넌트                            |
| `packages/cli/src/ui/components/StatsDisplay.test.tsx`  | providerQuotas 렌더링 테스트 추가                        |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx` | providerQuotas prop 전달                                 |
| `packages/cli/src/ui/hooks/slashCommandProcessor.ts`    | ProviderQuotaService 인스턴스 생성 + commandContext 주입 |

## 리팩터링 내역

| Before                                                                                   | After                                |
| ---------------------------------------------------------------------------------------- | ------------------------------------ |
| Claude adapter: HeadersLike + parseClaudeRateLimitHeaders + extractWithRateLimits (48행) | 공통: rateLimitUtils.ts (97행)       |
| OpenAI adapter: HeadersLike + parseOpenAiRateLimitHeaders + extractWithRateLimits (48행) | 각 adapter: import + 상수 참조 (3행) |

## 검증 결과

```
Core:  287 test files, 5727 passed, 0 failed
CLI:   351 test files, 4788 passed, 0 failed
TS:    0 errors (core + cli)
Lint:  0 issues
```

## DoD 체크리스트

1. ✅ Claude/OpenAI adapter rate-limit 헤더 추출 → LlmMessageEndEvent.rateLimits
2. ✅ ProviderQuotaService interface + 구현 core export
3. ✅ CommandContext.services.providerQuotaService 연결 완성
4. ✅ ProviderQuota interface core export
5. ✅ HistoryItemStats.providerQuotas 필드
6. ✅ StatsDisplayProps.providerQuotas prop
7. ✅ HistoryItemDisplay → StatsDisplay prop 전달
8. ✅ 프로바이더별 쿼타 UI 렌더링 (ProviderQuotaSection)
9. ✅ 스트리밍 경로 rate-limit → UI 도달
10. ✅ openai-compatible 상속 + graceful 처리
11. ✅ 전체 데이터 경로 검증 (adapter → event → service → command → UI)
12. ✅ LoggingContentGenerator MessageEnd→ProviderQuotaService 브릿지
13. ✅ statsCommand: Gemini 항상 refreshUserQuota(), Non-Gemini는
    ProviderQuotaService
14. ✅ slashCommandProcessor commandContext에 ProviderQuotaService 인스턴스 주입
15. ✅ LlmGenerateResponse.rateLimits 필드 (비스트림 경로)

## 핵심 설계 결정

- **방안 A 채택**: `LlmMessageEndEvent.rateLimits` 이벤트 기반 전달 — 기존
  이벤트 스트림 아키텍처 일관성 유지
- **.withResponse() SDK 패턴**: Anthropic/OpenAI SDK 공통 APIPromise 패턴 활용 —
  duck typing으로 호환성 확보
- **공통 유틸리티 추출**: `rateLimitUtils.ts`에 `extractWithRateLimits` +
  `parseRateLimitHeaders` — 헤더명만 상수로 분리 (CLAUDE_RATE_LIMIT_HEADERS /
  OPENAI_RATE_LIMIT_HEADERS)
- **Late binding**: `LoggingContentGenerator.setProviderQuotaService()` —
  content generator 생성 후 slashCommandProcessor에서 duck typing으로 주입

---

## 코드 리뷰 이슈 수정 (Post-Review Fix)

- **수정일**: 2026-02-21 (Phase 3 작업 동일일)

### 리뷰 이슈 검증 결과

| #   | 심각도      | 이슈                                                     | 판정          |
| --- | ----------- | -------------------------------------------------------- | ------------- |
| 1   | HIGH        | Auth refresh 시 ProviderQuotaService 재바인딩 누락       | **CONFIRMED** |
| 2   | HIGH        | RecordingContentGenerator setProviderQuotaService 미전달 | **CONFIRMED** |
| 3   | HIGH        | NaN/Invalid Date UI 전파 (rateLimitUtils)                | **CONFIRMED** |
| 4   | MEDIUM-HIGH | openai-compatible 서버 MessageEnd 미발행                 | **CONFIRMED** |
| 5   | MEDIUM      | statsCommand 비Gemini에서도 refreshUserQuota 호출        | **NOT A BUG** |
| 6   | LOW         | 회귀 방어 테스트 부족                                    | **CONFIRMED** |

### Issue 5 NOT A BUG 근거

`config.refreshUserQuota()`는 내부적으로 `getCodeAssistServer()` 호출 →
non-Gemini 프로바이더는 undefined 반환 → early return. try/catch 보호. DoD #13
설계 의도대로 동작 확인.

### 수정 내역

#### Issue 1: Auth refresh ProviderQuotaService 재바인딩

- **원인**: `useMemo([config])` — config 객체 참조는 유지되지만 내부
  `contentGenerator`가 교체됨 → useMemo 미재실행
- **수정**: `useMemo` 바인딩을 `useEffect` + `useRef`로 전환. 렌더마다
  `config.getContentGenerator()` 참조 비교하여 변경 감지 시 재바인딩
- **파일**: `packages/cli/src/ui/hooks/slashCommandProcessor.ts`

#### Issue 2: RecordingContentGenerator passthrough

- **원인**: RecordingContentGenerator가 `setProviderQuotaService` 미구현 → duck
  typing 체크(`'setProviderQuotaService' in gen`) 실패
- **수정**: `setProviderQuotaService()` 패스스루 메서드 추가 (wrapped generator
  위임)
- **파일**: `packages/core/src/core/recordingContentGenerator.ts`

#### Issue 3: NaN/Invalid Date 방어

- **원인**: `Number('invalid')` → NaN, `new Date('invalid')` → Invalid Date가
  UI까지 전파 → "NaN/NaN reqs" 표시
- **수정**: `safeNum()` / `safeDate()` 헬퍼 추가 — `isNaN` 검증 후 undefined
  반환. 빈 문자열(`Number('') === 0`) 방어 포함
- **파일**: `packages/core/src/providers/rateLimitUtils.ts`

#### Issue 4: OpenAI 스트림 fallback MessageEnd

- **원인**: openai-compatible 서버가 usage-only 최종 청크를 전송하지 않을 경우
  `MessageEnd` 이벤트 미발행 → downstream 소비자에 누락
- **수정**: 스트림 루프 후 `messageEndEmitted` 플래그 체크 → 미발행 시 synthetic
  `MessageEnd` (+ rateLimits) yield
- **파일**: `packages/core/src/providers/openai/adapter.ts`

#### Issue 6: 회귀 테스트 추가

| 테스트 파일                         | 추가 테스트                                            |
| ----------------------------------- | ------------------------------------------------------ |
| `rateLimitUtils.test.ts`            | NaN 스킵 테스트 + Invalid Date 스킵 테스트 (2개)       |
| `openai/adapter.test.ts`            | fallback MessageEnd 발행 테스트 (1개)                  |
| `recordingContentGenerator.test.ts` | setProviderQuotaService 패스스루 + 미지원 안전성 (2개) |

### 수정 후 검증

```
Core:  287 test files, 5732 passed, 0 failed
CLI:   351 test files, 4788 passed, 0 failed
TS:    0 errors (core + cli)
Lint:  0 issues
```

### 변경 파일 요약

| 파일                                                       | 변경 유형             |
| ---------------------------------------------------------- | --------------------- |
| `packages/core/src/providers/rateLimitUtils.ts`            | NaN/Invalid Date 방어 |
| `packages/core/src/providers/rateLimitUtils.test.ts`       | 회귀 테스트 2개 추가  |
| `packages/core/src/core/recordingContentGenerator.ts`      | passthrough 메서드    |
| `packages/core/src/core/recordingContentGenerator.test.ts` | 회귀 테스트 2개 추가  |
| `packages/core/src/providers/openai/adapter.ts`            | fallback MessageEnd   |
| `packages/core/src/providers/openai/adapter.test.ts`       | 회귀 테스트 1개 추가  |
| `packages/cli/src/ui/hooks/slashCommandProcessor.ts`       | useEffect 재바인딩    |

---

## 2차 코드 리뷰 이슈 수정 (Post-Review Fix #2)

- **수정일**: 2026-02-21 (동일일)

### 2차 리뷰 이슈 검증 결과

| #   | 심각도 | 이슈                                                              | 판정                |
| --- | ------ | ----------------------------------------------------------------- | ------------------- |
| 1   | HIGH   | `extractWithRateLimits` `.withResponse()` rejection 미처리        | **NOT A BUG**       |
| 2   | MEDIUM | `ProviderQuotaService.update()` partial data 덮어쓰기             | **NOT A BUG**       |
| 3   | MEDIUM | LoggingContentGenerator → ProviderQuotaService 브릿지 테스트 없음 | **CONFIRMED**       |
| 4   | LOW    | 비스트림 generateContent rate-limit 테스트 부족                   | **ALREADY COVERED** |

### Issue 1 NOT A BUG 근거

- `extractWithRateLimits()` 호출은 양쪽 adapter(Claude/OpenAI)의 try/catch 블록
  안에 위치
- SDK APIPromise의 `.withResponse()`와 직접 `await`은 동일 underlying promise를
  공유
- `.withResponse()` rejection은 API 호출 실패 시에만 발생 → adapter의
  `classifyError` 에러 핸들링으로 처리됨

### Issue 2 NOT A BUG 근거

- JSDoc에 `Latest value wins (no merging)` 명시된 설계 의도
- Rate-limit 헤더는 API 응답마다 전체 스냅샷을 제공
- 이전 값과 merge하면 오히려 stale 데이터가 잔존하여 의미론적으로 부정확

### Issue 4 ALREADY COVERED 근거

- Claude adapter.test.ts: 비스트림 rate-limit 테스트 1개 존재 (line ~1053)
- OpenAI adapter.test.ts: 비스트림 rate-limit 테스트 1개 존재 (line ~507)

### 수정 내역

#### Issue 3: LoggingContentGenerator → ProviderQuotaService 브릿지 테스트 추가

- **원인**: `loggingContentGenerator.ts`의 비스트림 경로(line 471-473)와 스트림
  경로(line 540-547)에서 `providerQuotaService.update()` 호출이 있으나 단위
  테스트 없음
- **수정**: 4개 브릿지 테스트 추가
  1. 비스트림 응답의 `rateLimits` → `ProviderQuotaService.update()` 호출 검증
  2. 비스트림 응답에 `rateLimits` 없을 때 `update()` 미호출 검증
  3. 스트림 `MessageEnd` 이벤트의 `rateLimits` → `update()` 호출 검증
  4. 스트림 `MessageEnd` 이벤트에 `rateLimits` 없을 때 `update()` 미호출 검증
- **파일**: `packages/core/src/core/loggingContentGenerator.test.ts`

### 수정 후 검증

```
Core:  287 test files, 5736 passed, 0 failed
CLI:   351 test files, 4788 passed, 0 failed
TS:    0 errors (core + cli)
Lint:  0 issues
```

### 변경 파일 요약

| 파일                                                     | 변경 유형              |
| -------------------------------------------------------- | ---------------------- |
| `packages/core/src/core/loggingContentGenerator.test.ts` | 브릿지 테스트 4개 추가 |
