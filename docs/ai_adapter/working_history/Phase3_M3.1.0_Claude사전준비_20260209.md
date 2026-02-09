# M3.1.0 작업 결과서 — Claude 사전 준비 (SDK 설치 + bootstrap + 디렉토리)

- **작업일**: 2026-02-09
- **브랜치**: `DID/v0.1`
- **상태**: ✅ 완료

## 작업 목표

Claude 프로바이더의 기초 인프라를 구성한다:

1. `@anthropic-ai/sdk` 의존성 설치
2. `providers/claude/` 디렉토리 생성
3. Skeleton `ClaudeAdapter` (BaseAdapter 상속)
4. `bootstrapClaudeProvider()` — has() 가드 패턴으로 ProviderRegistry에 등록

## 작업 순서 및 결과

| 순서 | Sub-task | 작업 내용                                                 | 테스트 결과 |
| ---- | -------- | --------------------------------------------------------- | ----------- |
| 1    | 3.1.0.1  | `@anthropic-ai/sdk@^0.74.0` 설치                          | N/A         |
| 2    | 3.1.0.2  | Skeleton ClaudeAdapter + bootstrapClaudeProvider + 테스트 | 7/7 PASS    |

## 변경 파일 상세

### 3.1.0.1: SDK 설치

**수정 파일**: `packages/core/package.json`

- `@anthropic-ai/sdk: ^0.74.0` 추가 (설계서 `^0.30.0`보다 최신)
- SDK v0.74.0에서 확인된 주요 타입:
  - `MessageCreateParams`, `Message`, `RawMessageStreamEvent`
  - `ToolUseBlock`, `ThinkingBlock`, `URLImageSource`
  - `MessageCountTokensParams` / `MessageTokensCount` (토큰 카운팅 API)
  - `ToolChoiceNone` (설계서에 없는 신규 타입)
  - Error hierarchy: `APIError` → `BadRequestError`, `AuthenticationError`,
    `RateLimitError`, `NotFoundError` 등

### 3.1.0.2: bootstrapClaudeProvider + Skeleton Adapter

**신규 파일 3개**:

#### `providers/claude/adapter.ts` — Skeleton ClaudeAdapter

- `ClaudeAdapter extends BaseAdapter`
- `providerName = 'claude'`
- `capabilities`: streaming, toolCalls, imageInput, tokenCount, systemMessage,
  thought 지원 / imageGeneration, embedding 미지원
- `ClaudeClient` 인터페이스: `{ messages: { create, countTokens? } }`
- `generateContent()`, `generateContentStream()`, `mapToProviderConfig()`: throw
  "not yet implemented (M3.1.1)"
- `client` 필드: `protected readonly` (M3.1.1에서 사용, TS6138 방지)

#### `providers/claude/bootstrap.ts` — bootstrapClaudeProvider()

- `bootstrapClaudeProvider(registry?)`: ProviderRegistry에 Claude 팩토리 등록
- `has('claude')` 가드 패턴으로 중복 등록 안전성 확보
- 팩토리 내부: `new Anthropic({ apiKey, baseURL })` →
  `new ClaudeAdapter(config, client)`
- Gemini 부트스트랩과 동일한 패턴 적용

#### `providers/claude/index.ts` — re-export

- `ClaudeAdapter`, `ClaudeClient`, `bootstrapClaudeProvider` export

**테스트 파일**: `providers/claude/bootstrap.test.ts` (7개 테스트)

| #   | 테스트                     | 검증 내용                             |
| --- | -------------------------- | ------------------------------------- |
| 1   | 등록 확인                  | `has('claude')` false → true          |
| 2   | 중복 호출 안전성           | 2회 호출 시 throw 없음                |
| 3   | 어댑터 생성                | `providerName === 'claude'`           |
| 4   | 싱글톤 사용                | 인수 없이 호출 시 싱글톤 레지스트리   |
| 5   | apiKey 전달                | `Anthropic({ apiKey: 'my-api-key' })` |
| 6   | baseURL 전달               | `Anthropic({ baseURL: '...' })`       |
| 7   | undefined apiKey 안전 처리 | `Anthropic({ apiKey: undefined })`    |

## Quality Gate

| 항목          | 결과                       |
| ------------- | -------------------------- |
| TypeCheck     | ✅ PASS                    |
| ESLint        | ✅ PASS                    |
| 부트스트랩    | ✅ 7/7 PASS                |
| Provider 회귀 | ✅ 26 files / 450 passed   |
| Core 전체     | ✅ 263 files / 4885 passed |

**변화**: 기준선 262 files / 4878 → +1 file, +7 tests

## 설계 결정

### ClaudeClient 인터페이스 vs SDK 직접 타입

- **결정**: 자체 `ClaudeClient` 인터페이스 정의
- **근거**: GeminiAdapter의 `GeminiModelsApi` 패턴과 동일. SDK 타입 직접 의존
  대신 minimal 인터페이스로 DI/테스트 용이성 확보.

### protected vs private client 필드

- **결정**: `protected readonly client`
- **근거**: TypeScript `noUnusedLocals` 옵션 활성 시 `private`은 미사용 경고
  (TS6138) 발생. Skeleton 단계에서 아직 `client`를 사용하지 않으므로 `protected`
  로 변경하여 경고 해소. M3.1.1에서 실제 사용 시 의미적으로도 적합.

### SDK 버전 ^0.74.0

- **결정**: 설계서의 `^0.30.0` 대신 최신 `^0.74.0` 사용
- **근거**: npm 최신 버전 설치. v0.74.0에서 URLImageSource, ThinkingConfig,
  ToolChoiceNone, token counting API 등 추가 기능 확인. 설계서 시점 대비 API
  surface가 확장되었으며, 하위 호환성 유지.

### capabilities 값

- **결정**: `supportsThought: true`, `supportsTokenCount: true`
- **근거**: SDK v0.74.0에서 ThinkingConfig (extended thinking),
  MessageCountTokensParams (토큰 카운팅) API 확인. 설계서에서
  `supportsThought: false`였으나 SDK 진화를 반영.

## 향후 작업

- M3.1.1: ClaudeAdapter 구현 (generate, stream, converter 연동)
- M3.1.2: Claude 메시지 변환기 (LlmMessage ↔ Anthropic MessageParam)
- M3.1.3: Claude 스트림 변환기 (RawMessageStreamEvent → LlmEvent)
- M3.1.4: Claude 에러 매핑 (APIError → LlmError)

## 리뷰 반영 (2026-02-09)

### 이슈 1 (중간): Claude bootstrap 런타임 연결

**문제**: `contentGenerator.ts`의 멀티프로바이더 분기에서
`bootstrapGeminiProvider()`만 호출되고 `bootstrapClaudeProvider()`는 미호출.
`LLM_PROVIDER=claude` 시 `Provider not registered` 실패.

**수정**: `contentGenerator.ts`에 `bootstrapClaudeProvider()` import 및 호출
추가. 비-Gemini 분기에서 `bootstrapGeminiProvider()` 직후에 호출.

```typescript
bootstrapGeminiProvider();
bootstrapClaudeProvider();
```

**회귀 테스트 추가** (1개):

| #   | 시나리오                                       | 기대 결과                           | 결과 |
| --- | ---------------------------------------------- | ----------------------------------- | ---- |
| 10  | flag=true, LLM_PROVIDER=claude, 수동 등록 없음 | auto-bootstrap로 Claude 어댑터 생성 | ✅   |

### 이슈 2 (낮음): capability 선언과 실제 구현 상태 불일치

**문제**: `supportsTokenCount: true` 선언되었으나 `countTokens` 미구현 →
`BaseAdapter` 기본 구현이 "countTokens must be implemented" throw. capability
기반 분기 코드가 "지원됨"으로 판단 후 호출 시 실패 가능.

**수정**: Skeleton 상태를 반영하여 미구현 기능의 capability를 `false`로 변경.
`supportsSystemMessage: true`만 유지 (passive capability — converter에서 처리).

```typescript
supportsStreaming: false,      // M3.1.1
supportsToolCalls: false,      // M3.1.2
supportsImageInput: false,     // M3.1.2
supportsTokenCount: false,     // M3.1.1
supportsThought: false,        // M3.1.3
supportsSystemMessage: true,   // passive (maintained)
```

### 이슈 3 (낮음): providers 배럴 export에서 Claude 미노출

**문제**: `providers/index.ts`에서 Gemini namespace만 export.
`@google/gemini-cli-core/providers` 경로로 Claude API 접근 불가.

**수정**: `providers/index.ts`에 Claude namespace export 추가.

```typescript
import * as Claude from './claude/index.js';
export { Claude };
```

### Quality Gate (리뷰 반영 후)

| 항목        | 결과                                                    |
| ----------- | ------------------------------------------------------- |
| TypeCheck   | ✅ PASS                                                 |
| ESLint      | ✅ PASS                                                 |
| 관련 테스트 | ✅ 13/13 (multiProvider)                                |
| 회귀 테스트 | ✅ 29 files / 493 passed (providers + contentGenerator) |

## 커밋

- `56a0433f9` feat(providers): M3.1.0 — Claude 사전 준비 (SDK + bootstrap +
  skeleton adapter)
- `(커밋 ID 기록 예정)` fix(providers): M3.1.0 리뷰 반영 — Claude bootstrap
  런타임 연결 + capability 보정 + barrel export
