# Hotfix 작업 결과서: Task\* 도구 Preview 모델 게이트 분리

> **작업일**: 2026-03-02 **브랜치**: `DID/v0.2`

---

## 1. 문제 현상

| 항목      | 내용                                                              |
| --------- | ----------------------------------------------------------------- |
| 증상      | Preview 모델(`gemini-3.1-pro-preview`) 사용 시 Task\* 도구 미작동 |
| 영향 범위 | task_create, task_get, task_update, task_list 4개 도구 전체       |
| 심각도    | High — Task 관리 기능 완전 비활성화                               |

---

## 2. 근본 원인 (Root Cause)

### 원인 체인

```
isPreviewModel('gemini-3.1-pro-preview') → true
  → useWriteTodos = false (config.ts:696-698)
    → if (this.getUseWriteTodos()) { ... } 블록 스킵 (config.ts:2035)
      → Task* 도구 4개 모두 등록 안 됨
```

### 상세

Phase 2에서 Task* 도구를 `write_todos`와 같은 게이트 내부에 배치했음 (Issue 7:
공존 전략). 그러나 `write_todos`는 preview 모델에서 의도적으로 비활성화된 상태
(`// TODO(joshualitt): Re-evaluate the todo tool for 3 family.`). Task* 도구까지
동일한 제한을 받을 이유가 없으므로 게이트 분리가 필요했음.

---

## 3. 수정 내용

### 3.1 config.ts — Task\* 등록을 write_todos 게이트 밖으로 분리

**파일**: `packages/core/src/config/config.ts`

**Before** (lines 2035-2048):

```typescript
if (this.getUseWriteTodos()) {
  registerCoreTool(WriteTodosTool);
  // Task* tools — Phase A coexistence with write_todos.
  // Gated behind getUseWriteTodos() to match write_todos behavior (Issue 7).
  const taskStore = new TaskStore();
  registerCoreTool(TaskCreateTool, taskStore);
  registerCoreTool(TaskGetTool, taskStore);
  registerCoreTool(TaskUpdateTool, taskStore);
  registerCoreTool(TaskListTool, taskStore);
}
```

**After**:

```typescript
if (this.getUseWriteTodos()) {
  registerCoreTool(WriteTodosTool);
}

// Task* tools — always registered, independent of write_todos gate.
// Preview models disable write_todos (Issue 7), but Task* tools must
// remain available for structured task management regardless of model.
const taskStore = new TaskStore();
registerCoreTool(TaskCreateTool, taskStore);
registerCoreTool(TaskGetTool, taskStore);
registerCoreTool(TaskUpdateTool, taskStore);
registerCoreTool(TaskListTool, taskStore);
```

### 3.2 config.test.ts — 테스트 업데이트

**파일**: `packages/core/src/config/config.test.ts`

| 변경 전 테스트명                                              | 변경 후 테스트명                                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `should NOT register Task* tools when useWriteTodos is false` | `should register Task* tools even when useWriteTodos is false (preview model fix)` |

- `expect(wasRegistered).toBe(false)` → `expect(wasRegistered).toBe(true)`
- Task\* 도구는 `useWriteTodos` 값과 무관하게 항상 등록됨을 검증

---

## 4. 검증 결과

| 검증 항목                        | 결과              |
| -------------------------------- | ----------------- |
| Core typecheck                   | 0 에러 ✅         |
| Lint (config.ts, config.test.ts) | 0 에러 ✅         |
| config.test.ts                   | 146/146 passed ✅ |
| TaskStore 단위 테스트            | 69/69 passed ✅   |
| TaskCreate 단위 테스트           | 8/8 passed ✅     |
| TaskGet 단위 테스트              | 5/5 passed ✅     |
| TaskUpdate 단위 테스트           | 22/22 passed ✅   |
| TaskList 단위 테스트             | 6/6 passed ✅     |
| Phase 5 통합 테스트              | 17/17 passed ✅   |

---

## 5. 동작 매트릭스 (수정 후)

| 모델 유형              | write_todos | Task\* 도구 | 비고                       |
| ---------------------- | ----------- | ----------- | -------------------------- |
| 일반 모델 (gemini-2.5) | ✅ 등록     | ✅ 등록     | 변경 없음                  |
| Preview 모델 (3.x)     | ❌ 미등록   | ✅ 등록     | **수정됨** — 이전엔 미등록 |
| useWriteTodos=false    | ❌ 미등록   | ✅ 등록     | **수정됨** — 이전엔 미등록 |

---

**작성일**: 2026-03-02 **상태**: ✅ Hotfix 완료
