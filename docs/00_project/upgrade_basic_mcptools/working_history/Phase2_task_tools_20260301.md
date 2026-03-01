# Phase 2 작업 결과서: Task\* 도구 4개 구현

> **작업일**: 2026-03-01 **브랜치**: `DID/v0.3` **작업 계획서**:
> [Phase2_task_tools.md](../phase_todolist/Phase2_task_tools.md)

---

## 1. 작업 개요

| 항목        | 내용                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------- |
| 목적        | BaseDeclarativeTool 기반 Task CRUD 도구 4개 구현                                                  |
| 신규 파일   | `task-create.ts` (154줄), `task-get.ts` (124줄), `task-update.ts` (257줄), `task-list.ts` (109줄) |
| 테스트 파일 | `task-create.test.ts`, `task-get.test.ts`, `task-update.test.ts`, `task-list.test.ts`             |
| 기존 변경   | 없음 (신규 파일만 추가)                                                                           |
| 위험 수준   | Low — 기존 코드 영향 없음                                                                         |

---

## 2. 사전 리뷰 이슈 반영 (I1~I5)

| #   | 구분   | 이슈                                         | 대응                                        | 상태 |
| --- | ------ | -------------------------------------------- | ------------------------------------------- | ---- |
| I1  | HIGH   | buildAndExecute validation 실패 시 throw     | 테스트에서 `rejects.toThrow()` 패턴         | ✅   |
| I2  | HIGH   | TaskStore DI 패턴 — Phase 3 연계             | 테스트에서 직접 주입, Phase 3에서 통합      | ✅   |
| I3  | MEDIUM | schema getter override (responseJsonSchema)  | Phase 3에서 도구 등록 시 추가 (의도적 연기) | ⬜   |
| I4  | MEDIUM | execute() 에러 = error 필드 반환 (not throw) | 모든 도구에 적용                            | ✅   |
| I5  | LOW    | REFACTOR 헬퍼 YAGNI                          | inline 유지, 별도 파일 분리 안 함           | ✅   |

---

## 3. TDD 사이클 이행 기록

### 3.1 RED Phase (Part A) — TaskCreate + TaskGet 테스트

| 테스트 그룹 | 내용                                            | 테스트 수 |
| ----------- | ----------------------------------------------- | --------- |
| RED-1       | TaskCreate 기본 (생성, todoList, ID증가, 에러)  | 8         |
| RED-2       | TaskGet 기본 (조회, 미존재, 의존성, validation) | 5         |
| **Part A**  |                                                 | **13**    |

### 3.2 GREEN Phase (Part A) — TaskCreate + TaskGet 구현

| 구현   | 내용                                            | 결과 |
| ------ | ----------------------------------------------- | ---- |
| TASK-1 | `TaskCreateTool` — create + returnDisplay todos | 완료 |
| TASK-2 | `TaskGetTool` — get + 미존재 에러 + JSON 상세   | 완료 |

**GREEN-A 검증**: 13/13 tests PASS.

### 3.3 RED Phase (Part B) — TaskUpdate + TaskList 테스트

| 테스트 그룹 | 내용                                            | 테스트 수 |
| ----------- | ----------------------------------------------- | --------- |
| RED-3       | TaskUpdate (상태, 삭제, 필드, 의존성, display)  | 15        |
| RED-4       | TaskList (빈 목록, 요약, display, blocker 필터) | 6         |
| **Part B**  |                                                 | **21**    |

### 3.4 GREEN Phase (Part B) — TaskUpdate + TaskList 구현

| 구현   | 내용                                                        | 결과 |
| ------ | ----------------------------------------------------------- | ---- |
| TASK-3 | `TaskUpdateTool` — delete/update/dependency + returnDisplay | 완료 |
| TASK-4 | `TaskListTool` — list + 빈 목록 메시지 + returnDisplay      | 완료 |

**GREEN-B 검증**: 21/21 tests PASS.

### 3.5 REFACTOR Phase

패턴 일관성 점검 후 리팩터링 대상 없음 (YAGNI). 34/34 유지.

---

## 4. 사후 검증 결과

| 검증 항목            | 결과                                         |
| -------------------- | -------------------------------------------- |
| 전체 Core 테스트     | 293 files, 5884 passed (기존 5850 + 신규 34) |
| Core 빌드            | 성공                                         |
| ESLint               | 0 errors, 0 warnings                         |
| TypeScript typecheck | 통과                                         |
| Phase 1 회귀         | 없음 (56 tests 유지)                         |

### 기능 검증 체크리스트

| #   | 항목                                                  | 결과 |
| --- | ----------------------------------------------------- | ---- |
| 1   | TaskCreate → 자동 ID + returnDisplay todos            | PASS |
| 2   | TaskGet → 미존재 시 error 필드, 존재 시 상세 JSON     | PASS |
| 3   | TaskUpdate 'deleted' → 물리 삭제 + returnDisplay 갱신 | PASS |
| 4   | TaskUpdate addBlocks → 양방향 관계 설정               | PASS |
| 5   | TaskList → 빈 목록 메시지, 목록 JSON + returnDisplay  | PASS |
| 6   | Phase 1 TaskStore 56 tests 회귀 없음                  | PASS |

---

## 5. 핵심 설계 결정

### 5.1 에러 처리 2-Track 패턴 (I1 반영)

- **validation 에러** (build 단계): JSON Schema + `validateToolParamValues()` →
  자동 throw
- **비즈니스 에러** (execute 단계): `{ error, llmContent, returnDisplay }` 반환
  — 태스크 미존재, 상태 전이 실패 등

### 5.2 TaskUpdate 삭제 처리

`status: 'deleted'` → `taskStore.delete()` 호출 (물리 삭제). JSON Schema의
status enum에 `'deleted'` 포함하되, TaskStore의 `TaskStatus`와 분리
(`'deleted'`는 도구 레벨 의미).

### 5.3 returnDisplay 전략

- TaskCreate, TaskUpdate, TaskList: `{ todos: taskStore.toTodoList() }` →
  TodoTray UI 호환
- TaskGet: `JSON.stringify(task, null, 2)` → 단일 태스크 상세 정보

### 5.4 Constructor DI 패턴

모든 Task\* 도구: `constructor(taskStore: TaskStore, messageBus: MessageBus)` →
`registerCoreTool(TaskCreateTool, taskStore)` 패턴과 호환. Phase 3에서
`createToolRegistry()` 내에 `const taskStore = new TaskStore()` 인스턴스 생성 후
4개 도구에 공유 주입.

---

## 6. 파일 변경 목록

| 파일                                          | 변경 유형 | 줄 수 |
| --------------------------------------------- | --------- | ----- |
| `packages/core/src/tools/task-create.ts`      | 신규      | 154   |
| `packages/core/src/tools/task-create.test.ts` | 신규      | 119   |
| `packages/core/src/tools/task-get.ts`         | 신규      | 124   |
| `packages/core/src/tools/task-get.test.ts`    | 신규      | 66    |
| `packages/core/src/tools/task-update.ts`      | 신규      | 257   |
| `packages/core/src/tools/task-update.test.ts` | 신규      | 190   |
| `packages/core/src/tools/task-list.ts`        | 신규      | 109   |
| `packages/core/src/tools/task-list.test.ts`   | 신규      | 76    |

---

## 7. 사후 리뷰 이슈 (R1~R5)

> Phase 2 완료 후 전체 계획서 리뷰에서 5개 이슈 발견. 코드 레벨 검증 완료.

| #   | 구분   | 이슈                                                         | 수정 방안                                  | 수정 위치              | 상태 |
| --- | ------ | ------------------------------------------------------------ | ------------------------------------------ | ---------------------- | ---- |
| R1  | MEDIUM | activeForm/owner 비문자열 → structuredClone 실패 → 내부 오염 | typeof 가드 추가 (H2 패턴 확장)            | Phase 1-H3 TaskStore   | ✅   |
| R2  | HIGH   | `metadata: null` → `Object.entries(null)` TypeError          | null/비객체 가드 추가                      | Phase 1-H3 TaskStore   | ✅   |
| R3a | MEDIUM | addDependency completed 가드 누락                            | `task.status === 'completed'` early return | Phase 1-H3 TaskStore   | ✅   |
| R3b | MEDIUM | TaskUpdateTool completed 태스크 의존성 미차단                | execute()에 completed 체크 추가            | Phase 2 TaskUpdateTool | ⬜   |
| R4  | LOW    | I3 responseJsonSchema 미해결                                 | Phase 3 연기 (의도적)                      | Phase 3 (변경 없음)    | ✅   |
| R5  | LOW    | 줄 수 메타데이터 불일치 (8개 중 5개)                         | 본 결과서 6장 줄 수 보정 완료              | 본 결과서              | ✅   |

---

## 8. 다음 단계

- **Phase 3**: 도구 등록 + 프롬프트 + 빌드 검증
  - `tool-names.ts`에 Task\* 상수 4개 등록
  - `config.ts`의 `createToolRegistry()`에 TaskStore + Task\* 도구 등록
  - `prompts.ts`에 Task\* 도구 사용 안내 조건부 삽입

---

**작성일**: 2026-03-01 **사후 리뷰**: 2026-03-01 (R1~R5 검증, R4 R5 해소)
**상태**: 완료 (사후 리뷰 이슈 R1~R3 보강 대기)
