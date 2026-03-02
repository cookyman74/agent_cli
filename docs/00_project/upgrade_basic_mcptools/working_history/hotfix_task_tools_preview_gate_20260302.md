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

## 3. 수정 내용 (초기 Hotfix)

### 3.1 config.ts — Task\* 등록을 write_todos 게이트 밖으로 분리

**파일**: `packages/core/src/config/config.ts`

- Task\* 도구 등록을 `if (this.getUseWriteTodos())` 블록 밖으로 이동
- `useWriteTodos` 플래그는 `write_todos` 전용으로 역할 한정

### 3.2 config.test.ts — 테스트 업데이트

| 변경 전 테스트명                                              | 변경 후 테스트명                                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `should NOT register Task* tools when useWriteTodos is false` | `should register Task* tools even when useWriteTodos is false (preview model fix)` |

---

## 4. 리뷰 피드백 반영 (R1~R4)

### R1. MEDIUM — useWriteTodos 의미 변경 하위호환 리스크

**문제**: 기존에 `useWriteTodos=false`로 Task\*까지 비활성화하던 환경에서 동작
변경.

**조치**: config.ts 주석을 보강하여 `useWriteTodos`가 `write_todos` 전용
플래그임을 명시. Task\* 도구는 별도의 `coreTools` allowlist로 제어 가능함을
문서화.

```typescript
// Rationale: useWriteTodos is disabled for preview models (gemini-3.x)
// and can be explicitly set to false. However, useWriteTodos only controls
// the legacy write_todos tool; Task* tools are a separate, structured task
// management system that should remain available regardless of model type.
```

### R2. MEDIUM — 문서 "항상 등록" 부정확

**문제**: 코드 주석과 문서에서 "always registered" 표현이 `coreTools` 제한을
반영하지 않음.

**조치**: 코드 주석 수정 — `coreTools` allowlist에 의한 필터링이 여전히 적용됨을
명시.

```typescript
// Note: Task* tools still go through registerCoreTool(), so they ARE
// subject to the coreTools allowlist filter. This is intentional —
// restricted tool environments (e.g., sLM mode) can still exclude them.
```

### R3. MEDIUM — 회귀 테스트 미흡

**문제**: 기존 테스트는 `useWriteTodos:false`만 검증하고, Preview 모델에서
"write_todos OFF + Task\* ON" 조합을 직접 검증하지 않음.

**조치**: 테스트 2개 추가.

| 테스트명                                                                      | 검증 내용                                                             |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `should register Task* but NOT write_todos on preview models (R3 regression)` | `PREVIEW_GEMINI_31_MODEL` 사용 시 write_todos ❌, Task\* ✅ 동시 검증 |
| `should NOT register Task* tools when coreTools allowlist excludes them (R4)` | `coreTools: ['ShellTool']`일 때 Task\* ❌ + TaskStore 미생성 검증     |

### R4. LOW — TaskStore 불필요 생성

**문제**: coreTools allowlist로 Task\*가 전부 차단되어도 TaskStore가 생성됨.

**조치**: Task\* 등록 전에 coreTools allowlist를 사전 검사하여, 하나라도 등록
가능한 도구가 있을 때만 TaskStore를 생성하는 가드 패턴 적용.

```typescript
const coreToolsAllowlist = this.getCoreTools();
const anyTaskToolAllowed =
  !coreToolsAllowlist ||
  taskToolClasses.some((TC) => {
    const name = TC.Name || TC.name;
    const normalized = name.replace(/^_+/, '');
    return coreToolsAllowlist.some(
      (t) =>
        t === name ||
        t === normalized ||
        t.startsWith(`${name}(`) ||
        t.startsWith(`${normalized}(`),
    );
  });

if (anyTaskToolAllowed) {
  const taskStore = new TaskStore();
  registerCoreTool(TaskCreateTool, taskStore);
  // ...
}
```

---

## 5. 검증 결과

| 검증 항목                        | 결과              |
| -------------------------------- | ----------------- |
| Core typecheck                   | 0 에러 ✅         |
| Lint (config.ts, config.test.ts) | 0 에러 ✅         |
| config.test.ts                   | 148/148 passed ✅ |
| TaskStore 단위 테스트            | 69/69 passed ✅   |
| TaskCreate 단위 테스트           | 8/8 passed ✅     |
| TaskGet 단위 테스트              | 5/5 passed ✅     |
| TaskUpdate 단위 테스트           | 22/22 passed ✅   |
| TaskList 단위 테스트             | 6/6 passed ✅     |
| Phase 5 통합 테스트              | 17/17 passed ✅   |

---

## 6. 동작 매트릭스 (최종)

| 모델 유형               | write_todos | Task\* 도구 | 비고                       |
| ----------------------- | ----------- | ----------- | -------------------------- |
| 일반 모델 (gemini-2.5)  | ✅ 등록     | ✅ 등록     | 변경 없음                  |
| Preview 모델 (3.x)      | ❌ 미등록   | ✅ 등록     | **수정됨** — 이전엔 미등록 |
| useWriteTodos=false     | ❌ 미등록   | ✅ 등록     | **수정됨** — 이전엔 미등록 |
| coreTools 제한 환경     | allowlist   | allowlist   | coreTools 필터 적용        |
| coreTools에 Task\* 없음 | N/A         | ❌ 미등록   | TaskStore도 미생성 (R4)    |

---

## 7. 리뷰 피드백 대응 요약

| #   | 심각도 | 이슈                               | 조치             | 상태 |
| --- | ------ | ---------------------------------- | ---------------- | ---- |
| R1  | MEDIUM | useWriteTodos 의미 변경 하위호환   | 코드 주석 보강   | ✅   |
| R2  | MEDIUM | 문서 "항상 등록" 부정확            | 주석 + 문서 수정 | ✅   |
| R3  | MEDIUM | Preview 모델 조합 회귀 테스트 없음 | 테스트 2개 추가  | ✅   |
| R4  | LOW    | TaskStore 불필요 생성              | 가드 패턴 적용   | ✅   |

---

**작성일**: 2026-03-02 **상태**: ✅ Hotfix + 리뷰 반영 완료
