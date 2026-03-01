# Phase 3 작업 결과서: 도구 등록 + 프롬프트 통합

> **작업일**: 2026-03-01 **브랜치**: `DID/v0.3` **작업 계획서**:
> [Phase3_tool_registration.md](../phase_todolist/Phase3_tool_registration.md)

---

## 1. 작업 개요

| 항목        | 내용                                                                |
| ----------- | ------------------------------------------------------------------- |
| 목적        | Task\* 도구 4개를 ToolRegistry에 등록 + prompts.ts에 LLM 안내 삽입  |
| 수정 파일   | `tool-names.ts` (116줄), `config.ts` (2206줄), `prompts.ts` (634줄) |
| 테스트 파일 | `tool-names.test.ts` (96줄), `prompts.test.ts` (549줄)              |
| 위험 수준   | Medium — 기존 config.ts/prompts.ts 수정, write_todos 호환 유지      |

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

## 6. 변경 요약

| 파일                 | 변경 내용                                          |
| -------------------- | -------------------------------------------------- |
| `tool-names.ts`      | +4 상수, ALL_BUILTIN 확장 (109→116줄, +7줄)        |
| `tool-names.test.ts` | +Task\* 상수/배열 테스트 5개 (66→96줄, +30줄)      |
| `config.ts`          | +5 import, +Task\* 등록 + DI 주석 (+17줄)          |
| `prompts.ts`         | +enableTaskTools 플래그, +taskToolsGuidance, +push |
| `prompts.test.ts`    | +Task\* 프롬프트 통합 테스트 3개                   |

---

**작성일**: 2026-03-01 **상태**: ✅ Phase 3 완료
