# Phase C 작업결과서: TodoTray 실시간 업데이트 + Claude Code 스타일 UI

> **작업일**: 2026-03-02 **브랜치**: `DID/v0.2`

---

## 1. 작업 개요

| 항목      | 내용                                                                      |
| --------- | ------------------------------------------------------------------------- |
| 목적      | TodoTray 실시간 업데이트 버그 수정 + Claude Code 스타일 태스크 진행률 UI  |
| 배경      | Phase B에서 Task\* 도구 단일화 후 TodoTray UI의 실시간 업데이트 결함 발견 |
| 근본 원인 | TodoTray가 확정된 history만 읽고 라이브 pendingHistoryItems를 무시        |
| 위험 수준 | Low — UI 컴포넌트 변경만, 데이터 흐름/비즈니스 로직 변경 없음             |

---

## 2. 문제 분석

### 아키텍처 배경

```
[Ink 렌더링 구조]
MainContent.tsx:
  <Static items={history}>  — 확정 항목, 한 번만 렌더 (scroll-off)
  {pendingItems}             — 라이브 영역, 매 상태변경 시 리렌더

Composer.tsx (sticky bottom):
  <LoadingIndicator />       — 스피너 + 시간 + thought
  <TodoTray />               — 태스크 목록 ← 수정 대상
  <InputPrompt />
  <Footer />

[데이터 흐름]
LLM stream → scheduleToolCalls() → setToolCallsForDisplay()
  → pendingToolCallGroupDisplay (LIVE)
  → [배치 완료] → addItem() → uiState.history (STATIC)
```

### Bug 1 [Critical]: TodoTray가 실시간으로 업데이트되지 않음

**증상**: Task\* 도구 실행 중 TodoTray가 갱신되지 않고, 전체 도구 배치 완료
후에만 업데이트

**원인**:

```typescript
// Before — history만 참조
const todos = useMemo(() => {
  for (let i = uiState.history.length - 1; i >= 0; i--) {
    // ... 확정된 history만 검색
  }
  return null;
}, [uiState.history]); // ← pendingHistoryItems 미참조
```

- `uiState.history`는 `<Static>` 영역의 확정 항목 (도구 배치 완료 후 이동)
- 도구 실행 중 태스크 상태는 `uiState.pendingHistoryItems` (라이브 영역)에만
  존재
- `useMemo` 의존성 배열에 `pendingHistoryItems`가 없어 라이브 상태 변경 무시

### Bug 2 [Minor]: 도구 그룹 내 stale TodoList 반환

**증상**: 같은 배치에서 `task_create` → `task_update` 실행 시, 첫 번째
(task_create)의 stale snapshot 반환

**원인**:

```typescript
// Before — 정방향 순회, 첫 match에서 return
for (const tool of toolGroup.tools) {
  if ('todos' in tool.resultDisplay) {
    return tool.resultDisplay; // ← 첫 번째 match (stale)
  }
}
```

- `tools` 배열 내 정방향 순회로 가장 오래된 TodoList를 반환
- `task_create`(index 0)와 `task_update`(index 1) 모두 `todos`를 반환하지만
  최신은 index 1

### Bug 3 [Medium]: 멀티턴 실행 간 커넥터 뷰 깜빡임

**증상**: 에이전트가 도구 배치 완료 후 다음 쿼리 시작까지 짧은 순간 커넥터
뷰(⎿)가 사라졌다 다시 나타남 (flash)

**원인**:

```
[타이밍 흐름]
도구 배치 완료 → onComplete 콜백 호출
  → submitQuery() 호출 (fire-and-forget, await 없음)
  → submitQuery 내부:
    line 1016: await prepareQueryForGemini()  ← async 대기
    line 1045: setIsResponding(true)          ← await 이후 실행

[그 사이 상태]
  toolCallsForDisplay = []  (배치 완료로 클리어됨)
  isResponding = false      (이전 쿼리의 finally 블록)
  → streamingState = Idle   (isResponding || toolCalls.some(active) 모두 false)
  → isStreaming = false
  → 커넥터 뷰 조건 불충족 → null 렌더 (flash!)
```

- `useGeminiStream.ts` line 1045에서 `setIsResponding(true)`가 `await` 이후 실행
- `onComplete` → `submitQuery` 사이 비동기 갭에서 streamingState가 일시적으로
  Idle
- TodoTray가 `isStreaming` 직접 참조하므로 이 갭에서 커넥터 뷰가 사라짐

---

## 3. 해결 방안

### Bug 1+2: pending 우선 검색 + 역순 순회

```typescript
// After — pending 우선, 역순 순회
function extractTodoList(entry: HistoryItemWithoutId): TodoList | null {
  if (entry.type !== 'tool_group') return null;
  const toolGroup = entry as HistoryItemToolGroup;
  // 역순 순회 → 최신 TodoList 반환
  for (let j = toolGroup.tools.length - 1; j >= 0; j--) {
    const tool = toolGroup.tools[j];
    if (isTodoList(tool.resultDisplay)) return tool.resultDisplay;
  }
  return null;
}

const todos = useMemo(() => {
  // 1. LIVE pending 우선 검색
  for (let i = uiState.pendingHistoryItems.length - 1; i >= 0; i--) {
    const result = extractTodoList(uiState.pendingHistoryItems[i]);
    if (result) return result;
  }
  // 2. 확정 history fallback
  for (let i = uiState.history.length - 1; i >= 0; i--) {
    const result = extractTodoList(uiState.history[i]);
    if (result) return result;
  }
  return null;
}, [uiState.pendingHistoryItems, uiState.history]);
```

### Claude Code 스타일 상태 아이콘

| 상태        | Before | After | 색상                 |
| ----------- | ------ | ----- | -------------------- |
| completed   | ✓      | ✔    | theme.status.success |
| in_progress | »      | ◼    | theme.text.accent    |
| pending     | ☐      | ◻    | theme.text.secondary |
| cancelled   | ✗      | ✗     | theme.status.error   |

### 스트리밍 커넥터 뷰

스트리밍 중 활성 Todo가 있을 때 LoadingIndicator 하단에 `⎿` 커넥터로 연결:

```
✽ Thinking... (47s)           ← LoadingIndicator (기존)
  ⎿  ✔ Task A completed       ← TodoTray 스트리밍 뷰 (신규)
     ◼ Task B in progress
     ◻ Task C pending
```

렌더 분기 로직:

```
if (stableStreamingRef AND hasActiveTodos):
  → 커넥터 뷰 (⎿ prefix, border 없음)
elif (showFullTodos):
  → 확장 뷰 (border, title, 전체 목록)
elif (hasActiveTodos):
  → 축소 뷰 (single-line, in_progress 항목만)
else:
  → null
```

### Bug 3 수정: stableStreamingRef + lastKnownTodosRef

멀티턴 실행 간 비동기 갭에서 커넥터 뷰가 깜빡이는 문제를 두 개의 `useRef`로
해결:

**1. `stableStreamingRef`** — 안정적 스트리밍 플래그

```typescript
const stableStreamingRef = useRef(false);

// 렌더 중 동기적으로 업데이트 (return 이전)
if (isStreaming && hasActiveTodos) {
  stableStreamingRef.current = true; // 스트리밍 + 활성 Todo → true
} else if (!isStreaming && !hasActiveTodos) {
  stableStreamingRef.current = false; // 완전 종료 → false
}
// !isStreaming && hasActiveTodos → 기존 값 유지 (between-turn gap)
```

- `isStreaming` 직접 참조 대신 ref 기반 판단으로 갭 중 커넥터 뷰 유지
- 모든 태스크 완료 + 스트리밍 종료 시에만 false로 전환

**2. `lastKnownTodosRef`** — 마지막 유효 TodoList 캐시

```typescript
const lastKnownTodosRef = useRef<TodoList | null>(null);

if (todos !== null) {
  lastKnownTodosRef.current = todos;
}

const displayTodos =
  todos ?? (stableStreamingRef.current ? lastKnownTodosRef.current : null);
```

- 상태 전환 중 `todos`가 일시적으로 null이 되는 현상 방지
- `pendingHistoryItems` 클리어 → `history` 업데이트 사이의 갭에서 fallback 제공
- `stableStreamingRef.current`가 true일 때만 fallback 활성화 (일반 상태에서는
  미적용)

---

## 4. 변경 내역

### 수정 파일 (3)

| #   | 파일                                                    | 변경 내용                                                                                                                                  |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `packages/cli/src/ui/components/messages/Todo.tsx`      | Bug 1+2 수정, `isTodoList` 타입 가드 추가, `extractTodoList` 헬퍼 추가, 아이콘 변경, 스트리밍 커넥터 뷰 추가, `useStreamingContext` import |
| 2   | `packages/cli/src/ui/components/messages/Todo.test.tsx` | `StreamingContext.Provider` 래퍼 추가, `createPendingTodoItem` 헬퍼 추가, pending 우선 테스트 3건, 스트리밍 뷰 테스트 3건, 스냅샷 갱신     |
| 3   | `packages/cli/src/ui/components/Composer.test.tsx`      | `TodoTray` mock 추가 (기존 자식 컴포넌트 mock 패턴 준수), `pendingHistoryItems` 필드 추가                                                  |

### 변경하지 않은 파일

| 파일                   | 이유                                                      |
| ---------------------- | --------------------------------------------------------- |
| `UIStateContext.tsx`   | `pendingHistoryItems` 이미 UIState에 존재                 |
| `Composer.tsx`         | 구조 변경 불필요 (LoadingIndicator ↔ TodoTray 인접 유지) |
| `StreamingContext.tsx` | 기존 StreamingState enum과 Provider 그대로 사용           |
| `LoadingIndicator.tsx` | 토큰 카운트 표시 등은 별도 작업으로 분리                  |

---

## 5. 테스트 상세

### 신규 테스트 (11건)

#### `<TodoTray /> pending state priority` (3건)

| 테스트                                                 | 검증 내용                                     |
| ------------------------------------------------------ | --------------------------------------------- |
| prefers pending items over finalized history           | pending에 Live Task → history의 Old Task 무시 |
| falls back to history when no pending items have todos | pending 비어있으면 history에서 검색           |
| returns most recent TodoList within a tool group       | 역순 순회로 Fresh Task 반환, Stale Task 무시  |

#### `<TodoTray /> streaming connector view` (3건)

| 테스트                                  | 검증 내용                                   |
| --------------------------------------- | ------------------------------------------- |
| renders connector view during streaming | `⎿` prefix 렌더링, 전체 Todo 목록 표시      |
| renders normal view when not streaming  | `⎿` 미표시, 기존 "Todo" 타이틀 표시         |
| uses updated status icons               | ✔(completed), ◼(in_progress), ◻(pending) |

#### `<TodoTray /> stable streaming (between-turn gap)` (3건)

| 테스트                                                                            | 검증 내용                                                     |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| preserves connector view when streaming briefly becomes Idle with active todos    | Responding→Idle 전환 시 stableStreamingRef가 커넥터 뷰 유지   |
| hides connector view when all tasks complete and streaming stops                  | 모든 태스크 완료 + Idle → stableStreamingRef false 전환       |
| uses lastKnownTodos fallback when todos temporarily becomes null during streaming | history/pending 일시적 비어있을 때 lastKnownTodosRef fallback |

### 기존 테스트 수정

- 전체 `describe.each([true, false])` 블록: `StreamingContext.Provider` 래퍼
  추가
- `createMockUIState`에 `pendingHistoryItems: []` 기본값 추가
- 스냅샷 8개 갱신 (아이콘 변경 반영)

---

## 6. 검증 결과

| 검증 항목         | 결과                       |
| ----------------- | -------------------------- |
| CLI build         | 성공 ✅                    |
| Core 단위 테스트  | 5938 passed ✅             |
| CLI 단위 테스트   | 4856 passed (352 files) ✅ |
| Todo.test.tsx     | 25/25 passed ✅            |
| Composer.test.tsx | 21/21 passed ✅            |
| 스냅샷 갱신       | 8 written ✅               |

---

## 7. 영향 분석

### 성능

- `pendingHistoryItems` 변경은 도구 호출 단위로 발생 (문자별 스트리밍 아님)
- TodoTray는 작은 컴포넌트이므로 리렌더 비용 무시 가능
- `useMemo` 의존성에 `pendingHistoryItems` 추가 → 도구 호출 시에만 재계산

### UI 동작 변화

| 시나리오                       | Before                   | After                               |
| ------------------------------ | ------------------------ | ----------------------------------- |
| 도구 실행 중 태스크 상태       | 배치 완료까지 stale      | 즉시 반영 (pending 우선 검색)       |
| task_create → task_update 배치 | 첫 번째 (stale) 스냅샷   | 마지막 (최신) 스냅샷                |
| 스트리밍 중 활성 Todo          | 기존 border 뷰           | ⎿ 커넥터 뷰 (LoadingIndicator 연결) |
| 스트리밍 중 비활성 Todo        | null (표시 안 됨)        | null (변경 없음)                    |
| 멀티턴 간 Idle 갭              | 커넥터 뷰 깜빡임 (flash) | stableStreamingRef로 안정 유지      |
| 상태 전환 중 todos null        | 일시적 빈 렌더           | lastKnownTodosRef fallback          |
| 비스트리밍 + showFullTodos     | 확장 뷰 (변경 없음)      | 확장 뷰 (변경 없음)                 |
| 비스트리밍 + collapsed         | 축소 뷰 (변경 없음)      | 축소 뷰 (변경 없음)                 |

### 하위호환

- 데이터 구조 변경 없음 — `ToolResultDisplay.todos` 키 기반 검출 유지
- Task\* 도구 출력 형식 변경 없음
- Ctrl+T 토글 동작 변경 없음
- 기존 `showFullTodos` 설정 완전 호환

---

---

## 8. Hotfix R1: 리뷰 이슈 4건 수정

> **수정일**: 2026-03-02

### 수정 이슈 요약

| #    | 심각도 | 이슈                          | 근본 원인                                                                 | 수정 방법                                          |
| ---- | ------ | ----------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------- |
| R1-1 | HIGH   | 유령 Todo 고착                | `todos=null` → `displayTodos=cache` → `hasActiveTodos=true(cache)` → 순환 | `todos===null && !isStreaming` 시 refs 명시적 해제 |
| R1-2 | MEDIUM | 다중 scheduler 최신 보장 불가 | `Object.values(toolCallsMap).flat()` 순서 ≠ 시간순                        | 전체 순회 + 최대 항목 수 휴리스틱                  |
| R1-3 | MEDIUM | 렌더 중 setState 증폭         | `useState` 2곳에서 render-during-render 패턴                              | `useRef`로 복원 (재렌더 트리거 불필요)             |
| R1-4 | LOW    | 커넥터 prefix 하드코딩        | 문자열 `'  ⎿  '` 직접 사용                                                | Box `width={5} flexShrink={0}` 기반 레이아웃       |

### R1-1 [HIGH]: 유령 Todo 고착 해제

**문제**: 스트리밍 중 active Todo를 캐시한 뒤, 실제 소스가 비어도
`stableStreaming=true + hasActiveTodos=true(캐시 기준)`가 유지되어 오래된 Todo가
UI에 지속 노출.

**수정**:

```typescript
// Ghost Todo cleanup: source 비어있고 + 스트리밍 종료 → 캐시 해제
if (todos === null && !isStreaming) {
  stableStreamingRef.current = false;
  lastKnownTodosRef.current = null;
}
```

**동작 순서**:

1. `todos=null && isStreaming=true` → 캐시 fallback 유지 (between-turn gap 보호)
2. `todos=null && isStreaming=false` → 캐시 해제 → `displayTodos=null` →
   컴포넌트 null 반환
3. StreamingContext 변경 시 re-render 보장 → 해제 시점 즉시 반영

### R1-2 [MEDIUM]: 다중 scheduler 최신 보장 개선

**문제**: `extractTodoList`가 `tools` 배열 역순 첫 번째를 반환했으나, 다중
scheduler 환경에서 `Object.values(toolCallsMap).flat()` 순서가 시간순이 아님.

**수정**: 전체 순회 + 최대 항목 수 휴리스틱

```typescript
function extractTodoList(entry): TodoList | null {
  let best: TodoList | null = null;
  for (const tool of toolGroup.tools) {
    if (isTodoList(tool.resultDisplay)) {
      // 더 많은 항목 = 더 최신 스냅샷 (각 task tool은 전체 상태 반환)
      // 동일 길이면 나중 발견된 것 선택 (>=)
      if (
        best === null ||
        tool.resultDisplay.todos.length >= best.todos.length
      ) {
        best = tool.resultDisplay;
      }
    }
  }
  return best;
}
```

**한계**: 동일 항목 수 + 상태만 다른 경우(task_update) 배열 순서에 의존. 단일
scheduler 내에서는 시간순 보장되므로 실용적으로 충분.

### R1-3 [MEDIUM]: 렌더 중 setState 증폭 제거

**문제**: `useState` 2곳(`setLastKnownTodos`, `setStableStreaming`)에서
render-during-render 패턴으로 최대 3회 렌더 사이클 발생 가능.

**수정**: `useRef`로 복원

| 항목              | Before (useState)                                      | After (useRef)                                 |
| ----------------- | ------------------------------------------------------ | ---------------------------------------------- |
| `stableStreaming` | `useState(false)` → `setStableStreaming`               | `useRef(false)` → `.current = `                |
| `lastKnownTodos`  | `useState<TodoList\|null>(null)` → `setLastKnownTodos` | `useRef<TodoList\|null>(null)` → `.current = ` |
| 렌더 사이클       | 최대 3회/상태변경                                      | 1회/상태변경                                   |

**근거**: 두 값 모두 동일 렌더 사이클 내에서 설정/읽기되며, 부모 context
변경(StreamingContext, UIState)이 이미 re-render를 트리거하므로 자체 re-render
불필요.

### R1-4 [LOW]: 커넥터 prefix Box 기반 레이아웃

**문제**: `'  ⎿  '` 하드코딩 문자열이 터미널/폰트별 폭 차이에 취약.

**수정**:

```tsx
// Before
<Text color={...}>{index === 0 ? '  ⎿  ' : '     '}</Text>
<TodoItemDisplay ... />

// After
<Box width={5} flexShrink={0}>
  <Text color={...}>{index === 0 ? '  ⎿  ' : '     '}</Text>
</Box>
<Box flexShrink={1}>
  <TodoItemDisplay ... />
</Box>
```

- prefix 영역: `width={5} flexShrink={0}` → 고정 폭, 축소 방지
- 콘텐츠 영역: `flexShrink={1}` → 터미널 좁아질 때 텍스트 래핑 정상 동작

### 추가 테스트 (2건)

| 테스트                                                               | 검증 내용                                             |
| -------------------------------------------------------------------- | ----------------------------------------------------- |
| clears ghost todos when streaming stops and source is empty          | Responding→Idle 전환 + 빈 소스 → 캐시 해제 확인       |
| prefers TodoList with more items when multiple schedulers interleave | 다중 scheduler 환경에서 항목 수 더 많은 TodoList 선택 |

### Hotfix R1 검증 결과

| 검증 항목         | 결과                       |
| ----------------- | -------------------------- |
| CLI build         | 성공 ✅                    |
| Todo.test.tsx     | 25/25 passed ✅            |
| Composer.test.tsx | 21/21 passed ✅            |
| CLI 전체 테스트   | 4856 passed (352 files) ✅ |

---

**작성일**: 2026-03-02 **최종 수정**: 2026-03-02 **상태**: ✅ Phase C (TodoTray
실시간 UI + between-turn 안정화 + Hotfix R1) 완료
