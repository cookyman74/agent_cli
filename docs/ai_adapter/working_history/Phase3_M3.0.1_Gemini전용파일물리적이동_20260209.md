# M3.0.1: Gemini 전용 파일 물리적 이동 작업 기록

**작업일**: 2026-02-09 **작업자**: AI Assistant **브랜치**: DID/v0.1 **이전
작업**:
[phase2_tradeoff_EventType전환\_20260208.md](./phase2_tradeoff_EventType전환_20260208.md)
**관련 문서**:
[phase3_provider_extension_todolist.md](../todolist/phase3_provider_extension_todolist.md) -
M3.0.1

---

## 📋 작업 개요

### 목표

- Phase 3 핸드오프 Critical #3: `core/geminiChat.ts` →
  `providers/gemini/chat.ts` 물리적 이동
- Phase 3 핸드오프 Critical #4: `core/turn.ts` → `providers/gemini/turn.ts`
  물리적 이동
- re-export 하위 호환성 유지 (기존 import 경로 무파괴)
- root `index.ts` re-export 회귀 테스트 추가

### 작업 범위

- **파일 생성**:
  - `providers/gemini/chat.ts`: geminiChat.ts 이동 (999L, import 경로 변환)
  - `providers/gemini/turn.ts`: turn.ts 이동 (324L, import 경로 변환)
- **파일 수정**:
  - `core/geminiChat.ts`: re-export stub으로 교체 (999L → 23L)
  - `core/turn.ts`: re-export stub으로 교체 (325L → 46L)
  - `src/index.ts`: L32, L36 barrel export 경로를 신규 위치로 갱신
  - `src/index.test.ts`: placeholder → 7개 re-export 회귀 테스트

### Tidy First 원칙

- ✅ 모든 변경이 순수 구조적 (동작 변경 없음)
- ✅ 각 이동마다 테스트 실행하여 회귀 확인
- ✅ 커밋 메시지에 `[STRUCTURAL]` 태그

---

## 🔍 사전작업 분석

### import 의존성 맵

**geminiChat.ts 소비자** (non-test):

| 파일                                   | import 대상                        |
| -------------------------------------- | ---------------------------------- |
| `core/client.ts:27`                    | `GeminiChat`                       |
| `core/turn.ts:21-22`                   | `GeminiChat`, `InvalidStreamError` |
| `services/chatCompressionService.ts:9` | `GeminiChat` (type)                |
| `agents/local-executor.ts:9`           | `GeminiChat`, `StreamEventType`    |
| `utils/nextSpeakerChecker.ts:9`        | `GeminiChat` (type)                |

**turn.ts 소비자** (non-test):

| 파일                                    | import 대상                                                        |
| --------------------------------------- | ------------------------------------------------------------------ |
| `core/client.ts:19-21`                  | `ChatCompressionInfo`, `CompressionStatus`, `Turn`, `LlmEventType` |
| `services/chatCompressionService.ts:10` | `ChatCompressionInfo`, `CompressionStatus`                         |
| `agents/local-executor.ts:23`           | `CompressionStatus`                                                |
| `utils/quotaErrorDetection.ts:7`        | `StructuredError` (type)                                           |
| `src/index.ts:36`                       | barrel export                                                      |

**CLI 패키지**: `@google/gemini-cli-core` 패키지 import 사용 → root `index.ts`
re-export 유지만으로 호환성 보장.

### 경로 변환 규칙

`core/` → `providers/gemini/` 이동 시:

- `../xxx/` → `../../xxx/` (한 단계 더 깊어짐)
- `./xxx.js` (core/ 내 파일) → `../../core/xxx.js`
- `../providers/xxx` → `../xxx` (providers/ 내부로 이동했으므로)

---

## 🟢 구현 (Structural Move)

### 3.0.1.1: geminiChat.ts → providers/gemini/chat.ts

1. `providers/gemini/chat.ts` 생성 — 원본 999L 그대로, import 경로만 변환
2. `core/geminiChat.ts` → re-export stub (23L)
   ```typescript
   export {
     StreamEventType,
     type StreamEvent,
     SYNTHETIC_THOUGHT_SIGNATURE,
     isValidNonThoughtTextPart,
     InvalidStreamError,
     AgentExecutionStoppedError,
     AgentExecutionBlockedError,
     GeminiChat,
     isSchemaDepthError,
     isInvalidArgumentError,
   } from '../providers/gemini/chat.js';
   ```
3. TypeCheck PASS → geminiChat.test.ts 48/48 PASS

### 3.0.1.2: turn.ts → providers/gemini/turn.ts

1. `providers/gemini/turn.ts` 생성 — 원본 324L 그대로, import 경로 변환
   - `./geminiChat.js` → `./chat.js` (같은 providers/gemini/ 디렉토리)
   - `../providers/events.js` → `../events.js`
   - `../providers/types.js` → `../types.js`
   - `../providers/gemini/types.js` → `./types.js`
2. `core/turn.ts` → re-export stub (46L)
3. TypeCheck PASS → turn.test.ts 22/22 PASS

### 3.0.1.3: re-export 하위 호환성 검증

기존 `../core/geminiChat.js`, `../core/turn.js` 경로를 사용하는 모든 소비자
테스트 실행:

- client.test.ts: 72 passed (1 skipped)
- chatCompressionService.test.ts: 26 passed
- local-executor.test.ts: 37 passed
- nextSpeakerChecker.test.ts: 10 passed
- errorParsing.test.ts: 10 passed
- **합계: 154 passed, 1 skipped, 0 failed**

### 3.0.1.4: core/index.ts export 정리

```diff
-export * from './core/geminiChat.js';
+export * from './providers/gemini/chat.js'; // moved from core/geminiChat.ts
-export * from './core/turn.js';
+export * from './providers/gemini/turn.js'; // moved from core/turn.ts
```

TypeCheck PASS (core + cli 모두)

### 3.0.1.5: root index.ts re-export 회귀 테스트

기존 placeholder(`expect(true).toBe(true)`)를 7개 실질 테스트로 교체:

| 테스트                    | 검증 대상                                        |
| ------------------------- | ------------------------------------------------ |
| GeminiChat export         | `providers/gemini/chat.ts` → class               |
| StreamEventType export    | `providers/gemini/chat.ts` → enum (CHUNK, RETRY) |
| InvalidStreamError export | `providers/gemini/chat.ts` → class               |
| Turn export               | `providers/gemini/turn.ts` → class               |
| CompressionStatus export  | `providers/gemini/types.ts` via turn.ts          |
| LlmEventType export       | `providers/events.ts` via turn.ts                |
| GeminiEventType export    | `providers/gemini/types.ts` via turn.ts          |

결과: 7/7 PASS

---

## ✅ 검증 결과

### Quality Gate

| 항목             | 결과                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| TypeCheck        | ✅ PASS (전체 프로젝트 — core, cli, a2a-server, test-utils)          |
| Lint             | ✅ PASS (0 errors)                                                   |
| Core Tests       | ✅ 260 files / 4838 passed / 24 skipped / 0 failed                   |
| CLI Tests        | ⚠️ 5 files failed (기존 스냅샷/help 텍스트 불일치, M3.0.1 변경 무관) |
| pre-commit hooks | ✅ PASS (prettier, eslint)                                           |

### 개별 테스트 결과

| 테스트 파일        | 결과                     |
| ------------------ | ------------------------ |
| geminiChat.test.ts | ✅ 48/48 passed          |
| turn.test.ts       | ✅ 22/22 passed          |
| index.test.ts      | ✅ 7/7 passed (신규)     |
| exports.test.ts    | ✅ 7/7 passed            |
| 소비자 5개 파일    | ✅ 154 passed, 1 skipped |

---

## 🐛 이슈 및 해결

이번 작업에서 발생한 이슈 없음. 순수 구조적 이동이므로 모든 테스트가 한 번에
통과.

### CLI 기존 실패 (변경 무관)

| 파일                                    | 실패 원인                      |
| --------------------------------------- | ------------------------------ |
| mcp.test.ts                             | help 텍스트 'Commands:' 불일치 |
| AlternateBufferQuittingDisplay.test.tsx | 스냅샷 불일치                  |
| AppHeader.test.tsx                      | 스냅샷 불일치                  |
| extensions/install.test.ts              | help 텍스트 불일치             |
| extensions/validate.test.ts             | help 텍스트 불일치             |

→ 모두 M3.0.1 파일 이동과 무관한 기존 스냅샷/텍스트 불일치.

---

## 📝 다음 단계

- [ ] **M3.0.2**: messageInspectors 마이그레이션 (4파일)
  - loopDetectionService.ts, geminiChat.ts(이동 후), editCorrector.ts,
    nextSpeakerChecker.ts
  - `isFunctionCall/Response` → `isToolCallMessage/isToolResultMessage`
  - ⚠️ Content → LlmMessage 타입 전환 선행 필요
- [ ] **M3.0.3**: 텔레메트리/Agent 레이어 독립화
- [ ] **M3.0.4**: geminiTypeConversion.ts 브릿지 제거
- [ ] **M3.0.5**: 런타임 실행 경로 연결 (ProviderFactory)

---

## 📊 커밋 요약

| 순서 | 커밋 ID     | 타입       | 설명                                                   | 테스트         |
| ---- | ----------- | ---------- | ------------------------------------------------------ | -------------- |
| 1    | `f56845dab` | STRUCTURAL | geminiChat.ts, turn.ts → providers/gemini/ 물리적 이동 | ✅ 4838 passed |

**총 커밋 수**: 1개

---

## ✅ 완료 기준 체크

- [x] 모든 Core 테스트 통과 (4838/4838)
- [x] TypeCheck 통과 (전체 프로젝트)
- [x] Lint 경고 0개
- [x] re-export 하위 호환성 유지 (소비자 154/154 테스트 통과)
- [x] root index.ts re-export 회귀 테스트 추가 (7개)
- [x] Tidy First 원칙 준수 (순수 구조적 변경)
- [x] pre-commit hooks 통과

---

## 📋 핸드오프 추적 업데이트

| #    | 핸드오프 항목                          | 상태      | 해소 위치            |
| ---- | -------------------------------------- | --------- | -------------------- |
| 3    | `chat.ts` → `providers/gemini/chat.ts` | ✅ 해소됨 | M3.0.1 (`f56845dab`) |
| 4    | `turn.ts` → `providers/gemini/turn.ts` | ✅ 해소됨 | M3.0.1 (`f56845dab`) |
| 신규 | root index.ts re-export 회귀 테스트    | ✅ 해소됨 | M3.0.1 (`f56845dab`) |

---

**작업 완료 시간**: 2026-02-09 13:12 **최종 상태**: ✅ 완료

---

## 📝 리뷰 반영 (2026-02-09)

### 이슈 1 (중간): Provider 레이어가 legacy core shim에 역의존

- **지적**: `providers/gemini/chat.ts:30`에서 `StructuredError`를
  `../../core/turn.js` (re-export shim)에서 import. 동일 타입이
  `./types.ts:182`에 이미 정의되어 있어 역의존 발생.
- **검증 결과**: ✅ 확인됨. `StructuredError`는 `./types.ts:182`에
  `{ message: string; status?: number }`로 동일 정의.
- **수정**: `import type { StructuredError } from '../../core/turn.js'` →
  `import type { StructuredError } from './types.js'`
- **검증**: TypeCheck PASS, geminiChat.test.ts 48/48 PASS

### 이슈 2 (낮음): 이동 후 주석 문맥이 구버전 상태

- **지적**: `chat.ts:56,74`의 "will be moved to providers/gemini/ in a future
  milestone (M2.3+)" 문구가 이미 이동 완료 상태와 불일치.
- **검증 결과**: ✅ 확인됨. 파일이 이미 `providers/gemini/chat.ts`에 위치.
- **수정**: 두 주석 모두 "retained for backward compatibility"로 정정.
  - L56: `StreamEventType` @deprecated 주석
  - L74: `StreamEvent` @deprecated 주석

### 재검증

| 항목                     | 결과            |
| ------------------------ | --------------- |
| TypeCheck                | ✅ PASS         |
| 관련 테스트 4파일 (84건) | ✅ 84/84 passed |
