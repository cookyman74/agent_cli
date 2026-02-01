# Phase 1 M1.0: 코드 인벤토리 및 영향도 분석 작업 기록

**작업일**: 2026-02-01  
**작업자**: AI Assistant  
**브랜치**: DID/v0.1  
**이전 작업**: 최초 작업  
**관련 문서**: [00_master_implementation_plan.md](../todolist/00_master_implementation_plan.md) - Phase 1, M1.0

---

## 📋 작업 개요

### 목표
- `@google/genai` 의존성 전체 인벤토리 작성
- GeminiEventType 18개 이벤트 사용처 분석
- 핵심 인터페이스 의존 관계 맵핑
- 마이그레이션 전략 수립

### 작업 범위
- **파일 생성**: 
  - `docs/ai_adapter/migration-plan.md`: 마이그레이션 계획서
  - `docs/ai_adapter/event-mapping-matrix.md`: 이벤트 매핑 매트릭스
- **분석 대상**: packages/core/src 전체 코드베이스

---

## 📊 분석 결과

### @google/genai 의존 파일 현황 (총 100개)

| 카테고리 | 파일 수 | 핵심 파일 |
|----------|--------|----------|
| core/ | 21 | `turn.ts`, `contentGenerator.ts`, `geminiChat.ts`, `baseLlmClient.ts`, `client.ts`, `loggingContentGenerator.ts`, `recordingContentGenerator.ts`, `fakeContentGenerator.ts` |
| utils/ | 20 | `partUtils.ts`, `tokenCalculation.ts`, `apiConversionUtils.ts`, `generateContentResponseUtilities.ts` |
| tools/ | 11 | `tool-registry.ts`, `mcp-client.ts`, `mcp-tool.ts`, `read-file.ts`, `web-search.ts` |
| services/ | 8 | `modelConfigService.ts`, `chatCompressionService.ts`, `loopDetectionService.ts`, `sessionSummaryService.ts` |
| hooks/ | 7 | `hookTranslator.ts`, `hookSystem.ts`, `hookEventHandler.ts`, `hookAggregator.ts`, `types.ts` |
| code_assist/ | 6 | `converter.ts`, `server.ts`, `telemetry.ts` |
| telemetry/ | 5 | `semantic.ts`, `types.ts`, `loggers.ts` |
| routing/ | 5 | `routingStrategy.ts`, `classifierStrategy.ts`, `numericalClassifierStrategy.ts`, `modelRouterService.ts` |
| agents/ | 5 | `local-executor.ts`, `codebase-investigator.ts`, `types.ts` |
| policy/ | 3 | `policy-engine.ts` |
| safety/ | 3 | `checker-runner.ts`, `protocol.ts` |
| config/ | 2 | `config.ts`, `defaultModelConfigs.ts` |
| availability/ | 1 | `policyHelpers.ts` |
| scheduler/ | 1 | `types.ts` |
| commands/ | 1 | `types.ts` |
| confirmation-bus/ | 1 | `types.ts` |
| **합계** | **100** | - |

### GeminiEventType 분석 (18개)

| # | 이벤트 | LlmStreamEventType 매핑 | 공통/특화 | 주요 사용처 |
|---|--------|------------------------|----------|-----------|
| 1 | Content | TextDelta | 공통 | turn.ts, client.ts |
| 2 | ToolCallRequest | ToolCallRequest | 공통 | turn.ts, loopDetectionService.ts |
| 3 | ToolCallResponse | ToolCallResponse | 공통 | turn.ts |
| 4 | ToolCallConfirmation | ToolCallConfirmation | 공통 | turn.ts |
| 5 | UserCancelled | UserCancelled | 공통 | turn.ts, client.ts |
| 6 | Error | Error | 공통 | turn.ts, client.ts |
| 7 | ChatCompressed | ChatCompressed | **Gemini 특화** | client.ts |
| 8 | Thought | ThoughtDelta | 공통 | turn.ts (Claude 호환) |
| 9 | MaxSessionTurns | MaxSessionTurns | 공통 | client.ts |
| 10 | Finished | Finished | 공통 | turn.ts |
| 11 | LoopDetected | LoopDetected | 공통 | client.ts |
| 12 | Citation | Citation | **Gemini 특화** | turn.ts |
| 13 | Retry | Retry | 공통 | turn.ts, client.ts |
| 14 | ContextWindowWillOverflow | ContextWindowOverflow | 공통 | client.ts |
| 15 | InvalidStream | InvalidStream | 공통 | turn.ts |
| 16 | ModelInfo | ModelInfo | 공통 | client.ts |
| 17 | AgentExecutionStopped | AgentStopped | 공통 | turn.ts, client.ts |
| 18 | AgentExecutionBlocked | AgentBlocked | 공통 | turn.ts, client.ts |

### Critical Path 파일

**Tier 1 (최우선 - @google/genai 직접 결합)**:
- `core/turn.ts` - GeminiEventType 정의
- `core/contentGenerator.ts` - ContentGenerator 인터페이스, AuthType
- `core/geminiChat.ts` - 스트리밍 로직 (988라인)
- `core/baseLlmClient.ts` - Content, Part, GenerateContentConfig
- `core/client.ts` - GeminiClient, 세션 관리

**Tier 2 (연쇄 영향 - 핵심 서비스)**:
- `core/loggingContentGenerator.ts` - 텔레메트리 래퍼
- `core/recordingContentGenerator.ts` - 녹화/재생
- `core/fakeContentGenerator.ts` - 테스트용
- `services/modelConfigService.ts` - GenerateContentConfig 의존
- `routing/routingStrategy.ts` - @google/genai 타입 직접 import

**Tier 3 (확장 영향 - 에이전트/도구)**:
- `agents/local-executor.ts` - StreamEventType 사용
- `telemetry/*` - usageMetadata, GenerateContentConfig
- `tools/*` - FunctionDeclaration, Part
- `scheduler/types.ts` - FunctionCall
- `policy/policy-engine.ts` - Part 타입
- `safety/*` - Part, Content 타입

---

## ✅ 검증 결과

### 분석 완료 항목
- 완료: 18/18 항목

### 생성 문서
- `migration-plan.md`: 마이그레이션 계획 완성
- `event-mapping-matrix.md`: 18개 이벤트 매핑 완성

---

## 🐛 이슈 및 해결

### 이슈 1: 라우팅 레이어 @google/genai 직접 import
- **증상**: `routingStrategy.ts`에서 Content, PartListUnion 직접 참조
- **영향**: M2.6에서 별도 마일스톤으로 처리 필요
- **대응**: Critical Issue로 등록 완료

### 이슈 2: 테스트 파일 의존성
- **증상**: 테스트 파일에서도 @google/genai mock 객체 광범위 사용
- **영향**: M3.5 테스트 마이그레이션 작업량 증가 예상
- **대응**: Phase 3 일정에 반영 필요

### 이슈 3: 예상보다 넓은 영향 범위
- **증상**: 초기 분석(63개)보다 실제 의존 파일(100개)이 더 많음
- **영향**: 마이그레이션 일정 재검토 필요
- **대응**: Phase 2/3 일정 버퍼 확보 권장

---

## 📝 다음 단계

- [/] 다음 Step: M1.1 타입/에러/호환 레이어 설계
- [ ] 후속 작업: providers/types.ts 신규 타입 정의 시작

---

## 📊 커밋 요약

| 순서 | 커밋 ID | 타입 | 설명 | 테스트 |
|------|---------|------|------|--------|
| 1 | `396546ffb` | DOCS | M1.0 분석 문서 작성 | N/A |
| 2 | `pending` | DOCS | 리뷰 반영 수정 | N/A |

**총 커밋 수**: 2개 (1개 대기)

---

## ✅ 완료 기준 체크

- [x] @google/genai 의존 파일 전체 스캔 (**100개**)
- [x] GeminiEventType 18개 이벤트 분석 (전체 사용처 포함)
- [x] ContentGenerator 의존 분석
- [x] ModelConfigService 종속성 분석
- [x] migration-plan.md 작성
- [x] event-mapping-matrix.md 작성

---

## 📌 다음 작업 전달 이슈

| ID | 이슈 | 우선순위 | 담당 마일스톤 |
|----|------|---------|-------------|
| I-1 | routingStrategy.ts @google/genai 직접 참조 | Critical | M2.6 |
| I-2 | 테스트 파일 mock 객체 마이그레이션 규모 | High | M3.5 |
| I-3 | ChatCompressed, Citation은 Gemini 특화 이벤트 | Medium | M1.2 |
| I-4 | 의존 파일 100개로 예상보다 37% 증가 | High | Phase 2/3 |

---

## 📋 리뷰 반영 이력

| 일시 | 리뷰 항목 | 수정 내용 |
|------|----------|----------|
| 2026-02-01 22:49 | [Critical] 파일 수 과소 보고 | 63개 → 100개로 정정 |
| 2026-02-01 22:49 | [High] GeminiEventType 분석 불완전 | 18개 전체 이벤트 테이블 추가 |
| 2026-02-01 22:49 | [High] Critical Path 누락 | Tier 3 추가 (agents, telemetry, tools 등) |
| 2026-02-01 22:49 | [Medium] 카테고리별 파일 수 오차 | 정확한 수치로 정정 |
| 2026-02-01 22:49 | [Low] 작업 범위 문구 | "문서 수정없이" → "분석 대상"으로 정정 |

---

**작업 완료 시간**: 2026-02-01 22:30  
**리뷰 반영 시간**: 2026-02-01 22:49  
**작업 소요 시간**: 약 20분 + 리뷰 반영 10분  
**최종 상태**: ✅ 완료 (리뷰 반영)
