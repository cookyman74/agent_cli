# Phase 5: Quality Gates + 통합 검증

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 전체
> 기능 통합 후 품질 게이트 및 E2E 검증 **참고 문서**:
>
> - [99_TDD_plan.md](../../ai_adapter/template/99_TDD_plan.md) — TDD 방법론
> - [plan_20260224.md](../plan_20260224.md) — Step 6: 테스트 및 검증

---

## 작업 개요

| 항목        | 내용                                           |
| ----------- | ---------------------------------------------- |
| 프로젝트    | Agent-CLI 기본 도구 업그레이드 — 통합 검증     |
| 영향 범위   | Phase 1~4 전체 변경 사항                       |
| 위험 수준   | 🟡 Medium — 통합 시 예기치 않은 상호작용 가능  |
| 성능 민감도 | 🟢 Low                                         |
| 참고 설계   | [plan_20260224.md Step 6](../plan_20260224.md) |
| 작업 브랜치 | `DID/v0.2`                                     |

---

## 핵심 리스크 요약

| 리스크                                              | 영향      | 대응 방안                                                                | 상태 |
| --------------------------------------------------- | --------- | ------------------------------------------------------------------------ | ---- |
| Core rebuild 누락으로 CLI 테스트 실패               | 🟠 Medium | Phase 5 시작 시 `npm run build -w @didim365/agent-cli-core` 필수         | ⬜   |
| Task\* + write_todos TodoTray "last wins" (Issue 6) | 🟡 Medium | 공존 테스트: 각 독립 데이터 유지, UI는 마지막 호출자 표시 — Phase A 허용 | ⬜   |
| AskUser markdown 변경이 기존 UI 깨뜨림              | 🟡 Medium | 기존 ask_user 호출 (markdown 없음) 회귀 테스트                           | ⬜   |
| AskUser E2E 런타임 MessageBus 연동 누락 (Issue 9)   | 🟠 Medium | 런타임 MessageBus 라운드트립 통합 테스트 추가                            | ⬜   |

---

## 5.1 사전 작업 (Pre-Work)

- [ ] **[REVIEW]** Phase 1~4 작업 결과서 일괄 검토
  - Phase 1: `../working_history/Phase1_task_store_{작업일자}.md`
  - Phase 2: `../working_history/Phase2_task_tools_{작업일자}.md`
  - Phase 3: `../working_history/Phase3_tool_registration_{작업일자}.md`
  - Phase 4: `../working_history/Phase4_askuser_markdown_preview_{작업일자}.md`
  - 확인: 각 Phase 완료 조건 충족 여부, 미해결 이슈

- [ ] **[BUILD]** 전체 빌드 확인

  ```bash
  npm run build -w @didim365/agent-cli-core
  npm run build -w @didim365/agent-cli
  ```

- [ ] **[BASELINE]** 전체 테스트 베이스라인
  ```bash
  npm test -w @didim365/agent-cli-core
  npm test -w @didim365/agent-cli
  ```

---

## 5.2 Quality Gate 1: Typecheck + Lint

- [ ] **[TYPECHECK-CORE]** Core 타입체크

  ```bash
  npm run typecheck -w @didim365/agent-cli-core
  ```

- [ ] **[TYPECHECK-CLI]** CLI 타입체크

  ```bash
  npm run typecheck -w @didim365/agent-cli
  ```

- [ ] **[LINT-CORE]** Core 린터

  ```bash
  npm run lint -w @didim365/agent-cli-core
  ```

- [ ] **[LINT-CLI]** CLI 린터
  ```bash
  npm run lint -w @didim365/agent-cli
  ```

---

## 5.3 Quality Gate 2: 단위 테스트 전수 확인

### Core — TaskStore + Task\* 도구

- [ ] **[TEST-CORE-1]** TaskStore 테스트

  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/task-store.test
  ```

- [ ] **[TEST-CORE-2]** TaskCreate 테스트

  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/task-create.test
  ```

- [ ] **[TEST-CORE-3]** TaskGet 테스트

  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/task-get.test
  ```

- [ ] **[TEST-CORE-4]** TaskUpdate 테스트

  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/task-update.test
  ```

- [ ] **[TEST-CORE-5]** TaskList 테스트

  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/task-list.test
  ```

### Core — AskUser 변경

- [ ] **[TEST-CORE-6]** AskUser 테스트 (markdown 스키마 + E2E 경로 포함)

  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/ask-user.test
  ```

### Core — 전체 회귀

- [ ] **[TEST-CORE-7]** Core 전체 테스트
  ```bash
  npm test -w @didim365/agent-cli-core
  ```

### CLI — AskUserDialog + DialogManager 변경

- [ ] **[TEST-CLI-1]** AskUserDialog 테스트 (markdown preview 포함)

  ```bash
  npm test -w @didim365/agent-cli -- src/ui/components/AskUserDialog.test
  ```

- [ ] **[TEST-CLI-2]** DialogManager 테스트 (AskUserDialog 연동)

  ```bash
  npm test -w @didim365/agent-cli -- src/ui/components/DialogManager.test
  ```

### CLI — 전체 회귀

- [ ] **[TEST-CLI-3]** CLI 전체 테스트
  ```bash
  npm test -w @didim365/agent-cli
  ```

---

## 5.4 Quality Gate 3: Cross-Module 통합 테스트

> **목적**: Phase 1~4의 변경이 서로 올바르게 연동되는지 검증

### TaskStore → Task\* 도구 → TodoTray UI 연동

- [ ] **[INTEGRATION-1]** TaskCreate → TaskList 왕복 테스트

  ```typescript
  const signal = new AbortController().signal; // Issue 4: AbortSignal 필수

  // TaskCreate로 태스크 생성 → TaskList로 조회 → 동일 데이터 확인
  describe('Task* tools integration', () => {
    it('TaskCreate → TaskList round-trip', async () => {
      // 1. TaskCreate 실행
      const createResult = await createTool.buildAndExecute(
        {
          subject: 'Integration Test',
          description: 'Testing round-trip',
        },
        signal,
      );
      const taskId = JSON.parse(createResult.llmContent as string).taskId;

      // 2. TaskList 실행 → 생성된 태스크 존재 확인
      const listResult = await listTool.buildAndExecute({}, signal);
      const tasks = JSON.parse(listResult.llmContent as string);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(taskId);
    });
  });
  ```

- [ ] **[INTEGRATION-2]** TaskCreate → TaskUpdate → TaskGet 워크플로우 테스트

  ```typescript
  it('TaskCreate → TaskUpdate → TaskGet workflow', async () => {
    // 1. 생성
    const createResult = await createTool.buildAndExecute(
      {
        subject: 'Workflow Test',
        description: 'Testing workflow',
        activeForm: 'Testing',
      },
      signal,
    );
    const taskId = JSON.parse(createResult.llmContent as string).taskId;

    // 2. 상태 변경
    await updateTool.buildAndExecute(
      {
        taskId,
        status: 'in_progress',
      },
      signal,
    );

    // 3. 조회 → in_progress 확인
    const getResult = await getTool.buildAndExecute({ taskId }, signal);
    const task = JSON.parse(getResult.llmContent as string);
    expect(task.status).toBe('in_progress');
  });
  ```

- [ ] **[INTEGRATION-3]** returnDisplay 포맷 일관성 검증

  ```typescript
  it('all Task* tools return compatible TodoList in returnDisplay', async () => {
    // TaskCreate의 returnDisplay
    const createResult = await createTool.buildAndExecute(
      {
        subject: 'Test',
        description: 'Desc',
      },
      signal,
    );
    expect(createResult.returnDisplay).toHaveProperty('todos');
    expect(Array.isArray((createResult.returnDisplay as any).todos)).toBe(true);

    // TaskUpdate의 returnDisplay
    const updateResult = await updateTool.buildAndExecute(
      {
        taskId: '1',
        status: 'in_progress',
      },
      signal,
    );
    expect(updateResult.returnDisplay).toHaveProperty('todos');

    // TaskList의 returnDisplay
    const listResult = await listTool.buildAndExecute({}, signal);
    expect(listResult.returnDisplay).toHaveProperty('todos');
  });
  ```

### Task\* 도구 + write_todos 공존 검증 (Issue 6)

- [ ] **[INTEGRATION-4]** write_todos + Task\* 도구 공존 동작 확인

  ```typescript
  describe('write_todos + Task* coexistence (Issue 6)', () => {
    it('write_todos and Task* maintain independent data stores', async () => {
      // Task* 도구로 태스크 생성
      await createTool.buildAndExecute(
        {
          subject: 'Task Tool Task',
          description: 'Via task_create',
        },
        signal,
      );

      // write_todos로 별도 Todo 설정
      const writeTodosResult = await writeTodosTool.buildAndExecute(
        {
          todos: [{ description: 'Write Todos Task', status: 'pending' }],
        },
        signal,
      );

      // write_todos는 자체 데이터만 반영 (TaskStore와 무관)
      expect(writeTodosResult.returnDisplay).toEqual({
        todos: [{ description: 'Write Todos Task', status: 'pending' }],
      });

      // Task* 도구의 데이터도 독립 유지
      const listResult = await listTool.buildAndExecute({}, signal);
      const tasks = JSON.parse(listResult.llmContent as string);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].subject).toBe('Task Tool Task');
    });

    it('TodoTray shows last caller data ("last wins" behavior)', async () => {
      // ⚠️ Issue 6: TodoTray는 uiState.history 역순 탐색 → 마지막 todos 결과만 표시
      // Task* 호출 → write_todos 호출 → TodoTray에는 write_todos 데이터만 표시
      // 이것은 Phase A 공존 전략에서 허용되는 동작이다.
      //
      // 이 테스트는 "last wins" 동작을 명시적으로 문서화한다.
      // Phase B(전환) 시 write_todos 제거로 해소된다.
    });
  });
  ```

### AskUser E2E 연동 + markdown preview 통합

- [ ] **[INTEGRATION-5]** Core → CLI 연동: markdown 필드 전달 확인

  ```bash
  # Core의 QuestionOption.markdown이 CLI AskUserDialog까지 전달되는지 빌드 후 타입체크
  npm run build -w @didim365/agent-cli-core && npm run typecheck -w @didim365/agent-cli
  ```

- [ ] **[INTEGRATION-6]** AskUser MessageBus 런타임 라운드트립 테스트 (1차 Issue
      9, 2차 Issue 1,2,3)

  ```typescript
  import {
    createMockMessageBus,
    getMockMessageBusInstance,
  } from '../test-utils/mock-message-bus';
  import {
    MessageBusType,
    AskUserRequest,
    AskUserResponse,
  } from '../confirmation-bus/types';

  describe('AskUser MessageBus round-trip (Issue 2, 9)', () => {
    it('should have ask_user registered in tool registry', async () => {
      // 2차 Issue 2: registry에서 도구를 가져와 등록 상태를 확인
      const registry = await config.createToolRegistry();
      const askUserTool = registry.getTool('ask_user');
      expect(askUserTool).toBeDefined();
    });

    it('should complete full MessageBus cycle: request → response', async () => {
      // 2차 Issue 2: new AskUserTool() 직접 생성 대신 registry 등록 검증과 분리
      // MessageBus 라운드트립은 mock 기반으로 동작 검증
      const mockBus = createMockMessageBus();
      const mockInstance = getMockMessageBusInstance(mockBus);
      const signal = new AbortController().signal;
      const tool = new AskUserTool(mockBus);

      // 2차 Issue 1: subscribe auto-respond 패턴 (Phase 4 RED-A2와 동일)
      mockBus.subscribe(
        MessageBusType.ASK_USER_REQUEST,
        (msg: AskUserRequest) => {
          // 발행된 요청 검증
          expect(msg.questions).toHaveLength(1);
          expect(msg.questions[0].question).toBe('Runtime test?');

          mockInstance.publish({
            type: MessageBusType.ASK_USER_RESPONSE,
            correlationId: msg.correlationId,
            answers: { '0': 'Yes' }, // 2차 Issue 1: index 기반 키
          } as AskUserResponse);
        },
      );

      const invocation = tool.build({
        questions: [
          {
            question: 'Runtime test?',
            header: 'Test',
            options: [
              { label: 'Yes', description: 'Confirm' },
              { label: 'No', description: 'Deny' },
            ],
            multiSelect: false,
          },
        ],
      });

      // 2차 Issue 1: execute(signal) — AbortSignal 필수
      const result = await invocation.execute(signal);

      // 결과 검증
      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('Yes');

      // 발행 메시지 검증 — .getLastPublished() 없음 → publishedMessages 직접 조회
      const publishedRequest = mockInstance.publishedMessages.find(
        (m) => m.type === MessageBusType.ASK_USER_REQUEST,
      );
      expect(publishedRequest).toBeDefined();
    });

    it('should resolve with cancel result when signal aborted (Issue 3)', async () => {
      const mockBus = createMockMessageBus();
      const tool = new AskUserTool(mockBus);
      const controller = new AbortController();

      // auto-respond 없이 실행 → abort로 취소
      const invocation = tool.build({
        questions: [
          {
            question: 'Will cancel',
            header: 'Test',
            options: [{ label: 'A', description: 'First' }],
            multiSelect: false,
          },
        ],
      });

      const executePromise = invocation.execute(controller.signal);
      controller.abort();

      const result = await executePromise;
      expect(result.error).toBeDefined();
      expect(result.llmContent).toBe('Tool execution cancelled by user.');
    });
  });
  ```

  > **2차 Issue 2 해소**: 기존 코드는 `new AskUserTool(mockMessageBus)` 직접
  > 생성으로 registry를 우회하여 E2E를 검증하지 않았다. 수정본은 (1) registry
  > 등록 검증 테스트 분리, (2) MessageBus 라운드트립은 mock 기반이지만 동일한
  > mock 패턴으로 통합 동작 확인.
  >
  > **1차 Issue 9 근거**: MessageBus 라운드트립(요청→응답)이 런타임에서 실제로
  > 작동하는지 검증. Phase 4A에서 E2E 경로를 신규 구축했으므로 통합 환경에서
  > 정상 동작 확인 필수.
  >
  > **2차 Issue 1 반영**: `execute(signal)` AbortSignal 필수, `answers` index
  > 기반 키, `getMockMessageBusInstance()` 사용, `.getLastPublished()` 대신
  > `publishedMessages` 배열 직접 조회.
  >
  > **2차 Issue 3 반영**: Cancel 시나리오 테스트 추가 — `signal.abort()` →
  > cancel resolve 계약 검증.

---

## 5.5 Quality Gate 4: 수동 E2E 시나리오 검증

### Task\* 도구 기본 동작

| #   | 시나리오                          | 기대 결과                                             | 상태 |
| --- | --------------------------------- | ----------------------------------------------------- | ---- |
| 1   | `task_create` 호출                | 태스크 생성, 자동 ID 부여, TodoTray에 pending 표시    | ⬜   |
| 2   | `task_get` 으로 조회              | 상세 정보 JSON (subject, description, status, blocks) | ⬜   |
| 3   | `task_update` 로 in_progress 전환 | 상태 변경, TodoTray 갱신                              | ⬜   |
| 4   | `task_update` 로 completed 전환   | 완료 표시, TodoTray 갱신                              | ⬜   |
| 5   | `task_list` 전체 목록 조회        | 요약 목록 JSON + TodoTray 갱신                        | ⬜   |
| 6   | `task_update` 로 deleted 처리     | 태스크 삭제, TodoTray에서 제거                        | ⬜   |

### Task\* 도구 고급 시나리오

| #   | 시나리오                                      | 기대 결과                                      | 상태 |
| --- | --------------------------------------------- | ---------------------------------------------- | ---- |
| 7   | 의존성 설정 (addBlocks/addBlockedBy)          | 양방향 관계 설정, list에서 blockedBy 표시      | ⬜   |
| 8   | completed 상태 재변경 시도                    | 거부 (에러 반환)                               | ⬜   |
| 9   | 미존재 태스크 조회/수정/삭제                  | 에러 반환 (not found)                          | ⬜   |
| 10  | activeForm + in_progress → TodoTray 표시      | "subject — activeForm" 포맷                    | ⬜   |
| 11  | metadata merge (기존 키 유지 + 새 키 추가)    | 병합된 metadata                                | ⬜   |
| 12  | write_todos + Task\* 도구 공존 동작 (Issue 6) | 각 독립 데이터, TodoTray "last wins" 동작 허용 | ⬜   |

### AskUser E2E 시나리오

| #   | 시나리오                                      | 기대 결과                                | 상태 |
| --- | --------------------------------------------- | ---------------------------------------- | ---- |
| 13  | ask_user 도구 호출 → 다이얼로그 표시 (Part A) | AskUserDialog 렌더링, 사용자 응답 수집   | ⬜   |
| 14  | markdown 있는 옵션 질문 (Part B)              | side-by-side 레이아웃, preview 패널 표시 | ⬜   |
| 15  | 포커스 이동 시 preview 갱신 (Part B)          | 선택된 옵션의 markdown 콘텐츠로 변경     | ⬜   |
| 16  | markdown 없는 기존 방식 질문                  | 기존 레이아웃 유지 (회귀 없음)           | ⬜   |
| 17  | multiSelect + markdown 조합                   | preview 미표시 (Claude Code 동작과 동일) | ⬜   |
| 18  | ask_user 취소 (signal.abort) (2차 Issue 3)    | cancel resolve + cleanup (hang 없음)     | ⬜   |

---

## 5.6 사후 작업 (Post-Work)

- [ ] **[SNAPSHOT]** 스냅샷 테스트 업데이트 (필요 시)

  ```bash
  npm test -w @didim365/agent-cli -- --update  # 스냅샷 갱신
  # 갱신된 스냅샷 diff 수동 확인
  ```

- [ ] **[DOC]** 작업 결과서 작성
  - 파일: `../working_history/Phase5_quality_gates_{작업일자}.md`
  - 내용:
    - 전체 테스트 결과 요약
    - E2E 시나리오 18개 통과/실패 현황
    - 발견된 이슈 및 해결 방법
    - Phase 1~5 전체 작업 요약

- [ ] **[COMMIT]** 최종 커밋
  ```bash
  git add .
  git commit -m "test: Phase 5 quality gates — integration tests + regression verification"
  ```

---

## Phase 완료 조건

| 검증 항목                                                    | 상태 |
| ------------------------------------------------------------ | ---- |
| Typecheck: Core + CLI 통과                                   | ⬜   |
| Lint: Core + CLI 통과                                        | ⬜   |
| 단위 테스트: Core 전체 PASS                                  | ⬜   |
| 단위 테스트: CLI 전체 PASS                                   | ⬜   |
| 통합 테스트: Task\* 도구 워크플로우 확인                     | ⬜   |
| 통합 테스트: write_todos 공존 + "last wins" 문서화 (Issue 6) | ⬜   |
| 통합 테스트: AskUser markdown 전달 확인                      | ⬜   |
| 통합 테스트: AskUser MessageBus 라운드트립 (Issue 9)         | ⬜   |
| 통합 테스트: AskUser cancel 계약 검증 (2차 Issue 3)          | ⬜   |
| E2E 시나리오 #1~#6: Task\* 기본 동작                         | ⬜   |
| E2E 시나리오 #7~#12: Task\* 고급 + 공존                      | ⬜   |
| E2E 시나리오 #13~#18: AskUser E2E + markdown + cancel        | ⬜   |
| 작업 결과서 작성                                             | ⬜   |
| 커밋 완료                                                    | ⬜   |

---

## 최종 체크리스트

### TDD 사이클 완료

- [ ] Phase 1~4 모든 Red → Green → Refactor 사이클 완료
- [ ] 전체 테스트 통과 (`npm test`)
- [ ] 린터 경고 0개
- [ ] 타입체크 에러 0개

### 문서화

- [ ] Phase 1~5 각 작업 결과서 작성 완료
- [ ] 변경 로그 업데이트

### 최종 커밋 및 PR

- [ ] 모든 변경사항 커밋 완료 (8개 커밋)
- [ ] PR 생성 및 코드 리뷰 요청

---

## 진행 체크리스트 (전체)

| Phase    | 범위                        | RED | GREEN | REFACTOR | 결과서 | 커밋 | 상태 |
| -------- | --------------------------- | --- | ----- | -------- | ------ | ---- | ---- |
| Phase 1  | TaskStore 저장소            | ⬜  | ⬜    | ⬜       | ⬜     | ⬜   | ⬜   |
| Phase 2  | Task\* 도구 4개             | ⬜  | ⬜    | ⬜       | ⬜     | ⬜   | ⬜   |
| Phase 3  | 도구 등록 + 프롬프트 + 빌드 | ⬜  | ⬜    | ⬜       | ⬜     | ⬜   | ⬜   |
| Phase 4A | AskUser E2E 경로 구축       | ⬜  | ⬜    | ⬜       | ⬜     | ⬜   | ⬜   |
| Phase 4B | AskUser markdown preview    | ⬜  | ⬜    | ⬜       | ⬜     | ⬜   | ⬜   |
| Phase 5  | Quality Gates + E2E         | —   | —     | —        | ⬜     | ⬜   | ⬜   |

---

**작성일**: 2026-03-01 **상태**: ⬜ 작성 중 (1차 리뷰 Issue 4,6,9 + 2차 리뷰
Issue 1,2,3 반영 완료)
