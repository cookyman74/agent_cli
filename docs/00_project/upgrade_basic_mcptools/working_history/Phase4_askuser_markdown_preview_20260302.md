# Phase 4 작업 결과서: AskUser E2E 경로 구축 + markdown preview 강화

> **작업일**: 2026-03-02 **브랜치**: `DID/v0.2` **작업 계획서**:
> [Phase4_askuser_markdown_preview.md](../phase_todolist/Phase4_askuser_markdown_preview.md)

---

## 1. 작업 개요

| 항목        | 내용                                                                          |
| ----------- | ----------------------------------------------------------------------------- |
| 목적        | AskUser E2E 단절 경로 구축 (Part A) + markdown preview 패널 추가 (Part B)     |
| 수정 파일   | Core 4개, CLI 5개 (신규 1개 포함), 총 9개                                     |
| 테스트 파일 | `config.test.ts` (+2), `ask-user.test.ts` (+2), `AskUserDialog.test.tsx` (+4) |
| 위험 수준   | Medium-High — E2E 경로 신규 구축 + 스키마 확장 + CLI UI 수정                  |

---

## 2. 사전 리뷰 이슈 반영

| 이슈 | 내용                                            | 적용                                                        |
| ---- | ----------------------------------------------- | ----------------------------------------------------------- |
| I1   | ask_user E2E 경로 완전 단절 (5개 단절점)        | Part A에서 config 등록 + CLI 구독 + DialogManager 연동      |
| I3   | execute() 호출 시 hang / cancel 미정의          | onCancel → `ASK_USER_RESPONSE { answers: {} }` 빈 응답 전략 |
| I5   | AskUserDialog props onSubmit/onCancel 혼동 가능 | onSubmit/onCancel 정확히 사용 (NOT onAnswer)                |

---

## 3. Part A: AskUser E2E 경로 구축

### RED Phase (테스트 2개)

| 테스트 그룹               | 내용                                       | 테스트 수 |
| ------------------------- | ------------------------------------------ | --------- |
| AskUser tool registration | 무조건 등록 + useWriteTodos=false에도 등록 | 2         |

**RED 검증**: 2개 실패 확인 (AskUserTool 미등록), 143개 기존 통과

### GREEN Phase (5개 파일 수정, 1개 신규)

#### TASK-A1: config.ts — AskUserTool 등록

- import 추가: `import { AskUserTool } from '../tools/ask-user.js'`
- `registerCoreTool(AskUserTool)` 무조건 등록 (getUseWriteTodos 블록 외부)
- 위치: WebSearchTool 뒤, getUseWriteTodos() 앞

#### TASK-A2: useAskUserHandler.ts (신규, 92줄)

- `useAskUserHandler(config)` hook: MessageBus `ASK_USER_REQUEST` 구독
- `AskUserDialogRequest` 인터페이스: `{ questions, onSubmit, onCancel }`
- onSubmit → `ASK_USER_RESPONSE { correlationId, answers }` 발행
- onCancel → `ASK_USER_RESPONSE { correlationId, answers: {} }` 발행 (빈 응답)

#### TASK-A3: UIStateContext.tsx

- `AskUserDialogRequest` type import 추가
- UIState 인터페이스에 `askUserRequest: AskUserDialogRequest | null` 필드 추가

#### TASK-A4: AppContainer.tsx

- `useAskUserHandler` import + hook 호출
- UIState memo 객체 + deps 배열에 `askUserRequest` 추가

#### TASK-A5: DialogManager.tsx

- `AskUserDialog` import 추가
- `confirmUpdateExtensionRequests` 뒤에 `askUserRequest` 렌더링 조건 추가

**GREEN 검증**: Core 145/145, CLI 4828/4828

### E2E 연결 경로

```
Core AskUserTool (ask-user.ts)
  → config.ts: registerCoreTool(AskUserTool)
  → MessageBus.publish(ASK_USER_REQUEST)
  → useAskUserHandler.ts: subscribe → setAskUserRequest
  → AppContainer.tsx: askUserRequest → UIState memo
  → UIStateContext.tsx: UIState.askUserRequest field
  → DialogManager.tsx: if(askUserRequest) → <AskUserDialog>
  → User responds → onSubmit → MessageBus.publish(ASK_USER_RESPONSE)
  → AskUserTool receives response (correlationId 매칭)
```

---

## 4. Part B: Markdown Preview 강화

### RED Phase (테스트 6개)

| 테스트 그룹             | 내용                                                | 테스트 수 |
| ----------------------- | --------------------------------------------------- | --------- |
| schema - markdown field | markdown 포함 유효성 + backward compatible          | 2         |
| Markdown preview        | preview 렌더링 + 포커스 변경 + 미표시 + multiSelect | 4         |

**RED 검증**: Core 스키마 테스트는 JSON Schema additionalProperties 기본
허용으로 통과, CLI 2개 실패 (preview 미구현)

### GREEN Phase (3개 파일 수정)

#### TASK-B1: types.ts — QuestionOption.markdown 추가

- `QuestionOption` 인터페이스에 `markdown?: string` optional 필드 추가
- JSDoc 주석: "Optional preview content shown in a monospace box when this
  option is focused."
- **하위 호환**: optional 필드 → 기존 호출에 영향 없음

#### TASK-B2: ask-user.ts — JSON Schema markdown 속성

- `options.items.properties`에 `markdown` 속성 추가
- type: `string`, description: ASCII mockups/code snippets/diagrams용 preview
  content

#### TASK-B3: AskUserDialog.tsx — MarkdownPreviewPanel

- `OptionItem` 인터페이스에 `markdown?: string` 필드 추가
- `ChoiceQuestionState`에 `focusedOptionIndex: number` 추가
- `SET_FOCUSED_OPTION` reducer action 추가
- `handleHighlight`에서 focusedOptionIndex 디스패치
- `hasMarkdownPreview` 판별: options 중 하나라도 markdown 존재 + !multiSelect
- side-by-side 레이아웃: `<Box flexDirection="row">` (Options | Preview)
- Preview 패널: `borderStyle="round"` + "Preview" 헤더 + 포커스된 옵션의
  markdown 표시
- multiSelect인 경우 기존 레이아웃 유지 (Claude Code 동작과 동일)

**GREEN 검증**: Core 14/14, CLI 29/29

---

## 5. 검증 결과

| 검증 항목                  | 결과                               |
| -------------------------- | ---------------------------------- |
| Core 전체 테스트           | 293 files, 5921 passed, 0 failed   |
| CLI 전체 테스트            | 351 files, 4832 passed, 0 failed   |
| Core 빌드                  | 성공                               |
| CLI 빌드                   | 성공                               |
| TypeScript typecheck       | 0 에러                             |
| ESLint                     | 신규 에러 없음 (기존 rag-server만) |
| Phase 1~3 회귀             | 없음                               |
| 기존 ask_user 하위 호환    | ✅ optional 필드 추가만            |
| onSubmit/onCancel 정확성   | ✅ Issue 5 반영                    |
| multiSelect preview 비활성 | ✅ Claude Code 동작 동일           |

---

## 6. 변경 요약

### Core 파일 (4개)

| 파일               | 변경 유형 | 줄 수 변화  | 내용                                   |
| ------------------ | --------- | ----------- | -------------------------------------- |
| `config.ts`        | 수정      | 2206→2208줄 | +AskUserTool import, +registerCoreTool |
| `config.test.ts`   | 수정      | 2433→2473줄 | +AskUser 등록 테스트 2개               |
| `types.ts`         | 수정      | 167→168줄   | +QuestionOption.markdown optional 필드 |
| `ask-user.ts`      | 수정      | 209→215줄   | +markdown JSON Schema 속성             |
| `ask-user.test.ts` | 수정      | 228→271줄   | +markdown 스키마 테스트 2개            |

### CLI 파일 (6개, 신규 1개)

| 파일                     | 변경 유형 | 줄 수       | 내용                                   |
| ------------------------ | --------- | ----------- | -------------------------------------- |
| `useAskUserHandler.ts`   | **신규**  | 92줄        | MessageBus 구독 hook                   |
| `UIStateContext.tsx`     | 수정      | 175→176줄   | +askUserRequest 필드 + type import     |
| `AppContainer.tsx`       | 수정      | 2224→2228줄 | +hook 호출 + UIState memo 연결         |
| `DialogManager.tsx`      | 수정      | 360→369줄   | +AskUserDialog import + 렌더링 조건    |
| `AskUserDialog.tsx`      | 수정      | 1106→1174줄 | +MarkdownPreview side-by-side 레이아웃 |
| `AskUserDialog.test.tsx` | 수정      | 855→980줄   | +markdown preview 테스트 4개           |

---

## 7. Markdown Preview 동작 사양

| 조건                                   | 동작                                       |
| -------------------------------------- | ------------------------------------------ |
| options에 markdown 있음 + !multiSelect | side-by-side (Options \| Preview) 레이아웃 |
| 포커스 변경                            | Preview 패널 내용 자동 갱신                |
| options에 markdown 없음                | 기존 단일 열 레이아웃 유지                 |
| multiSelect + markdown                 | Preview 비활성화 (기존 레이아웃)           |
| 포커스된 옵션에 markdown 없음          | Preview 패널 빈 상태 표시                  |

### 레이아웃 예시

```
╭──────────────────────────────────────────────────────────────╮
│ Which layout?                                                │
│ ╭─ Options ──────────╮ ╭─ Preview ──────────╮               │
│ │ > 1. Horizontal    │ │ ┌─────────┐       │               │
│ │   2. Vertical      │ │ │ A │ B │       │               │
│ │   3. [custom]      │ │ └─────────┘       │               │
│ ╰────────────────────╯ ╰───────────────────╯               │
│ Enter to select · ↑/↓ to navigate · Esc to cancel           │
╰──────────────────────────────────────────────────────────────╯
```

---

## 8. 리뷰 이슈 수정 (R1~R6)

> **수정일**: 2026-03-02 (Phase 4 완료 후 리뷰 반영)

### 이슈 요약 및 수정 내역

| #   | 심각도 | 이슈                                               | 수정 내역                                                                                                                                 | 상태 |
| --- | ------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| R1  | HIGH   | Cancel이 정상 응답(`{}`)으로 처리 — LLM 오판       | `AskUserResponse`에 `cancelled?: boolean` 추가, onCancel에서 `cancelled: true` 전송, responseHandler에서 cancelled 감지 시 에러 결과 반환 | ✅   |
| R2  | HIGH   | 동시 ask_user 요청 시 기존 요청 유실 (단일 슬롯)   | `previousCancelRef`로 이전 요청 추적, 새 요청 도착 시 이전 요청 auto-cancel                                                               | ✅   |
| R3  | HIGH   | 응답 타임아웃 없음 — UI 브리지 누락 시 무한 대기   | `execute()`에 5분 방어적 타임아웃 추가, 타임아웃 시 에러 결과 반환 + cleanup                                                              | ✅   |
| R4  | MEDIUM | coreTools allowlist 필터로 ask_user 등록 차단 가능 | `registerCoreTool` 대신 `registry.registerTool` 직접 호출로 allowlist 우회                                                                | ✅   |
| R5  | MEDIUM | useAskUserHandler 통합 테스트 없음                 | `useAskUserHandler.test.tsx` 신규 작성 (10개 테스트)                                                                                      | ✅   |
| R6  | LOW    | Flaky 타임아웃 4건 (전체 실행 시)                  | Phase 4 변경과 무관한 기존 이슈 확인, 문서화                                                                                              | ✅   |

### R1: Cancel 응답 구분 (HIGH)

**변경 파일**: `types.ts`, `ask-user.ts`, `useAskUserHandler.ts`

- `AskUserResponse.cancelled?: boolean` 필드 추가 (168→170줄)
- `useAskUserHandler.ts` onCancel에서 `cancelled: true` 전송
- `ask-user.ts` responseHandler에서 `response.cancelled` 감지 시:
  - `llmContent: 'User cancelled the question without answering.'`
  - `error: { message: 'Cancelled' }` 반환

### R2: 동시 요청 auto-cancel (HIGH)

**변경 파일**: `useAskUserHandler.ts`

- `previousCancelRef = useRef<(() => void) | null>(null)` 추가
- `handleRequest`에서 새 요청 처리 전 `previousCancelRef.current?.()` 호출
- onSubmit/onCancel 완료 시 `previousCancelRef.current = null` 초기화

### R3: 5분 방어적 타임아웃 (HIGH)

**변경 파일**: `ask-user.ts`

- `RESPONSE_TIMEOUT_MS = 5 * 60 * 1000` (5분)
- `execute()` 내부 `setTimeout(timeoutHandler, RESPONSE_TIMEOUT_MS)`
- `cleanup()`에서 `clearTimeout(timeoutId)` 호출
- 타임아웃 시 `{ error: { message: 'Ask user request timed out...' } }` 반환

### R4: coreTools allowlist 우회 (MEDIUM)

**변경 파일**: `config.ts`, `config.test.ts`

- `registerCoreTool(AskUserTool)` →
  `registry.registerTool(new AskUserTool(this.getMessageBus()))` 직접 등록
- 테스트 추가: `coreTools: ['ShellTool']` 제한 환경에서도 ask_user 등록 확인

### R5: useAskUserHandler 통합 테스트 (MEDIUM)

**신규 파일**: `useAskUserHandler.test.tsx` (257줄, 10개 테스트)

| 테스트 그룹           | 테스트 수 | 내용                                                                   |
| --------------------- | --------- | ---------------------------------------------------------------------- |
| 기본 동작             | 2         | null 반환 (비활성, config null)                                        |
| subscribe/unsubscribe | 3         | mount 시 구독, unmount 시 해제, null config 미구독                     |
| correlation roundtrip | 3         | 요청 수신 → 상태 설정, onSubmit → 응답 발행, onCancel → cancelled 발행 |
| concurrent request    | 2         | 새 요청 시 이전 auto-cancel, 단일 요청 시 auto-cancel 미발생           |

### R6: Flaky 타임아웃 4건 (LOW)

- `index.test.ts:19`, `hookSystem_new_types.test.ts:228`,
  `config.integration.test.ts:173`, `text-buffer.test.ts:1981`
- 4개 모두 Phase 4 변경 파일이 아님 (기존 flaky 테스트)
- 단독 실행 시 통과, 전체 실행 시 부하로 인한 타임아웃
- Phase 4 범위 외 — 별도 이슈로 관리 권장

---

## 9. 리뷰 수정 후 검증 결과

| 검증 항목            | 결과                             |
| -------------------- | -------------------------------- |
| Core 전체 테스트     | 293 files, 5926 passed, 0 failed |
| CLI 전체 테스트      | 352 files, 4842 passed, 0 failed |
| Core 빌드            | 성공                             |
| CLI 빌드             | 성공                             |
| TypeScript typecheck | 0 에러                           |
| ESLint               | 신규 에러 없음                   |

### 리뷰 수정 변경 요약

#### Core 파일 (3개 수정)

| 파일               | 변경 유형 | 줄 수 변화  | 내용                                   |
| ------------------ | --------- | ----------- | -------------------------------------- |
| `types.ts`         | 수정      | 168→170줄   | +AskUserResponse.cancelled 필드        |
| `ask-user.ts`      | 수정      | 215→253줄   | +cancelled 감지 + 5분 타임아웃         |
| `config.ts`        | 수정      | 2208→2213줄 | AskUserTool 직접 등록 (allowlist 우회) |
| `ask-user.test.ts` | 수정      | 271→429줄   | +cancelled/timeout 테스트 4개          |
| `config.test.ts`   | 수정      | 2473→2494줄 | +coreTools 제한 환경 테스트 1개        |

#### CLI 파일 (1개 수정, 1개 신규)

| 파일                         | 변경 유형 | 줄 수    | 내용                                            |
| ---------------------------- | --------- | -------- | ----------------------------------------------- |
| `useAskUserHandler.ts`       | 수정      | 92→107줄 | +cancelled 전송 + previousCancelRef auto-cancel |
| `useAskUserHandler.test.tsx` | **신규**  | 257줄    | 통합 테스트 10개                                |

---

**작성일**: 2026-03-02 **상태**: ✅ Phase 4 완료 (E2E 경로 구축 + markdown
preview 강화 + 리뷰 R1~R6 반영)
