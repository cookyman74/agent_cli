# Hotfix: OpenAI tool_call_id 길이 초과 + 비-Gemini Hook 누락 + /about 브랜딩 수정

> **작업일**: 2026-02-21 **브랜치**: `v0.2.0/se_manager_agent` **버전**: 0.2.13
> **범위**: Core 버그 2건 (tool_call_id, Hook cumulativeResponse) + CLI /about
> 브랜딩 수정

---

## 1. OpenAI tool_call_id 길이 초과 (400 Error)

### 1.1 증상

OpenAI 프로바이더 사용 시 다음 에러 발생:

```
[API Error: 400 Invalid 'messages[13].tool_call_id': string too long.
Expected a string with maximum length 40, but got a string with length 45 instead.]
```

### 1.2 근본 원인

`packages/core/src/providers/gemini/turn.ts:283`의 fallback ID 생성 포맷:

```typescript
// Before
const callId =
  fnCall.id ??
  `${fnCall.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
```

| 구성 요소         | 예시             | 길이      |
| ----------------- | ---------------- | --------- |
| `fnCall.name`     | `list_directory` | 14        |
| `-`               |                  | 1         |
| `Date.now()`      | `1740000000000`  | 13        |
| `-`               |                  | 1         |
| `Math.random(16)` | `a1b2c3d4e5f6g7` | 12~16     |
| **합계**          |                  | **41~45** |

OpenAI API는 `tool_call_id` 최대 40자를 요구하므로, 긴 도구명(`list_directory`,
`read_file` 등)에서 초과 발생.

### 1.3 기존 버그 여부

**기존 (upstream) 버그**. upstream Gemini CLI PR #18600에서도 동일 이슈를 수정함
(포맷: `${name}_${Date.now()}_${counter}`). 단, 이 포맷도 긴 도구명에서 40자를
초과할 수 있어 완전한 해결이 아님.

### 1.4 수정 내용

**A. 근본 수정**: `turn.ts` — `crypto.randomUUID()` (항상 36자)

```typescript
// After
const callId = fnCall.id ?? crypto.randomUUID();
// e.g. "550e8400-e29b-41d4-a716-446655440000" (36 chars, always)
```

**B. 방어적 수정**: `converter.ts` — SHA-256 해시 기반 `sanitizeToolCallId()`

```typescript
const OPENAI_TOOL_CALL_ID_MAX_LENGTH = 40;
const sanitizedIdCache = new Map<string, string>();

function sanitizeToolCallId(id: string): string {
  if (id.length <= OPENAI_TOOL_CALL_ID_MAX_LENGTH) {
    return id;
  }
  const cached = sanitizedIdCache.get(id);
  if (cached) return cached;
  const hash = crypto.createHash('sha256').update(id).digest('hex');
  const tail = id.slice(-5);
  const sanitized = `tc_${tail}${hash.substring(0, 32)}`; // 3+5+32 = 40
  sanitizedIdCache.set(id, sanitized);
  return sanitized;
}
```

적용 위치:

- `convertToolMessage()`:
  `tool_call_id: sanitizeToolCallId(toolResult.toolCallId)`
- `extractToolCalls()`: `id: sanitizeToolCallId(c.id)`

### 1.5 변경 파일

| 파일                                                   | 변경 내용                                            | 규모  |
| ------------------------------------------------------ | ---------------------------------------------------- | ----- |
| `packages/core/src/providers/gemini/turn.ts:283`       | fallback ID → `crypto.randomUUID()`                  | 1줄   |
| `packages/core/src/providers/openai/converter.ts`      | SHA-256 해시 기반 `sanitizeToolCallId()` + 캐시      | +30줄 |
| `packages/core/src/core/turn.test.ts:179`              | fallback ID regex → UUID 패턴으로 변경               | 1줄   |
| `packages/core/src/providers/openai/converter.test.ts` | 5개 sanitize 테스트 (충돌 방지 + 결정론적 검증 포함) | +95줄 |

### 1.6 테스트

| 테스트                                                                     | 설명                                                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------- |
| `should sanitize tool_call_id exceeding 40 chars via hash`                 | 45자 ID → 해시 기반 40자 변환 검증                    |
| `should sanitize tool_calls[].id exceeding 40 chars in assistant messages` | assistant 메시지 내 초과 ID 변환 검증                 |
| `should not sanitize tool_call_id within 40 chars`                         | 40자 이하 ID 원본 보존 검증                           |
| `should produce different sanitized IDs for different overlong inputs`     | 앞 40자 동일한 긴 ID 2개 → 서로 다른 결과 (충돌 없음) |
| `should produce deterministic sanitized IDs`                               | 동일 입력 → 동일 출력 (캐시 + 해시 결정론)            |

---

## 2. 비-Gemini 프로바이더 Hook cumulativeResponse 누락

### 2.1 증상

Claude/OpenAI 프로바이더로 요청 시 AfterAgent Hook을 통해 대화 내용이 DB에
저장되지 않음. Gemini 프로바이더에서는 정상 동작.

### 2.2 근본 원인

`packages/core/src/core/client.ts`의 `processTurn()` 메서드에서:

```
[Gemini 경로]
line 720: Gemini API 호출 루프
line 776: isError → return turn (cumulativeResponse 미누적)  ← 에러 가드
line 780: hookState.cumulativeResponse += responseText  ← 정상 시만 축적

[비-Gemini 경로 (수정 전)]
line 686: processLlmTurn() 호출
line 696: return turn;  ← cumulativeResponse 업데이트 없이 즉시 반환 — 버그
```

### 2.3 수정 내용

`client.ts` — 비-Gemini 경로에서 `yield*` 대신 수동 이터레이션으로 에러 감지 +
조건부 누적:

```typescript
// Manual iteration to intercept events while delegating yield
let isProviderError = false;
const llmStream = this.processLlmTurn(...);
let iterResult = await llmStream.next();
while (!iterResult.done) {
  const event = iterResult.value;
  if (event.type === LlmEventType.Error) {
    isProviderError = true;
  }
  iterResult = await llmStream.next(yield event);
}
turn = iterResult.value;

// Skip on error (mirrors Gemini path line 776)
if (!isProviderError) {
  // ... cumulativeResponse 누적 로직
}
```

**Gemini 경로와의 대칭:**

| 동작      | Gemini 경로                           | 비-Gemini 경로 (수정 후)                       |
| --------- | ------------------------------------- | ---------------------------------------------- |
| 정상 응답 | line 780: 누적                        | line 714: 누적                                 |
| 에러 응답 | line 776: `return turn` (누적 건너뜀) | line 712: `isProviderError` 가드 (누적 건너뜀) |

### 2.4 변경 파일

| 파일                               | 변경 내용                                            | 규모                   |
| ---------------------------------- | ---------------------------------------------------- | ---------------------- |
| `packages/core/src/core/client.ts` | `yield*` → 수동 이터레이션 + 에러 감지 + 조건부 누적 | +25줄 (기존 13줄 대체) |

---

## 3. /about 명령어 브랜딩 수정

### 3.1 증상

`/about` 실행 시 다음 문제 확인:

- 타이틀: "About Gemini CLI" → "About Didim Agent-cli"로 변경 필요
- Provider 정보 미표시 (어떤 프로바이더를 사용 중인지 알 수 없음)

### 3.2 수정 내용

**A. 타이틀 변경**: "About Gemini CLI" → "About Didim Agent-cli"

**B. Provider 필드 추가**: `resolveActiveProvider()` 유틸을 사용하여 실제 활성
프로바이더 표시

Provider 해석 우선순위 (`resolveActiveProvider.ts`):

1. settings의 `selectedProvider` (UI 설정 값)
2. `LLM_PROVIDER` 환경변수
3. API 키 기반 자동감지 (`ANTHROPIC_API_KEY` → claude, `OPENAI_API_KEY` →
   openai)
4. fallback: `'gemini'`

```typescript
// aboutCommand.ts
import { resolveActiveProvider } from '../utils/resolveActiveProvider.js';

const settingsProvider =
  context.services.settings.merged.security.auth.selectedProvider || '';
const selectedProvider = resolveActiveProvider(settingsProvider);
```

### 3.3 변경 파일

| 파일                                                         | 변경 내용                                                 | 규모  |
| ------------------------------------------------------------ | --------------------------------------------------------- | ----- |
| `packages/cli/src/ui/components/AboutBox.tsx`                | 타이틀 변경 + `selectedProvider` prop/렌더링 추가         | +12줄 |
| `packages/cli/src/ui/commands/aboutCommand.ts`               | `resolveActiveProvider()` 적용                            | +4줄  |
| `packages/cli/src/ui/types.ts`                               | `HistoryItemAbout`에 `selectedProvider: string` 추가      | +1줄  |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`      | AboutBox에 `selectedProvider` prop 전달                   | +1줄  |
| `packages/cli/src/ui/components/AboutBox.test.tsx`           | defaultProps에 `selectedProvider` 추가 + Provider 테스트  | +4줄  |
| `packages/cli/src/ui/commands/aboutCommand.test.ts`          | mock settings + env fallback/normalize 테스트 2개 추가    | +60줄 |
| `packages/cli/src/ui/components/HistoryItemDisplay.test.tsx` | about item에 `selectedProvider` 추가 + 타이틀 기댓값 변경 | +2줄  |

---

## 4. 버전 업데이트

| 파일                                                       | Before | After  |
| ---------------------------------------------------------- | ------ | ------ |
| `packages/core/package.json` version                       | 0.2.12 | 0.2.13 |
| `packages/cli/package.json` version                        | 0.2.12 | 0.2.13 |
| `packages/cli/package.json` dep `@didim365/agent-cli-core` | 0.2.12 | 0.2.13 |

---

## 5. 전체 변경 파일 목록 (14개)

| #   | 파일                                                         | 유형                              |
| --- | ------------------------------------------------------------ | --------------------------------- |
| 1   | `packages/core/src/providers/gemini/turn.ts`                 | 버그 수정 (tool_call_id)          |
| 2   | `packages/core/src/providers/openai/converter.ts`            | 방어적 수정 (SHA-256 sanitize)    |
| 3   | `packages/core/src/core/client.ts`                           | 버그 수정 (Hook 누락 + 에러 가드) |
| 4   | `packages/core/src/core/turn.test.ts`                        | 테스트 갱신                       |
| 5   | `packages/core/src/providers/openai/converter.test.ts`       | 테스트 추가 (+5개)                |
| 6   | `packages/core/package.json`                                 | 버전 0.2.13                       |
| 7   | `packages/cli/src/ui/components/AboutBox.tsx`                | 브랜딩 수정 + Provider            |
| 8   | `packages/cli/src/ui/commands/aboutCommand.ts`               | resolveActiveProvider 적용        |
| 9   | `packages/cli/src/ui/types.ts`                               | 타입 확장                         |
| 10  | `packages/cli/src/ui/components/HistoryItemDisplay.tsx`      | prop 전달                         |
| 11  | `packages/cli/src/ui/components/AboutBox.test.tsx`           | 테스트 갱신                       |
| 12  | `packages/cli/src/ui/commands/aboutCommand.test.ts`          | 테스트 갱신 + 추가 (+2개)         |
| 13  | `packages/cli/src/ui/components/HistoryItemDisplay.test.tsx` | 테스트 갱신                       |
| 14  | `packages/cli/package.json`                                  | 버전 0.2.13 + dep                 |

---

## 6. 검증 결과

```
Core 전체:  288 files, 5757 tests  — ALL PASSED (24 skipped)
CLI 전체:   351 files, 4800 tests  — ALL PASSED (2 skipped)
```

| 관련 테스트                                 | 결과 |
| ------------------------------------------- | ---- |
| `turn.test.ts` — fallback UUID 검증         | PASS |
| `converter.test.ts` — 74 tests (+5 신규)    | PASS |
| `client.test.ts` — 96 tests (1 skipped)     | PASS |
| `AboutBox.test.tsx` — 7 tests (+1 Provider) | PASS |
| `aboutCommand.test.ts` — 8 tests (+2 신규)  | PASS |
| `HistoryItemDisplay.test.tsx` — 26 tests    | PASS |

---

## 7. 참고: /about에서 CLI Version이 0.30.0으로 표시되는 문제

### 정확한 메커니즘

```
esbuild.config.js:24  → pkg = require('./package.json')  // 루트 package.json
esbuild.config.js:85  → define: { 'process.env.CLI_VERSION': JSON.stringify(pkg.version) }
                          ↓ 번들 시 문자열 치환
version.ts:16          → return process.env['CLI_VERSION'] || pkgJson?.version || 'unknown'
                          ↓ 번들 환경에서는 항상 esbuild 주입값 우선
```

| 환경                            | `CLI_VERSION` 소스                                 | 결과             |
| ------------------------------- | -------------------------------------------------- | ---------------- |
| **번들** (`npm run bundle`)     | `루트 package.json` → `0.30.0` (upstream 버전)     | "0.30.0"         |
| **dev** (`npm run start`)       | 미주입 → `__dirname` 기준 가장 가까운 package.json | core의 "0.2.13"  |
| **tsc build** (`npm run build`) | 미주입 → dist/ 경로에서 package.json 탐색          | 경로에 따라 다름 |

### 근본 원인

`esbuild.config.js:24`가 **루트** `package.json`(upstream 0.30.0)을 읽어
`CLI_VERSION`을 주입. 워크스페이스 패키지 버전(0.2.13)과 루트 버전이 독립적으로
관리되어 불일치 발생.

### 해결 방안

| 방안                                 | 설명                                                  | 트레이드오프             |
| ------------------------------------ | ----------------------------------------------------- | ------------------------ |
| A. esbuild에서 cli package.json 읽기 | `require('./packages/cli/package.json').version`      | 번들 설정 수정 필요      |
| B. 루트 버전 동기화                  | 루트 package.json 버전을 워크스페이스와 일치시킴      | upstream merge 시 충돌   |
| C. 현 상태 유지                      | `npm run start`(dev)에서는 정상, 번들에서만 루트 버전 | 번들 사용 시 버전 불일치 |

현재는 **C (현 상태 유지)** — 번들 배포 시 루트 버전과 워크스페이스 버전의
의미가 다름을 인지하고, 필요 시 A 방안을 적용 예정.

---

## 8. 리뷰 후 추가 수정 (2026-02-21)

### [HIGH] Issue #1: sanitizeToolCallId() 절단 방식 충돌 위험

**문제**: 초기 구현의 `substring(0, 40)` 방식은 앞 40자가 동일한 서로 다른 긴
ID에서 동일 결과를 생성하여 충돌 가능. OpenAI 요청 거절 또는 tool result 매칭
혼선 발생 가능.

**재현**: 앞 40자가 같고 뒤만 다른 ID 2개를 넣으면 `tool_calls[].id`가 동일
문자열로 변환됨.

**수정**: SHA-256 해시 기반 방식으로 교체.

```typescript
// Before: 단순 절단 — 충돌 위험
return id.substring(0, OPENAI_TOOL_CALL_ID_MAX_LENGTH);

// After: SHA-256 해시 — 실질적 충돌 불가
const hash = crypto.createHash('sha256').update(id).digest('hex');
const tail = id.slice(-5); // 디버깅용 원본 끝 5자
const sanitized = `tc_${tail}${hash.substring(0, 32)}`; // 3+5+32 = 40
```

**설계 결정**:

- `tc_` prefix: 해시 기반 ID임을 시각적으로 구분
- `tail` (마지막 5자): 디버그 시 원본 ID 추적 용이
- SHA-256 32 hex chars: 2^128 가능한 값 → 실질적 충돌 불가
- `sanitizedIdCache`: 동일 입력의 반복 호출 시 해시 재계산 방지 + 결정론적 보장

**테스트 추가**: 충돌 방지 검증 + 결정론적 동작 검증 (2개)

### [MEDIUM] Issue #2: non-Gemini 에러 턴의 cumulativeResponse 누적 방지

**문제**: 초기 수정은 `yield*`로 모든 이벤트를 위임한 후 무조건
`cumulativeResponse`에 누적. `processLlmTurn()`이 `LlmEventType.Error`를
yield해도 상위에서 인지할 수 없어, 에러/부분 응답이 "최종 응답"으로 DB에 기록됨.

**비교**: Gemini 경로(line 776)는 `isError` 시 `return turn;`으로 누적을 건너뜀.

**수정**: `yield*` 대신 수동 이터레이션으로 교체하여 에러 이벤트 감지.

```typescript
// Before: yield* — 에러 인지 불가
turn = yield* this.processLlmTurn(...);
// 무조건 누적

// After: 수동 이터레이션 — 에러 감지 후 조건부 누적
let isProviderError = false;
const llmStream = this.processLlmTurn(...);
let iterResult = await llmStream.next();
while (!iterResult.done) {
  if (iterResult.value.type === LlmEventType.Error) {
    isProviderError = true;
  }
  iterResult = await llmStream.next(yield iterResult.value);
}
turn = iterResult.value;
if (!isProviderError) { /* 누적 */ }
```

### [MEDIUM] Issue #3: /about Provider 표시 — 실제 활성 provider 반영

**문제**: `settings.merged.security.auth.selectedProvider`만 표시하여, env 기반
활성 provider(`LLM_PROVIDER`, API 키 자동감지)와 불일치 가능. 운영 중 provider
진단 시 오판 위험.

**수정**: 기존 `resolveActiveProvider()` 유틸 활용으로 settings + env + API 키
감지 통합.

```typescript
// Before: settings만 참조
const selectedProvider =
  context.services.settings.merged.security.auth.selectedProvider || '';

// After: resolveActiveProvider() — 4단계 fallback
import { resolveActiveProvider } from '../utils/resolveActiveProvider.js';
const settingsProvider =
  context.services.settings.merged.security.auth.selectedProvider || '';
const selectedProvider = resolveActiveProvider(settingsProvider);
```

`normalizeProviderKey()` 정규화도 자동 적용 (e.g., `'anthropic'` → `'claude'`).

**테스트 추가**: env fallback 검증 + 프로바이더 키 정규화 검증 (2개)

### [LOW] Issue #4: 작업결과서 "stale build artifact" 설명 보강

**문제**: 기존 설명은 "stale dist/ 내 package.json"으로 기술했으나, 실제
메커니즘은 esbuild의 `define` 옵션에 의한 루트 `package.json` 버전 주입.

**수정**: 섹션 7을 정확한 코드 경로 (`esbuild.config.js:24,85` →
`version.ts:16`)와 환경별 동작 차이 표로 재작성. 루트 버전(0.30.0)과
워크스페이스 버전(0.2.13) 불일치 원인 및 해결 방안 3가지 제시.

### 리뷰 수정 후 추가 변경 파일

| 파일                                                   | 변경 내용                                                | 규모              |
| ------------------------------------------------------ | -------------------------------------------------------- | ----------------- |
| `packages/core/src/providers/openai/converter.ts`      | `substring` → SHA-256 해시 + 캐시                        | +20줄 (기존 대체) |
| `packages/core/src/providers/openai/converter.test.ts` | 충돌 방지 + 결정론 테스트 2개 추가, 기존 3개 기대값 갱신 | +35줄             |
| `packages/core/src/core/client.ts`                     | `yield*` → 수동 이터레이션 + `isProviderError` 가드      | +12줄 (기존 대체) |
| `packages/cli/src/ui/commands/aboutCommand.ts`         | `resolveActiveProvider()` import + 적용                  | +2줄              |
| `packages/cli/src/ui/commands/aboutCommand.test.ts`    | env fallback + normalize 테스트 2개 추가                 | +58줄             |

### 리뷰 수정 후 검증 결과

| 테스트                                     | 결과                    |
| ------------------------------------------ | ----------------------- |
| Core 전체 (288 files, 5757 tests)          | ALL PASSED (24 skipped) |
| CLI 전체 (351 files, 4800 tests)           | ALL PASSED (2 skipped)  |
| `converter.test.ts` — 74 tests (+5 신규)   | PASS                    |
| `client.test.ts` — 96 tests                | PASS                    |
| `aboutCommand.test.ts` — 8 tests (+2 신규) | PASS                    |

---

## 9. 2차 리뷰 후 추가 수정 (2026-02-21)

### [HIGH] Issue #1: CLI typecheck 실패 — `selectedProvider` 타입 누락

**문제**: `slashCommandProcessor.ts`의 ABOUT 메시지 구성에서 `selectedProvider`
필드 누락, `Message` ABOUT variant에도 해당 필드 미선언으로 `npm run typecheck`
실패.

**수정**:

```typescript
// packages/cli/src/ui/hooks/slashCommandProcessor.ts:181
historyItemContent = {
  type: 'about',
  // ... existing fields ...
  selectedProvider: message.selectedProvider ?? '',  // ← 추가
  // ...
};

// packages/cli/src/ui/types.ts — Message ABOUT variant
{
  type: MessageType.ABOUT;
  // ... existing fields ...
  selectedProvider?: string;  // ← 추가
}
```

### [MEDIUM] Issue #2: /about Provider 표시 — 런타임 프로바이더 불일치

**문제**: 1차 리뷰에서 적용한 `resolveActiveProvider()`는 CLI 레벨 유틸이며,
Core의 `selectProvider()` 로직(authType 우선순위, 모델명 기반 감지)과 결과가
다를 수 있음. 실제 런타임에서 사용 중인 프로바이더와 /about 표시가 불일치 가능.

**수정**: Core의 ContentGenerator에서 실제 런타임 프로바이더 이름을 읽어오고,
`resolveActiveProvider()`는 pre-auth 등 ContentGenerator 미가용 시의
fallback으로만 사용:

```typescript
// aboutCommand.ts — 런타임 프로바이더 우선, resolveActiveProvider fallback
const runtimeProvider =
  context.services.config?.getContentGenerator()?.providerName;
const selectedProvider =
  runtimeProvider ||
  resolveActiveProvider(
    context.services.settings.merged.security.auth.selectedProvider || '',
  );
```

**테스트 갱신**: `beforeEach` mock에 `getContentGenerator` 추가, env
fallback/normalize 테스트는
`getContentGenerator: vi.fn().mockReturnValue(undefined)`로 설정하여 fallback
경로를 정확히 검증.

### [LOW] Issue #3: sanitizedIdCache 무한 증가 방지

**문제**: `sanitizedIdCache`는 모듈 전역 Map으로, 장시간 실행 세션에서 무한 증가
가능. 실질적으로 한 턴에 40자 초과 ID는 극소수이나, 장시간 세션에서 수만 건 이상
축적되면 메모리 부담.

**수정**: 10,000건 하드캡 추가. 캡 도달 시 전체 clear (단일 턴 내 round-trip
일관성은 실질적으로 보존됨):

```typescript
const SANITIZED_ID_CACHE_MAX_SIZE = 10_000;

function sanitizeToolCallId(id: string): string {
  // ... existing logic ...
  if (sanitizedIdCache.size >= SANITIZED_ID_CACHE_MAX_SIZE) {
    sanitizedIdCache.clear();
  }
  sanitizedIdCache.set(id, sanitized);
  return sanitized;
}
```

### [LOW] Issue #4: yield\* 위임 의미론 상실 — 스트림 정리 위험

**문제**: 1차 리뷰에서 `yield*`를 수동 이터레이션으로 교체했으나, `yield*`가
제공하는 암묵적 `.return()` 호출(소비자가 조기 종료 시 내부 제너레이터 정리)이
누락됨. 외부 제너레이터가 조기 종료되면 내부 `processLlmTurn()` 제너레이터의
finally 블록이 실행되지 않아 리소스 누수 가능.

**수정**: `try/finally`로 감싸고 `llmStream.return()` 호출 추가:

```typescript
const llmStream = this.processLlmTurn(...);
try {
  let iterResult = await llmStream.next();
  while (!iterResult.done) {
    const event = iterResult.value;
    if (event.type === LlmEventType.Error) {
      isProviderError = true;
    }
    iterResult = await llmStream.next(yield event);
  }
  turn = iterResult.value;
} finally {
  // 내부 제너레이터 정리 (yield*의 암묵적 .return() 대응)
  // 정상 완료 시에는 no-op
  await llmStream.return(undefined as unknown as Turn);
}
```

### 2차 리뷰 추가 변경 파일

| 파일                                                 | 변경 내용                                                         | 규모 |
| ---------------------------------------------------- | ----------------------------------------------------------------- | ---- |
| `packages/cli/src/ui/hooks/slashCommandProcessor.ts` | ABOUT 메시지에 `selectedProvider` 추가                            | +1줄 |
| `packages/cli/src/ui/types.ts`                       | Message ABOUT variant에 `selectedProvider?` 추가                  | +1줄 |
| `packages/cli/src/ui/commands/aboutCommand.ts`       | 런타임 프로바이더(`getContentGenerator().providerName`) 우선 사용 | +4줄 |
| `packages/cli/src/ui/commands/aboutCommand.test.ts`  | `getContentGenerator` mock 추가, fallback 테스트 갱신             | +3줄 |
| `packages/core/src/providers/openai/converter.ts`    | `SANITIZED_ID_CACHE_MAX_SIZE` 10,000건 캡 추가                    | +4줄 |
| `packages/core/src/core/client.ts`                   | 수동 이터레이션에 `try/finally` + `llmStream.return()` 추가       | +6줄 |

### 2차 리뷰 수정 후 검증 결과

```
Typecheck:  ALL PASSED (4 workspaces)
Core 전체:  288 files, 5757 tests  — ALL PASSED (24 skipped)
CLI 전체:   351 files, 4800 tests  — ALL PASSED (2 skipped)
```

| 테스트                                  | 결과 |
| --------------------------------------- | ---- |
| `converter.test.ts` — 74 tests          | PASS |
| `client.test.ts` — 96 tests (1 skipped) | PASS |
| `aboutCommand.test.ts` — 8 tests        | PASS |
