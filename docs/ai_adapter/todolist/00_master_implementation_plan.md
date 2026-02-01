# Multi-LLM Provider Adapter - Master Implementation Plan

> 총괄 작업계획서: Gemini CLI Multi-LLM Provider Adapter 구현
> **v0.3** - 2차 리뷰 반영 (Critical 이슈 해결)

## System Prompt

Always follow the instructions in this plan. When I say "go", find the next unmarked task in the current phase, implement the test, then implement only enough code to make that test pass.

---

# PROJECT OVERVIEW

## 목표
Gemini CLI를 어댑터 패턴으로 리팩토링하여 다중 LLM 프로바이더(Gemini, Claude, OpenAI, vLLM 등)를 지원

## 핵심 원칙
- **TDD 방식**: Red → Green → Refactor 사이클 준수
- **Tidy First**: 구조적 변경과 동작 변경 분리
- **점진적 마이그레이션**: alias → 병행 → 제거 전략

## 📚 설계서 참조 (Design Document Index)

| 문서 | 주요 내용 | 링크 |
|------|----------|------|
| **01-overview.md** | 프로젝트 개요, 현재 상태 분석, 문제점 식별 | [바로가기](../01-overview.md) |
| **02-architecture.md** | 현재/목표 아키텍처, 설계 원칙, 프로바이더 선택 흐름 | [바로가기](../02-architecture.md) |
| **03-technical-design.md** | 타입 시스템, 어댑터 구현 상세, 에러 처리 | [바로가기](../03-technical-design.md) |
| **04-integration-design.md** | DidimAIStudio 연동, 공통 타입 시스템, DTO 구조 | [바로가기](../04-integration-design.md) |
| **05-implementation-plan.md** | 마일스톤별 구현 계획, 테스트 전략, 리스크 관리 | [바로가기](../05-implementation-plan.md) |

### 작업별 설계서 Quick Reference

| 작업 유형 | 참조 설계서 섹션 |
|----------|----------------|
| 타입 정의/변환 | 03-technical-design.md §3.1, §3.3 |
| 어댑터 구현 | 03-technical-design.md §3.3.1 (Base), §3.3.2-3.3.8 (Provider별) |
| 설정/인증 | 02-architecture.md §2.4, §2.5 |
| 스트리밍/이벤트 | 03-technical-design.md §3.3.3 (변환기) |
| DidimAIStudio 연동 | 04-integration-design.md §4.2, §4.3 |
| 테스트 전략 | 05-implementation-plan.md §5.5 |

## 전체 일정: 8-10주 (리스크 반영 조정)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Phase 1: 기반 작업 및 의존성 분석 (2-3주)                               │
│  ├── 확장: 상세 의존성 맵핑, 이벤트 타입 전환 전략                        │
│  └── 신규: 유틸리티/테스트 마이그레이션 계획                              │
│                                                                          │
│  Phase 2: 코어 리팩토링 및 Gemini 분리 (3-4주)                           │
│  ├── 확장: GeminiEventType → LlmStreamEvent 매핑                         │
│  └── 신규: ModelConfigService 호환 레이어, 디렉토리 재구성               │
│                                                                          │
│  Phase 3: 프로바이더 확장 및 통합 (3-4주)                                │
│  └── 기존 계획 유지 + 테스트 마이그레이션                                │
└──────────────────────────────────────────────────────────────────────────┘
```

---

# CRITICAL FINDINGS (리뷰 반영)

## 🔴 Critical Issues

### 1. @google/genai 타입 결합 (100+ 파일)
**영향 파일**:
- `packages/core/src/core/contentGenerator.ts` - `GenerateContentParameters`, `GenerateContentResponse`
- `packages/core/src/core/baseLlmClient.ts` - `Content`, `Part`, `GenerateContentConfig`
- `packages/core/src/core/turn.ts` - `PartListUnion`, `FunctionCall`, `FinishReason`
- `packages/core/src/core/geminiChat.ts` - 전체 988라인 Gemini 전용
- `packages/core/src/routing/routingStrategy.ts` - 라우팅 컨텍스트

### 2. GeminiEventType 종속성 (18개 이벤트)
```typescript
// 현재 GeminiEventType enum (turn.ts:52-71)
Content, ToolCallRequest, ToolCallResponse, ToolCallConfirmation,
UserCancelled, Error, ChatCompressed, Thought, MaxSessionTurns,
Finished, LoopDetected, Citation, Retry, ContextWindowWillOverflow,
InvalidStream, ModelInfo, AgentExecutionStopped, AgentExecutionBlocked
```
**결정 필요**:
- 옵션 A: LlmStreamEvent로 전면 교체 (기능 회귀 위험 높음)
- 옵션 B: 어댑터에서 매핑하고 기존 이벤트 유지 (권장)

### 3. 인증/설정 경로 Google 전용
- `AuthType` enum: `LOGIN_WITH_GOOGLE`, `USE_GEMINI`, `USE_VERTEX_AI` 등
- 환경변수: `GEMINI_API_KEY`, `GOOGLE_API_KEY` 전용

## 🟠 High Priority Issues

### 4. ModelConfigService 종속성
- `GenerateContentConfig` 타입에 완전 종속
- `ModelRouterService` 연동 필요

### 5. 유틸리티 레이어 결합
- `tokenCalculation.ts`: `Part`, `PartListUnion` 사용
- `partUtils.ts`: `GenerateContentResponse`, `PartListUnion` 사용
- `generateContentResponseUtilities.ts`: Gemini 응답 처리 전용

### 6. 테스트 마이그레이션 규모
- `geminiChat.test.ts`, `config.test.ts` 등 Gemini 전용 테스트

### 7. 🆕 Agent/Telemetry 레이어 결합 (Watch Items)
- `LocalAgentExecutor`가 `GeminiChat`에 직접 결합 (StreamEventType 소비)
- `telemetry/types.ts`가 `GenerateContentResponseUsageMetadata`에 직접 결합

---

# ARCHITECTURE DECISIONS

## AD-1: 이벤트 타입 전략
**결정**: 옵션 B - 어댑터 매핑 + 기존 이벤트 유지
```
LlmStreamEvent (공통) ←→ GeminiEventType (기존 유지)
                     ↘ ClaudeStreamEvent (신규)
                     ↘ OpenAIStreamEvent (신규)
```

## AD-2: 설정 모델 전략
**결정**: Provider-agnostic 설정 모델 도입 + 호환 레이어
```
LlmGenerateConfig (공통) → GenerateContentConfig (Gemini 변환)
                        → AnthropicConfig (Claude 변환)
                        → OpenAIConfig (OpenAI 변환)
```

## AD-3: 디렉토리 재구성 전략
**결정**: 점진적 이동 (Tidy First 원칙)
```
Phase 2 시작 시:
packages/core/src/core/geminiChat.ts → providers/gemini/chat.ts
packages/core/src/core/turn.ts → providers/gemini/turn.ts (Gemini 특화 부분)
                                → core/turn.ts (공통 인터페이스)
```

---

# PHASE DOCUMENTS

| Phase | 문서 | 기간 | 상태 |
|-------|------|------|------|
| 1 | [phase1_foundation_todolist.md](./phase1_foundation_todolist.md) | 2-3주 | ⏳ 대기 |
| 2 | [phase2_core_refactoring_todolist.md](./phase2_core_refactoring_todolist.md) | 3-4주 | ⏳ 대기 |
| 3 | [phase3_provider_extension_todolist.md](./phase3_provider_extension_todolist.md) | 3-4주 | ⏳ 대기 |

---

# MILESTONE SUMMARY (수정됨)

## Phase 1: 기반 작업 (2-3주)
| Milestone | 작업 | 기간 | 상태 | 리뷰 반영 |
|-----------|------|------|------|-----------|
| M1.0 | 코드 인벤토리/영향도 분석 | 3일 | ⬜ | ✅ 확대 |
| M1.1 | 타입/에러/호환 레이어 설계 | 3-4일 | ⬜ | ✅ 이벤트 매핑 |
| M1.2 | Adapter 인프라 구축 | 4-5일 | ⬜ | ✅ ModelSpec 연동 |
| M1.3 | Provider 선택 경로/Config 설계 | 2-3일 | ⬜ | ✅ AuthType 확장 |
| **M1.4** | **유틸리티/테스트 마이그레이션 계획** | **2일** | ⬜ | 🆕 신규 |

## Phase 2: 코어 리팩토링 (3-4주)
| Milestone | 작업 | 기간 | 상태 | 리뷰 반영 |
|-----------|------|------|------|-----------|
| **M2.0** | **디렉토리 재구성 (Tidy First)** | **2-3일** | ⬜ | 🆕 신규 |
| M2.1 | ContentGenerator/StreamEvent 타입 전환 | 5-7일 | ⬜ | ✅ 확대 + 래퍼 |
| M2.2 | GeminiChat 스트리밍 분해/합성기 적용 | 5-7일 | ⬜ | ✅ 이벤트 매핑 + StreamEventType + Agent 연동 |
| M2.3 | GeminiAdapter 구현/동등성 검증 | 4-5일 | ⬜ | ✅ 확대 |
| **M2.4** | **ModelConfigService 호환 레이어** | **2-3일** | ⬜ | 🆕 신규 |
| **M2.5** | **유틸리티 레이어 리팩토링** | **2-3일** | ⬜ | 🆕 신규 |
| **M2.6** | **라우팅 레이어 타입 독립화** | **2-3일** | ⬜ | 🆕 Critical |
| **M2.7** | **Agent/Telemetry 결합 해소** | **2-3일** | ⬜ | 🆕 Watch Items |

## Phase 3: 프로바이더 확장 (3-4주)
| Milestone | 작업 | 기간 | 상태 | 리뷰 반영 |
|-----------|------|------|------|-----------|
| M3.1 | Claude 어댑터/변환기 구현 | 4-5일 | ⬜ | - |
| M3.2 | OpenAI 어댑터/변환기 구현 | 3-4일 | ⬜ | - |
| M3.3 | OpenAI-Compatible 어댑터 템플릿 | 3일 | ⬜ | - |
| M3.4 | 통합 테스트/문서/안정화 | 5-7일 | ⬜ | - |
| **M3.5** | **테스트 마이그레이션** | **3-4일** | ⬜ | 🆕 신규 |

---

# TDD WORKFLOW

## Red → Green → Refactor 사이클

```
1. 실패하는 테스트 작성 (Red)
   └── 테스트가 명확히 실패하는지 확인

2. 최소한의 코드로 테스트 통과 (Green)
   └── 테스트 통과에 필요한 코드만 작성

3. 리팩토링 (Refactor)
   └── 테스트가 통과한 상태에서 코드 개선
   └── 구조적 변경은 별도 커밋
```

## 커밋 규칙

```
feat(providers): add LlmMessage type definition
^    ^           ^
│    │           └── 변경 내용 요약
│    └── 변경 범위
└── 변경 유형 (feat/fix/refactor/test/docs)

# 구조적 변경 vs 동작 변경 명시
refactor(providers): extract base adapter class [STRUCTURAL]
feat(providers): implement stream assembler [BEHAVIORAL]
```

---

# QUALITY GATES

## 각 Milestone 완료 조건
- [ ] 모든 단위 테스트 통과
- [ ] TypeScript 컴파일 에러 없음
- [ ] ESLint 경고 없음
- [ ] 기존 테스트 회귀 없음
- [ ] 문서 업데이트 완료

## 각 Phase 완료 조건
- [ ] 모든 Milestone 완료
- [ ] 통합 테스트 통과
- [ ] 코드 리뷰 완료
- [ ] 기능 회귀 없음

---

# RISK MANAGEMENT (업데이트)

| ID | 리스크 | 확률 | 영향 | 대응 | 리뷰 반영 |
|----|--------|------|------|------|-----------|
| R1 | 프로바이더별 기능 차이 | 높음 | 중간 | ModelSpec 기능 가용성 체크 | - |
| R2 | 타입 변환 복잡도 | 높음 | 높음 | StreamAssembler/Converter 테스트 강화 | - |
| R3 | 대규모 의존성 교체(100+ 파일) | 높음 | 높음 | 단계적 마이그레이션 | - |
| R4 | 인증/라우팅 경로 충돌 | 중간 | 높음 | 명시적 우선순위 규칙 | - |
| R5 | 하위 호환성 | 중간 | 높음 | 기능 플래그 + 기존 경로 유지 | - |
| **R6** | **GeminiEventType 매핑 누락** | **높음** | **높음** | **18개 이벤트 전수 매핑** | 🆕 |
| **R7** | **ModelConfigService 비호환** | **중간** | **높음** | **호환 레이어 + 점진적 전환** | 🆕 |
| **R8** | **유틸리티 레이어 회귀** | **중간** | **중간** | **유틸 전용 테스트 강화** | 🆕 |
| **R9** | **테스트 마이그레이션 규모** | **높음** | **중간** | **전용 마일스톤 할당** | 🆕 |
| **R10** | **라우팅 레이어 @google/genai 결합** | **높음** | **높음** | **M2.6 전용 마일스톤** | 🆕 Critical |
| **R11** | **LocalAgentExecutor ↔ GeminiChat 강한 결합** | **중간** | **높음** | **M2.2/M2.7에서 Agent 인터페이스 전환** | 🆕 |
| **R12** | **Telemetry usageMetadata 타입 결합** | **중간** | **중간** | **M2.1/M2.7에서 LlmUsage 전환** | 🆕 |

---

# DIRECTORY STRUCTURE (수정됨)

```
packages/core/src/
├── core/
│   ├── contentGenerator.ts    [수정] Provider-agnostic 인터페이스
│   ├── baseLlmClient.ts       [수정] 어댑터 기반으로 전환
│   ├── turn.ts                [분리] 공통 인터페이스만 유지
│   └── client.ts              [수정] 어댑터 의존성 주입
│
├── providers/
│   ├── types.ts               # 프로바이더 독립 타입
│   ├── errors.ts              # 통합 에러 타입
│   ├── events.ts              # 🆕 LlmStreamEvent (공통)
│   ├── legacyAliases.ts       # 레거시 타입 별칭
│   ├── baseAdapter.ts         # 기본 어댑터 추상 클래스
│   ├── registry.ts            # 프로바이더 레지스트리
│   ├── factory.ts             # 프로바이더 팩토리
│   ├── streamAssembler.ts     # 스트림 합성기
│   ├── contentResolver.ts     # 콘텐츠 변환기
│   ├── modelSpec.ts           # 모델 스펙 정의
│   ├── configAdapter.ts       # 🆕 ModelConfigService 호환 레이어
│   │
│   ├── gemini/
│   │   ├── adapter.ts
│   │   ├── converter.ts
│   │   ├── eventMapper.ts     # 🆕 GeminiEventType ↔ LlmStreamEvent
│   │   ├── types.ts           # 🆕 GeminiEventType, 특화 타입 이동
│   │   ├── chat.ts            # 🆕 geminiChat.ts 이동
│   │   └── turn.ts            # 🆕 Gemini 특화 Turn 로직
│   │
│   ├── claude/
│   │   ├── adapter.ts
│   │   ├── converter.ts
│   │   └── eventMapper.ts
│   │
│   ├── openai/
│   │   ├── adapter.ts
│   │   ├── converter.ts
│   │   └── eventMapper.ts
│   │
│   └── openai-compatible/
│       ├── adapter.ts
│       └── converter.ts
│
├── utils/
│   ├── tokenCalculation.ts    [수정] 프로바이더 독립화
│   ├── partUtils.ts           [수정] 프로바이더 독립화
│   └── llmUtils.ts            # 🆕 공통 LLM 유틸리티
│
└── services/
    └── modelConfigService.ts  [수정] 호환 레이어 추가
```

---

# OPEN QUESTIONS (결정 필요)

| ID | 질문 | 상태 | 결정 |
|----|------|------|------|
| Q1 | GeminiEventType 유지 vs LlmStreamEvent 전면 교체? | ✅ 결정됨 | 어댑터 매핑 + 기존 유지 |
| Q2 | ModelConfigService의 GenerateContentConfig 의존 유지? | ✅ 결정됨 | 호환 레이어로 전환 |
| Q3 | GeminiClient/ContentGenerator 이름 변경 필요? | ⏳ 논의 필요 | - |
| Q4 | 기존 API 안정성 요구사항? | ⏳ 확인 필요 | - |
| Q5 | LocalAgentExecutor의 신규 인터페이스 형태? | ⏳ 논의 필요 | AgentChat vs ContentGenerator |
| Q6 | Telemetry usage 표준 스키마 정의? | ⏳ 논의 필요 | LlmUsage/LlmTokenUsage |

---

# STATUS LEGEND

| 기호 | 의미 |
|------|------|
| ⬜ | 대기 (Not Started) |
| 🔄 | 진행 중 (In Progress) |
| ✅ | 완료 (Completed) |
| ⏳ | 대기 중 (Waiting) |
| 🚧 | 차단됨 (Blocked) |
| ❌ | 취소 (Cancelled) |
| 🆕 | 신규 추가 |

---

# CHANGE LOG

| 날짜 | 버전 | 변경 내용 |
|------|------|----------|
| 2026-02-01 | 0.1 | 초안 작성 |
| 2026-02-01 | 0.2 | 소스코드 기반 리뷰 반영: 일정 조정(8-10주), 신규 마일스톤 추가(M1.4, M2.0, M2.4, M2.5, M3.5), 리스크 R6-R9 추가, 아키텍처 결정 문서화, 디렉토리 구조 상세화 |
| 2026-02-01 | 0.3 | 2차 리뷰 반영: M2.6 라우팅 레이어 신규 [Critical], M2.1 래퍼 클래스 추가, M2.2 StreamEventType 매핑 추가, 리스크 R10 추가, 디렉토리 구조 일관성 확보 (types.ts, eventMapper.ts), 테스트 파일 참조 정정 |
| 2026-02-01 | 0.4 | 최종 리뷰 반영: Agent/Telemetry Watch Items 추가(M2.7), LocalAgentExecutor 결합 해소 명시, Telemetry usage 타입 전환 명시, 리스크 R11-R12 추가, Open Questions 보강 |
