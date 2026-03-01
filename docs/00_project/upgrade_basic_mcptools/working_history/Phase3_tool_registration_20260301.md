# Phase 3 작업 결과서: 도구 등록 + 프롬프트 통합

> **작업일**: 2026-03-01 **브랜치**: `DID/v0.3` **작업 계획서**:
> [Phase3_tool_registration.md](../phase_todolist/Phase3_tool_registration.md)

---

## 1. 작업 개요

| 항목        | 내용                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------- |
| 목적        | Task\* 도구 4개를 ToolRegistry에 등록 + prompts.ts에 LLM 안내 삽입                       |
| 수정 파일   | `tool-names.ts` (116줄), `config.ts` (2206줄), `prompts.ts` (649줄)                      |
| 테스트 파일 | `tool-names.test.ts` (96줄), `prompts.test.ts` (562줄), `config.test.ts` (2433줄, +93줄) |
| 위험 수준   | Medium — 기존 config.ts/prompts.ts 수정, write_todos 호환 유지                           |

---

## 2. 사전 리뷰 이슈 반영

| 이슈 | 내용                                         | 적용                                                     |
| ---- | -------------------------------------------- | -------------------------------------------------------- |
| I7   | Task\* 도구가 useWriteTodos 게이트 우회 방지 | `getUseWriteTodos()` 동일 조건 블록에서 등록             |
| I2   | LLM이 Task\* 도구 사용법 미인지              | prompts.ts에 `taskToolsGuidance` 조건부 삽입             |
| I6   | TodoTray "last wins" 동작 혼동 가능          | config.ts에 Phase A 공존 전략 주석 문서화                |
| I5   | prompts.test.ts 스냅샷 깨짐 가능             | 기존 mock이 `[]` 반환 → Task\* 미포함 → 스냅샷 변경 없음 |

---

## 3. RED Phase — 테스트 작성

### RED-1: tool-names.test.ts (5개 테스트)

| 테스트 그룹              | 내용                                | 테스트 수 |
| ------------------------ | ----------------------------------- | --------- |
| Task tool name constants | 4개 상수 값 검증 + ALL_BUILTIN 포함 | 5         |

### RED-3: prompts.test.ts (3개 테스트)

| 테스트 그룹                     | 내용                                         | 테스트 수 |
| ------------------------------- | -------------------------------------------- | --------- |
| Task\* tools prompt integration | Task\* 등록 시 안내 포함/미등록 시 미포함/CI | 3         |

**RED 검증**: 7개 실패 확인 (tool-names 5 + prompts 2, "should NOT include"는
정상 통과)

---

## 4. GREEN Phase — 구현

### TASK-001: tool-names.ts

- 4개 상수 추가: `TASK_CREATE_TOOL_NAME`, `TASK_GET_TOOL_NAME`,
  `TASK_UPDATE_TOOL_NAME`, `TASK_LIST_TOOL_NAME`
- `ALL_BUILTIN_TOOL_NAMES` 배열에 4개 추가 (14 → 18개)

### TASK-002 + TASK-004: config.ts

- import 5개 추가: `TaskStore`, `TaskCreateTool`, `TaskGetTool`,
  `TaskUpdateTool`, `TaskListTool`
- `createToolRegistry()` 내 `getUseWriteTodos()` 블록에 Task\* 등록:
  - 단일 `TaskStore` 인스턴스 생성 → 4개 도구에 DI
  - Phase A 공존 전략 주석 포함 (Issue 6 문서화)

### TASK-003: prompts.ts

- `enableTaskTools` 플래그 추가: `getAllToolNames().includes('task_create')`
- `taskToolsGuidance` 프롬프트 키 추가: Task\* 도구 설명 + write_todos 비교 안내
- `orderedPrompts` 배열에 조건부 push: `enableTaskTools → taskToolsGuidance`

### TASK-005: 스냅샷

- 기존 스냅샷 테스트는 `getAllToolNames → []` mock 사용 → Task\* 미포함 → 스냅샷
  변경 없음
- 별도 갱신 불필요

**GREEN 검증**: 60/60 tests PASS (베이스라인 52 + 신규 8)

---

## 5. 검증 결과

| 검증 항목                   | 결과                              |
| --------------------------- | --------------------------------- |
| Core 전체 테스트            | 293 files, 5908 passed, 0 failed  |
| Core 빌드                   | 성공                              |
| CLI 빌드                    | 성공                              |
| ESLint                      | 0 에러                            |
| TypeScript Core             | 0 에러                            |
| TypeScript CLI              | 0 에러                            |
| Phase 1~2 회귀              | 없음 (87 task tests 포함 유지)    |
| write_todos 공존            | 동일 조건 블록에서 함께 등록      |
| Task\* useWriteTodos 게이트 | getUseWriteTodos() 내부 등록 확인 |
| prompts.ts Task\* 안내      | enableTaskTools 조건부 삽입 확인  |

---

## 6. 변경 요약 (초기 커밋: `1827a65ae`)

| 파일                 | 변경 내용                                          |
| -------------------- | -------------------------------------------------- |
| `tool-names.ts`      | +4 상수, ALL_BUILTIN 확장 (109→116줄, +7줄)        |
| `tool-names.test.ts` | +Task\* 상수/배열 테스트 5개 (66→96줄, +30줄)      |
| `config.ts`          | +5 import, +Task\* 등록 + DI 주석 (+17줄)          |
| `prompts.ts`         | +enableTaskTools 플래그, +taskToolsGuidance, +push |
| `prompts.test.ts`    | +Task\* 프롬프트 통합 테스트 3개                   |

---

## 7. 사후 리뷰 이슈 (R10~R14)

> Phase 3 완료 후 Phase 1~3 전체 리뷰에서 5개 이슈 발견. 코드 레벨 검증 후 TDD
> 사이클로 수정 완료.

| 이슈 | 심각도 | 내용                                                   | 수정                                               |
| ---- | ------ | ------------------------------------------------------ | -------------------------------------------------- |
| R10  | MEDIUM | TaskStore metadata shallow copy → 외부 mutation 오염   | `structuredClone()` for create/update              |
| R11  | MEDIUM | prompts.ts `enableTaskTools`가 `task_create`만 체크    | `registeredTaskTools` 배열 기반 동적 프롬프트 생성 |
| R12  | LOW    | task-update 빈 배열 `[]`이 truthy → false warning 발생 | `.length > 0` 가드 추가                            |
| R13  | LOW    | config 레벨 Task\* 등록 테스트 미존재                  | 3개 테스트 추가 (등록/게이트/공유 TaskStore)       |
| R14  | LOW    | Phase2 작업보고서 라인 수 오류 (228→258)               | 문서 수정                                          |

### R10: TaskStore metadata deep copy (task-store.ts)

- **원인**: `{ ...params.metadata }` shallow copy → 중첩 객체 참조 공유
- **수정**: `create()`, `update()` 모두 `structuredClone(params.metadata)` 적용
- **테스트**: +2개 (`metadata deep copy isolation` describe in
  task-store.test.ts)

### R11: prompts.ts 동적 registeredTaskTools (prompts.ts)

- **원인**: `enableTaskTools = includes('task_create')` → partial coreTools 시
  미등록 도구도 안내
- **수정**: 4개 tool name을 `getAllToolNames()`로 필터 → `registeredTaskTools`
  배열 기반 동적 프롬프트
- **테스트**: +1개 (`partial coreTools` case in prompts.test.ts)

### R12: task-update 빈 배열 가드 (task-update.ts)

- **원인**: `this.params.addBlocks || this.params.addBlockedBy` — `[]`이 truthy
- **수정**: `.length > 0` 가드 추가
- **테스트**: +2개 (`empty dependency array guard` describe in
  task-update.test.ts)

### R13: config.test.ts Task\* 등록 테스트 (config.test.ts)

- **추가**: 3개 테스트 (`Task* tool registration` describe)
  - `should register all 4 Task* tools when useWriteTodos is true (default)`
  - `should NOT register Task* tools when useWriteTodos is false`
  - `should pass a shared TaskStore instance to all 4 Task* tools`
- **mock 추가**: `vi.mock` 6개 (write-todos, task-store,
  task-create/get/update/list)

### R14: Phase2 작업보고서 수정

- `task-update.test.ts` 라인 수: 228 → 258 (R6-R9 적용 후 실제 라인 수)

---

## 8. 리뷰 후 검증 결과 (커밋: `de90ba062`)

| 검증 항목        | 결과                             |
| ---------------- | -------------------------------- |
| Core 전체 테스트 | 293 files, 5916 passed, 0 failed |
| 대상 파일 테스트 | 4 files, 284 passed              |
| Core 빌드        | 성공                             |
| ESLint           | 0 에러                           |

### 리뷰 후 변경 요약 (8 files, +188/-13)

| 파일                  | 변경 유형 | 줄 수 변화   |
| --------------------- | --------- | ------------ |
| `task-store.ts`       | 수정      | 273→287줄    |
| `task-store.test.ts`  | 수정      | 641→668줄    |
| `task-update.ts`      | 수정      | 281→283줄    |
| `task-update.test.ts` | 수정      | 258→282줄    |
| `prompts.ts`          | 수정      | 634→649줄    |
| `prompts.test.ts`     | 수정      | 549→562줄    |
| `config.test.ts`      | 수정      | 2340→2433줄  |
| Phase2 작업보고서     | 수정      | 라인 수 정정 |

---

## 9. 커밋 이력

| 커밋        | 메시지                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| `1827a65ae` | `feat(core): register Task* tools in ToolRegistry with prompts integration`                           |
| `de90ba062` | `fix(core): harden Task* tools — metadata deep copy, empty deps guard, dynamic prompts, config tests` |

---

**작성일**: 2026-03-01 **상태**: ✅ Phase 3 완료 (도구 등록 + 프롬프트 통합 +
R10~R14 리뷰 수정)
