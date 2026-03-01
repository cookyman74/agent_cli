# Agent-CLI 기본 도구 업그레이드 — 전체 작업계획서

> **프로젝트**: Task\* CRUD 도구 4개 신규 구현 + AskUserQuestion markdown
> preview 강화 **작업 브랜치**: `DID/v0.2` **작업 방법론**: TDD (Red → Green →
> Refactor) + Tidy First **작성일**: 2026-03-01

---

## 1. 프로젝트 개요

### 1.1 목표

현재 `write_todos` 도구는 매번 전체 Todo 리스트를 교체하는 모델이다. Claude
Code의 TaskCreate/TaskGet/TaskUpdate/TaskList 패턴을 도입하여 증분 CRUD 기반
태스크 관리를 구현하고, `ask_user` 도구에 markdown preview 기능을 추가한다.

### 1.2 핵심 설계 결정

| #   | 결정                                         | 설계 근거                                             |
| --- | -------------------------------------------- | ----------------------------------------------------- |
| 1   | TaskStore 인메모리 (Map)                     | 세션 수명과 동일, 영속화 불필요                       |
| 2   | 문자열 자동증가 ID ("1", "2", ...)           | Claude Code 호환, LLM 참조 용이                       |
| 3   | 증분 CRUD (TaskCreate/Get/Update/List)       | 토큰 효율 (변경분만 전송), 의존성 그래프 지원         |
| 4   | `returnDisplay: { todos: Todo[] }` 포맷 유지 | 기존 TodoTray UI 수정 없이 재사용                     |
| 5   | `write_todos`와 공존 (Phase A)               | 기존 LLM 호출 패턴 호환, 점진적 전환                  |
| 6   | blocks/blockedBy 양방향 의존성               | SubAgent 위임 시 순서 보장                            |
| 7   | `option.markdown` preview 추가               | ASCII 목업, 코드 스니펫 비교 등 시각적 옵션 비교 지원 |

### 1.3 참고 문서

| 문서                                                       | 설명                                  |
| ---------------------------------------------------------- | ------------------------------------- |
| [plan_20260224.md](../plan_20260224.md)                    | 전체 설계 문서 (Gap 분석 + 상세 설계) |
| [99_TDD_plan.md](../../ai_adapter/template/99_TDD_plan.md) | TDD 방법론                            |

---

## 2. 변경 범위 요약

### 2.1 파일 목록

| #   | 파일                                                | 변경     | 분류 | Phase  |
| --- | --------------------------------------------------- | -------- | ---- | ------ |
| 1   | `packages/core/src/tools/task-store.ts`             | **신규** | Core | 1      |
| 2   | `packages/core/src/tools/task-store.test.ts`        | **신규** | Core | 1      |
| 3   | `packages/core/src/tools/task-create.ts`            | **신규** | Core | 2      |
| 4   | `packages/core/src/tools/task-create.test.ts`       | **신규** | Core | 2      |
| 5   | `packages/core/src/tools/task-get.ts`               | **신규** | Core | 2      |
| 6   | `packages/core/src/tools/task-get.test.ts`          | **신규** | Core | 2      |
| 7   | `packages/core/src/tools/task-update.ts`            | **신규** | Core | 2      |
| 8   | `packages/core/src/tools/task-update.test.ts`       | **신규** | Core | 2      |
| 9   | `packages/core/src/tools/task-list.ts`              | **신규** | Core | 2      |
| 10  | `packages/core/src/tools/task-list.test.ts`         | **신규** | Core | 2      |
| 11  | `packages/core/src/tools/tool-names.ts`             | 수정     | Core | 3      |
| 12  | `packages/core/src/config/config.ts`                | 수정     | Core | 3, 4A  |
| 13  | `packages/core/src/core/prompts.ts`                 | 수정     | Core | 3      |
| 14  | `packages/core/src/confirmation-bus/types.ts`       | 수정     | Core | 4B     |
| 15  | `packages/core/src/tools/ask-user.ts`               | 수정     | Core | 4B     |
| 16  | `packages/cli/src/ui/components/AskUserDialog.tsx`  | 수정     | CLI  | 4A, 4B |
| 17  | `packages/cli/src/ui/components/DialogManager.tsx`  | 수정     | CLI  | 4A     |
| 18  | `packages/cli/src/ui/hooks/` (MessageBus 구독 관련) | 수정     | CLI  | 4A     |

> **#13 추가 근거 (Issue 2)**: `prompts.ts`가 `write_todos` 사용 안내를 조건부
> 삽입 — Task\* 도구도 동일 패턴 필요 **#16~18 추가 근거 (Issue 1)**: `ask_user`
> 도구가 config.ts에 미등록, CLI에 MessageBus 구독 미연결 — E2E 경로 신규 구축
> 필요

### 2.2 의존 관계

```
Phase 1 (TaskStore 인메모리 저장소)
  └─▶ Phase 2 (Task* 도구 4개 구현)
        └─▶ Phase 3 (도구 등록 + 프롬프트 + 빌드 검증)
              └─▶ Phase 5 (Quality Gates + 통합 검증)

Phase 4A (AskUser E2E 경로 구축) — Phase 1~3과 병렬 가능
  └─▶ Phase 4B (AskUser markdown preview 강화)
        └─▶ Phase 5 (Quality Gates + 통합 검증)
```

> Phase 1→2→3은 순차 의존. Phase 4A→4B는 순차 의존. Phase 4A는 Phase 1~3과
> 독립적으로 수행 가능하나, CLI 대화 패턴 이해 필요. Phase 5는 모든 Phase 완료
> 후 수행.
>
> **⚠️ Phase 4 구조 변경 근거 (Issue 1)**: 현재 `ask_user` 도구는 `config.ts`에
> 등록되지 않았고, CLI에 MessageBus 구독이 없어 E2E 경로가 완전히 단절되어 있다.
> markdown preview(4B) 이전에 E2E 경로 구축(4A)이 선행되어야 한다.

---

## 3. Phase별 작업 요약

### Phase 1: Core — TaskStore 인메모리 태스크 저장소

> **상세 계획서**: [Phase1_task_store.md](./Phase1_task_store.md)

| 항목      | 내용                                                |
| --------- | --------------------------------------------------- |
| 범위      | `task-store.ts` (신규), `task-store.test.ts` (신규) |
| 위험 수준 | 🟢 Low — 신규 파일, 기존 코드 영향 없음             |
| 설계 참조 | [plan_20260224.md](../plan_20260224.md) Step 1      |

**주요 산출물:**

- `TaskStore` 클래스 — 인메모리 CRUD + 의존성 관리
- `Task`, `TaskSummary`, `TaskStatus` 타입
- `toTodoList()` → 기존 TodoTray 호환 변환

**TDD 사이클:**

| 단계          | 내용                                            | 상태 |
| ------------- | ----------------------------------------------- | ---- |
| 1.1 사전 작업 | 설계 문서 분석 + 기존 write_todos 패턴 분석     | ⬜   |
| 1.2 RED       | TaskStore CRUD + 상태 전이 + 의존성 테스트 작성 | ⬜   |
| 1.3 GREEN     | TaskStore 최소 구현                             | ⬜   |
| 1.4 REFACTOR  | 코드 구조 개선                                  | ⬜   |
| 1.5 사후 작업 | 빌드 + 린트 + 타입체크 + 결과서 + 커밋          | ⬜   |

---

### Phase 2: Core — Task\* 도구 4개 구현

> **상세 계획서**: [Phase2_task_tools.md](./Phase2_task_tools.md)

| 항목      | 내용                                                                     |
| --------- | ------------------------------------------------------------------------ |
| 범위      | `task-create.ts`, `task-get.ts`, `task-update.ts`, `task-list.ts` (신규) |
| 위험 수준 | 🟡 Medium — 4개 도구 동시 구현, BaseDeclarativeTool 패턴 준수 필요       |
| 설계 참조 | [plan_20260224.md](../plan_20260224.md) Step 2                           |

**주요 산출물:**

- `TaskCreateTool` — 태스크 생성 (subject, description, activeForm, metadata)
- `TaskGetTool` — 태스크 상세 조회
- `TaskUpdateTool` — 태스크 수정/삭제/의존성 관리
- `TaskListTool` — 태스크 전체 요약 목록

**TDD 사이클:**

| 단계             | 내용                                                | 상태 |
| ---------------- | --------------------------------------------------- | ---- |
| 2.1 사전 작업    | Phase 1 결과서 검토 + BaseDeclarativeTool 패턴 분석 | ⬜   |
| 2.2 RED (Part A) | TaskCreate + TaskGet 테스트                         | ⬜   |
| 2.3 GREEN (A)    | TaskCreate + TaskGet 구현                           | ⬜   |
| 2.4 RED (Part B) | TaskUpdate + TaskList 테스트                        | ⬜   |
| 2.5 GREEN (B)    | TaskUpdate + TaskList 구현                          | ⬜   |
| 2.6 REFACTOR     | 공통 패턴 추출, 코드 구조 개선                      | ⬜   |
| 2.7 사후 작업    | 빌드 + 린트 + 타입체크 + 결과서 + 커밋              | ⬜   |

---

### Phase 3: Core — 도구 등록 + 프롬프트 + 빌드 검증

> **상세 계획서**: [Phase3_tool_registration.md](./Phase3_tool_registration.md)

| 항목      | 내용                                                                  |
| --------- | --------------------------------------------------------------------- |
| 범위      | `tool-names.ts`, `config.ts`, `prompts.ts`                            |
| 위험 수준 | 🟡 Medium — 기존 config.ts 수정, write_todos 호환 유지, 프롬프트 수정 |
| 설계 참조 | [plan_20260224.md](../plan_20260224.md) Step 3~4                      |

**주요 산출물:**

- Task\* 상수 4개 `tool-names.ts`에 등록
- `createToolRegistry()`에 TaskStore + Task\* 도구 등록 (동일
  `getUseWriteTodos()` 게이트 적용)
- `prompts.ts`에 Task\* 도구 사용 안내 조건부 삽입
- `write_todos`와 공존 확인 (TodoTray "last wins" 동작 이해)

**TDD 사이클:**

| 단계          | 내용                                                        | 상태 |
| ------------- | ----------------------------------------------------------- | ---- |
| 3.1 사전 작업 | Phase 2 결과서 검토 + 기존 등록 패턴 + prompts.ts 분석      | ⬜   |
| 3.2 RED       | 도구 등록 + 프롬프트 + 빌드 검증 테스트                     | ⬜   |
| 3.3 GREEN     | tool-names.ts + config.ts + prompts.ts 수정                 | ⬜   |
| 3.4 REFACTOR  | write_todos 호환 확인, useWriteTodos 게이트 확인, 코드 정리 | ⬜   |
| 3.5 사후 작업 | 전체 빌드 + 린트 + 타입체크 + 회귀 테스트 + 결과서 + 커밋   | ⬜   |

---

### Phase 4: Core+CLI — AskUser E2E 경로 구축 + markdown preview 강화

> **상세 계획서**:
> [Phase4_askuser_markdown_preview.md](./Phase4_askuser_markdown_preview.md)

| 항목      | 내용                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------- |
| 범위      | `config.ts`, `DialogManager.tsx`, CLI MessageBus 구독, `types.ts`, `ask-user.ts`, `AskUserDialog.tsx` |
| 위험 수준 | 🟠 Medium-High — AskUser E2E 경로 신규 구축 + 스키마 확장 + CLI UI 수정                               |
| 설계 참조 | [plan_20260224.md](../plan_20260224.md) Step 5                                                        |

> **⚠️ 범위 확장 (Issue 1)**: 현재 `ask_user` 도구가 `config.ts`에 등록되지
> 않았고, CLI에 MessageBus 구독이 없어 E2E 경로가 완전히 단절되어 있다. markdown
> preview 이전에 E2E 경로 구축(Part A)이 선행되어야 한다.

**주요 산출물:**

- **Part A (E2E 경로 구축)**: `config.ts`에 `ask_user` 등록, CLI MessageBus
  구독, `DialogManager` 연동
- **Part B (markdown preview)**: `QuestionOption.markdown` 속성 추가, 스키마
  확장, preview 패널 구현

**TDD 사이클:**

| 단계             | 내용                                                                 | 상태 |
| ---------------- | -------------------------------------------------------------------- | ---- |
| 4.1 사전 작업    | AskUser E2E 단절 현황 분석 + CLI 대화 패턴 분석                      | ⬜   |
| 4.2 RED (Part A) | ask_user 도구 등록 + CLI MessageBus 구독 + DialogManager 연동 테스트 | ⬜   |
| 4.3 GREEN (A)    | config.ts 등록 + CLI 구독 + DialogManager 수정                       | ⬜   |
| 4.4 RED (Part B) | Core 타입 + 스키마 + AskUserDialog markdown preview 테스트           | ⬜   |
| 4.5 GREEN (B)    | types.ts + ask-user.ts + AskUserDialog.tsx 수정                      | ⬜   |
| 4.6 REFACTOR     | 컴포넌트 구조 개선                                                   | ⬜   |
| 4.7 사후 작업    | 빌드 + 린트 + 타입체크 + 결과서 + 커밋                               | ⬜   |

---

### Phase 5: Quality Gates + 통합 검증

> **상세 계획서**: [Phase5_quality_gates.md](./Phase5_quality_gates.md)

| 항목      | 내용                                           |
| --------- | ---------------------------------------------- |
| 범위      | Phase 1~4 전체 변경 사항                       |
| 위험 수준 | 🟡 Medium — 통합 시 상호작용 검증 필요         |
| 설계 참조 | [plan_20260224.md](../plan_20260224.md) Step 6 |

**Quality Gates:**

| Gate | 내용                                                                  | 상태 |
| ---- | --------------------------------------------------------------------- | ---- |
| QG1  | Typecheck + Lint (Core + CLI)                                         | ⬜   |
| QG2  | 단위 테스트 전수 확인 (TaskStore + Task\* 4개 + AskUser 변경 테스트)  | ⬜   |
| QG3  | Cross-Module 통합 테스트 (TaskStore → Task\* 도구 → TodoTray UI 연동) | ⬜   |
| QG4  | 수동 E2E 시나리오 검증                                                | ⬜   |

---

## 4. 리스크 매트릭스 (전체)

| #   | 리스크                                          | 영향 | Phase | 대응 방안                                                                                                                           |
| --- | ----------------------------------------------- | ---- | ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| R1  | LLM이 Task\* 대신 write_todos 호출              | 🟡   | 3     | `prompts.ts`에 Task\* 우선 안내 조건부 삽입, write_todos 공존 유지                                                                  |
| R2  | TaskStore 세션 종료 시 데이터 소실              | 🟢   | 1     | 설계상 의도 (세션 수명), 추후 영속화 고려                                                                                           |
| R3  | TodoTray "last wins" 동작                       | 🟠   | 3, 5  | TodoTray는 history 역순 탐색 후 마지막 `todos` 결과만 표시 — Task\*와 write_todos가 동일 UI 슬롯 공유. Phase A 공존 전략에서는 허용 |
| R4  | SubAgent에서 TaskStore 접근 병렬 충돌           | 🟢   | 1     | 단일 스레드 Node.js → race condition 없음                                                                                           |
| R5  | markdown preview 렌더링 품질                    | 🟡   | 4B    | Ink Box + monospace 강제, 길이 제한                                                                                                 |
| R6  | BaseDeclarativeTool 패턴 미준수                 | 🟠   | 2     | 기존 WriteTodosTool/AskUserTool 패턴 엄밀 참조                                                                                      |
| R7  | Core rebuild 누락으로 CLI 테스트 실패           | 🟠   | 5     | Phase 5 시작 시 `npm run build -w @didim365/agent-cli-core` 필수                                                                    |
| R8  | **ask_user E2E 경로 단절**                      | 🟠   | 4A    | config.ts에 미등록 + CLI MessageBus 구독 부재 + DialogManager 미연결. Phase 4A에서 E2E 경로 신규 구축                               |
| R9  | Task\* 도구가 useWriteTodos 게이트 우회         | 🟡   | 3     | `getUseWriteTodos()` 동일 조건으로 Task\* 등록 게이트 적용                                                                          |
| R10 | buildAndExecute AbortSignal 누락 시 테스트 실패 | 🟡   | 2~5   | `const signal = new AbortController().signal` 패턴 필수 적용                                                                        |

---

## 5. 커밋 전략

Tidy First 원칙에 따라 **구조적 변경**과 **동작 변경**을 분리하여 커밋한다.

| Phase | 커밋 | 유형 | 메시지                                                                                          |
| ----- | ---- | ---- | ----------------------------------------------------------------------------------------------- |
| 1     | 1차  | 구조 | `feat(core): add TaskStore — in-memory task CRUD with dependency management`                    |
| 2     | 1차  | 구조 | `feat(core): add TaskCreate + TaskGet tools`                                                    |
| 2     | 2차  | 동작 | `feat(core): add TaskUpdate + TaskList tools with TodoList conversion`                          |
| 3     | 1차  | 동작 | `feat(core): register Task* tools in ToolRegistry with prompts.ts integration`                  |
| 4A    | 1차  | 구조 | `feat(core,cli): wire ask_user E2E path — config registration + CLI MessageBus + DialogManager` |
| 4B    | 1차  | 구조 | `feat(core): add markdown field to QuestionOption + ask_user schema`                            |
| 4B    | 2차  | 동작 | `feat(cli): add markdown preview panel to AskUserDialog`                                        |
| 5     | 1차  | 검증 | `test: Phase 5 quality gates — integration tests + regression verification`                     |

---

## 6. 진행 상황 추적

### Phase별 진행 상태

| Phase | 범위                        | PRE | RED | GREEN | REFACTOR | POST | 결과서 | 커밋 | 상태    |
| ----- | --------------------------- | --- | --- | ----- | -------- | ---- | ------ | ---- | ------- |
| 1     | TaskStore 저장소            | ✅  | ✅  | ✅    | ✅       | ✅   | ✅     | ✅   | ✅ 완료 |
| 2     | Task\* 도구 4개             | ⬜  | ⬜  | ⬜    | ⬜       | ⬜   | ⬜     | ⬜   | ⬜ 대기 |
| 3     | 도구 등록 + 프롬프트 + 빌드 | ⬜  | ⬜  | ⬜    | ⬜       | ⬜   | ⬜     | ⬜   | ⬜ 대기 |
| 4A    | AskUser E2E 경로 구축       | ⬜  | ⬜  | ⬜    | ⬜       | ⬜   | ⬜     | ⬜   | ⬜ 대기 |
| 4B    | AskUser markdown preview    | ⬜  | ⬜  | ⬜    | ⬜       | ⬜   | ⬜     | ⬜   | ⬜ 대기 |
| 5     | Quality Gates + E2E         | ⬜  | —   | —     | —        | ⬜   | ⬜     | ⬜   | ⬜ 대기 |

### 최종 완료 조건

| #   | 항목                                                    | 상태 |
| --- | ------------------------------------------------------- | ---- |
| 1   | Phase 1~4 모든 TDD 사이클 (Red → Green → Refactor) 완료 | ⬜   |
| 2   | 전체 테스트 통과 (`npm test`)                           | ⬜   |
| 3   | Typecheck 에러 0개                                      | ⬜   |
| 4   | Lint 경고 0개                                           | ⬜   |
| 5   | Phase 1~5 각 작업 결과서 작성 완료                      | ⬜   |
| 6   | 모든 변경사항 커밋 완료 (8개 커밋)                      | ⬜   |
| 7   | PR 생성 및 코드 리뷰 요청                               | ⬜   |

---

## 7. 작업 규칙

### 7.1 TDD 사이클

1. **RED**: 실패하는 테스트를 먼저 작성한다
2. **GREEN**: 테스트를 통과하는 최소한의 코드를 구현한다
3. **REFACTOR**: 동작을 유지하면서 코드 구조를 개선한다

### 7.2 Tidy First

- 구조적 변경(파일 생성, 리팩토링)과 동작 변경(기능 추가)을 **별도 커밋**으로
  분리
- 구조적 변경을 먼저 수행한 후 동작 변경을 진행

### 7.3 Phase 간 전환

- 이전 Phase의 **모든 완료 조건**이 충족된 후에만 다음 Phase 시작
- Phase 시작 시 이전 Phase의 **작업 결과서**를 반드시 검토
- Phase 2 이후는 이전 Phase의 **회귀 테스트** 통과 확인 필수
- **예외**: Phase 4A는 Phase 1~3과 독립적으로 수행 가능 (단, CLI 대화 패턴 이해
  필요)

### 7.4 작업 결과서

- 각 Phase 완료 시 `../working_history/Phase{N}_{제목}_{작업일자}.md` 작성
  (디렉토리 미존재 시 생성)
- 내용: 작업 요약, 변경 파일, 테스트 결과, 발견 이슈, 다음 Phase 인수 사항

---

**상태**: Phase 1 ✅ 완료 — Phase 2 시작 대기
