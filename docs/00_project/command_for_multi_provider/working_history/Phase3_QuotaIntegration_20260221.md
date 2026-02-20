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
