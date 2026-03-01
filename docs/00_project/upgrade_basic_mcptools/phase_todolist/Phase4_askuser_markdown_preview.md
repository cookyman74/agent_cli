# Phase 4: Core+CLI — AskUser E2E 경로 구축 + markdown preview 강화

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 테스트
> 먼저 작성 → 최소 코드 구현 → 리팩터링 **리팩터링 원칙**: "Make it work → Make
> it right → Make it fast" **참고 문서**:
>
> - [99_TDD_plan.md](../../ai_adapter/template/99_TDD_plan.md) — TDD 방법론
> - [plan_20260224.md](../plan_20260224.md) — Step 5: AskUserQuestion 강화

---

## 작업 개요

| 항목        | 내용                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| 프로젝트    | Agent-CLI 기본 도구 업그레이드 — AskUser E2E 경로 구축 + markdown preview                             |
| 영향 범위   | `config.ts`, `DialogManager.tsx`, CLI MessageBus 구독, `types.ts`, `ask-user.ts`, `AskUserDialog.tsx` |
| 위험 수준   | 🟠 Medium-High — AskUser E2E 경로 신규 구축 + 스키마 확장 + CLI UI 수정                               |
| 성능 민감도 | 🟢 Low — React 컴포넌트 렌더링, 성능 영향 미미                                                        |
| 참고 설계   | [plan_20260224.md Step 5](../plan_20260224.md)                                                        |
| 작업 브랜치 | `DID/v0.2`                                                                                            |

> **⚠️ 범위 확장 근거 (Issue 1)**: 코드베이스 검증 결과 `ask_user` 도구는 다음과
> 같은 **E2E 단절 상태**이다:
>
> 1. `config.ts` `createToolRegistry()`에 `AskUserTool` 미등록 → LLM이 도구를
>    사용할 수 없음
> 2. CLI에 `ASK_USER_REQUEST` MessageBus 구독 없음 → Core의 요청을 수신할 수
>    없음
> 3. `DialogManager.tsx`에 `AskUserDialog` 미포함 → 다이얼로그를 렌더링할 수
>    없음
> 4. `AskUserDialog.tsx`는 1,106줄 완전 구현됨 → 코드 존재하나 연결 안됨
>
> 따라서 markdown preview(Part B) 이전에 **E2E 경로 구축(Part A)**이 선행되어야
> 한다.
>
> **Phase 4A는 Phase 1~3과 독립적으로 병렬 수행 가능** (단, CLI 대화 패턴 이해
> 필요).

---

## 핵심 리스크 요약

| 리스크                                                                      | 영향           | 대응 방안                                                                              | 상태 |
| --------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------- | ---- |
| `ask_user` E2E 경로 완전 단절 (Issue 1)                                     | 🟠 High        | Part A에서 config 등록 + CLI 구독 + DialogManager 연동                                 | ⬜   |
| `execute()` 호출 시 ASK_USER_RESPONSE 대기로 hang / cancel 미정의 (Issue 3) | 🟠 Medium-High | 테스트: subscribe auto-respond 패턴; 취소: `signal.abort()` → cancel resolve 계약 정의 | ⬜   |
| AskUserDialog props `onSubmit`/`onCancel` 혼동 (Issue 5)                    | 🟡 Medium      | 실제 코드: `onSubmit`/`onCancel` — 테스트 코드에서 정확히 사용                         | ⬜   |
| 기존 `ask_user` 호출 패턴 깨짐                                              | 🟡 Medium      | `markdown`은 optional → 기존 호출에 영향 없음                                          | ⬜   |
| `QuestionOption` 인터페이스 변경 시 타입 충돌                               | 🟡 Medium      | optional 필드 추가만 수행, breaking change 없음                                        | ⬜   |
| Ink Box 내 markdown 렌더링 품질                                             | 🟡 Medium      | monospace 강제, 길이 제한, Box 컴포넌트 사용                                           | ⬜   |
| `multiSelect` + `markdown` 조합 시 레이아웃 깨짐                            | 🟡 Medium      | Claude Code 동작: multiSelect 시 preview 미지원 → 동일 제한                            | ⬜   |

---

# Part A: AskUser E2E 경로 구축

## 4A.1 사전 작업 (Pre-Work)

- [ ] **[CONTEXT]** AskUser E2E 단절 현황 분석 (Issue 1)
  - `config.ts`: `AskUserTool`이 `createToolRegistry()`에 등록되지 않음 확인
  - CLI: `ASK_USER_REQUEST` MessageBus 이벤트 구독 부재 확인
  - `DialogManager.tsx`: ~20+ 다이얼로그 등록 중 `AskUserDialog` 미포함 확인
  - `AskUserDialog.tsx`: 1,106줄 완전 구현, Props: `onSubmit`/`onCancel` (NOT
    `onAnswer`)

- [ ] **[ANALYSIS-1]** CLI 대화 패턴 분석
  - 파일: `packages/cli/src/ui/components/DialogManager.tsx`
  - 확인: 기존 다이얼로그(ConfirmDialog, InputDialog 등) 등록 및 렌더링 패턴
  - 확인: MessageBus 이벤트 → 다이얼로그 표시 → 응답 전송 패턴

- [ ] **[ANALYSIS-2]** MessageBus 이벤트 흐름 분석
  - 파일: `packages/core/src/tools/ask-user.ts`
  - 확인: `execute()` → `publish(ASK_USER_REQUEST)` →
    `subscribe(ASK_USER_RESPONSE)` 패턴
  - 확인: `correlationId` 매칭 방식 (요청-응답 연결)
  - **핵심 (Issue 3)**: `execute()`는 ASK_USER_RESPONSE가 올 때까지 **블로킹** →
    테스트에서 직접 호출하면 hang
  - **취소 계약 (Issue 3 확장)**: `signal.abort()` → 내부 `abortHandler()` →
    `resolve({ llmContent: 'Tool execution cancelled by user.', error: { message: 'Cancelled' } })` +
    cleanup (unsubscribe + removeEventListener)
  - **⚠️ mock.publish() 반환값**: `ask-user.ts`는
    `this.messageBus.publish(request).catch(reject)` 호출 →
    MockMessageBus.publish가 Promise 반환하도록 설정 필요할 수 있음

- [ ] **[ANALYSIS-3]** AskUserDialog.tsx props 정확한 인터페이스 확인 (Issue 5)
  - 파일: `packages/cli/src/ui/components/AskUserDialog.tsx`
  - 확인: Props =
    `{ questions: Question[], onSubmit: (answers) => void, onCancel: () => void }`
  - **⚠️ 주의**: `onAnswer`가 아님. `onSubmit` / `onCancel` 사용 필수

---

## 4A.2 RED Phase: E2E 경로 구축 테스트

- [ ] **[RED-A1]** config.ts에 AskUserTool 등록 테스트

  ```typescript
  describe('createToolRegistry - ask_user', () => {
    it('should register ask_user tool', async () => {
      const registry = await config.createToolRegistry();
      expect(registry.getTool('ask_user')).toBeDefined();
    });
  });
  ```

- [ ] **[RED-A2]** AskUser E2E 라운드트립 테스트 (2차 리뷰 Issue 1, 3: 정확한
      mock API + hang 방지)

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

  describe('AskUser E2E round-trip', () => {
    it('should publish ASK_USER_REQUEST and resolve on ASK_USER_RESPONSE', async () => {
      const mockBus = createMockMessageBus();
      const mockInstance = getMockMessageBusInstance(mockBus);
      const tool = new AskUserTool(mockBus);
      const signal = new AbortController().signal;

      // 2차 Issue 1: subscribe auto-respond 패턴 — execute() 전에 등록
      // MockMessageBus.publish() → emit() → subscriber 동기 호출 체인
      mockBus.subscribe(
        MessageBusType.ASK_USER_REQUEST,
        (msg: AskUserRequest) => {
          mockInstance.publish({
            type: MessageBusType.ASK_USER_RESPONSE,
            correlationId: msg.correlationId,
            answers: { '0': 'A' }, // 2차 Issue 1: index 기반 키 (NOT 질문 텍스트)
          } as AskUserResponse);
        },
      );

      const invocation = tool.build({
        questions: [
          {
            question: 'Pick one',
            header: 'Test',
            options: [
              { label: 'A', description: 'First' },
              { label: 'B', description: 'Second' },
            ],
            multiSelect: false,
          },
        ],
      });

      // 2차 Issue 1: execute(signal) — AbortSignal 필수 파라미터
      const result = await invocation.execute(signal);

      // 검증: ASK_USER_REQUEST가 발행되었는지 확인
      // ⚠️ .getLastPublished() 메서드 없음 → publishedMessages 배열 직접 조회
      const publishedRequest = mockInstance.publishedMessages.find(
        (m) => m.type === MessageBusType.ASK_USER_REQUEST,
      );
      expect(publishedRequest).toBeDefined();

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('A');
    });
  });
  ```

  > **테스트 패턴 설명 (2차 리뷰 Issue 1, 3)**:
  >
  > - `buildAndExecute()` 직접 호출 시 `execute()` 내부에서 `ASK_USER_RESPONSE`
  >   무한 대기 → hang 발생
  > - **해결**: `mockBus.subscribe(ASK_USER_REQUEST, handler)` 등록 후
  >   `invocation.execute(signal)` 호출
  > - MockMessageBus의 `publish()` → `emit()` → subscriber 동기 호출 체인으로
  >   즉시 응답 전달
  > - `answers` 키는 질문 텍스트가 아닌 **인덱스 문자열** (`'0'`, `'1'` 등) 사용
  > - `getMockMessageBusInstance(mockBus).publishedMessages` 배열로 발행 메시지
  >   확인 (`.getLastPublished()` 메서드 없음)
  > - `execute(signal)`: AbortSignal은 필수 파라미터

- [ ] **[RED-A3]** DialogManager에 AskUserDialog 포함 테스트

  ```typescript
  describe('DialogManager - AskUserDialog', () => {
    it('should render AskUserDialog when ASK_USER_REQUEST received', () => {
      // DialogManager가 ASK_USER_REQUEST 이벤트 수신 시
      // AskUserDialog 컴포넌트를 렌더링하는지 확인
    });

    it('should call onSubmit with answers and publish ASK_USER_RESPONSE', () => {
      // Issue 5: onSubmit (NOT onAnswer) 사용
      // AskUserDialog의 onSubmit 호출 시
      // MessageBus에 ASK_USER_RESPONSE 발행 확인
    });
  });
  ```

- [ ] **[RED-A4]** Cancel 계약 테스트 (2차 리뷰 Issue 3: hang 방지 — AbortSignal
      경유)

  ```typescript
  describe('AskUser cancel contract', () => {
    it('should resolve with cancel result when signal is aborted', async () => {
      const mockBus = createMockMessageBus();
      const tool = new AskUserTool(mockBus);
      const controller = new AbortController();

      // ASK_USER_REQUEST에 대한 auto-respond 없이 실행 (응답 대기 상태 진입)
      const invocation = tool.build({
        questions: [
          {
            question: 'Will be cancelled',
            header: 'Cancel',
            options: [
              { label: 'A', description: 'First' },
              { label: 'B', description: 'Second' },
            ],
            multiSelect: false,
          },
        ],
      });

      const executePromise = invocation.execute(controller.signal);

      // 취소 시그널 발행 → abortHandler 트리거
      controller.abort();

      const result = await executePromise;
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Cancelled');
      expect(result.llmContent).toBe('Tool execution cancelled by user.');
    });

    it('should cleanup subscriptions on cancel', async () => {
      const mockBus = createMockMessageBus();
      const mockInstance = getMockMessageBusInstance(mockBus);
      const tool = new AskUserTool(mockBus);
      const controller = new AbortController();

      const invocation = tool.build({
        questions: [
          {
            question: 'Cleanup test',
            header: 'Test',
            options: [{ label: 'A', description: 'First' }],
            multiSelect: false,
          },
        ],
      });

      const executePromise = invocation.execute(controller.signal);
      controller.abort();
      await executePromise;

      // 취소 후 ASK_USER_RESPONSE 발행해도 무시되어야 함 (cleanup 확인)
      // (unsubscribe + removeEventListener 호출 검증)
    });
  });
  ```

  > **Cancel 계약 (2차 리뷰 Issue 3)**:
  >
  > - `signal.abort()` → 내부 `abortHandler()` 호출
  > - `resolve({ llmContent: 'Tool execution cancelled by user.', error: { message: 'Cancelled' } })`
  > - cleanup: `unsubscribe()` +
  >   `signal.removeEventListener('abort', abortHandler)`
  > - CLI `onCancel` 콜백 → `AbortController.abort()` 경유하여 이 계약을 트리거
  > - AskUserDialog의 `onCancel` prop은 DialogManager에서
  >   AbortController.abort() 호출로 구현

- [ ] **[RED-VERIFY-A]** 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/ask-user  # 신규 테스트 FAIL
  npm test -w @didim365/agent-cli -- src/ui/components/DialogManager  # 신규 테스트 FAIL
  ```

---

## 4A.3 GREEN Phase: E2E 경로 구현

- [ ] **[TASK-A1]** `config.ts`에 AskUserTool 등록
  - 파일: `packages/core/src/config/config.ts`
  - 변경: `createToolRegistry()` 내에 `registerCoreTool(AskUserTool)` 추가
  - 위치: 기존 도구 등록 블록 내 적절한 위치

- [ ] **[TASK-A2]** CLI MessageBus 구독 추가
  - 파일: CLI 측 MessageBus 구독 훅/유틸리티
  - 변경: `ASK_USER_REQUEST` 이벤트 구독 → AskUserDialog 표시 트리거
  - 패턴: 기존 ConfirmDialog 등의 MessageBus 연동 패턴 참조

- [ ] **[TASK-A3]** DialogManager에 AskUserDialog 연동
  - 파일: `packages/cli/src/ui/components/DialogManager.tsx`
  - 변경: AskUserDialog 컴포넌트 import + 렌더링 조건 추가
  - Props 매핑:
    - `questions` ← ASK_USER_REQUEST 이벤트의 questions 데이터
    - `onSubmit` ← 사용자 응답 후 ASK_USER_RESPONSE MessageBus 발행 (Issue 5:
      `onSubmit` 사용)
    - `onCancel` ← 취소 시 `AbortController.abort()` 호출 → ask-user.ts의
      abortHandler 트리거 (2차 리뷰 Issue 3, 1차 Issue 5)

- [ ] **[GREEN-VERIFY-A]** E2E 경로 테스트 통과
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/ask-user  # PASS
  npm test -w @didim365/agent-cli -- src/ui/components/DialogManager  # PASS
  ```

---

# Part B: AskUser markdown preview 강화

## 4B.1 사전 작업 (Pre-Work)

- [ ] **[REVIEW-A]** Part A 완료 확인
  - E2E 경로 구축 완료, 테스트 통과 확인
  - ask_user 도구가 config.ts에 등록되어 LLM 호출 가능 상태

- [ ] **[ANALYSIS-B1]** 현재 `QuestionOption` 타입 분석
  - 파일: `packages/core/src/confirmation-bus/types.ts`
  - 확인: 현재 `QuestionOption` 필드 (`label`, `description`)
  - 확인: `Question` 인터페이스 내 `options` 필드 타입

- [ ] **[ANALYSIS-B2]** 현재 `ask-user.ts` 스키마 분석
  - 파일: `packages/core/src/tools/ask-user.ts`
  - 확인: JSON Schema 내 `options.items.properties` 구조
  - 확인: `AskUserInvocation.execute()` 에서 options 전달 경로

- [ ] **[ANALYSIS-B3]** 현재 `AskUserDialog.tsx` 구조 분석
  - 파일: `packages/cli/src/ui/components/AskUserDialog.tsx`
  - 확인: `ChoiceQuestionView` 컴포넌트 — 옵션 렌더링 방식
  - 확인: 레이아웃 구조 (Ink Box, Text 등)
  - 확인: `selectedIndex` 상태 관리 → 포커스된 옵션 감지 가능 여부

---

## 4B.2 RED Phase: Core 타입 + 스키마 + markdown preview 테스트

- [ ] **[RED-B1]** `QuestionOption.markdown` 필드 존재 테스트

  ````typescript
  // types.test.ts 또는 별도 검증
  describe('QuestionOption', () => {
    it('should accept markdown field', () => {
      const option: QuestionOption = {
        label: 'Option A',
        description: 'Description A',
        markdown: '```typescript\nconst x = 1;\n```',
      };
      expect(option.markdown).toBeDefined();
    });

    it('should be optional (backward compatible)', () => {
      const option: QuestionOption = {
        label: 'Option B',
        description: 'Description B',
      };
      // markdown 없이도 유효
      expect(option.markdown).toBeUndefined();
    });
  });
  ````

- [ ] **[RED-B2]** `ask_user` 스키마에 `markdown` 속성 포함 테스트

  ```typescript
  // ask-user.test.ts (기존 파일에 추가)
  // Issue 3: buildAndExecute 대신 build() + mock 응답 패턴 사용
  describe('AskUserTool schema - markdown', () => {
    it('should accept markdown in option definition', async () => {
      const mockMessageBus = createMockMessageBus();
      const tool = new AskUserTool(mockMessageBus);

      const invocation = tool.build({
        questions: [
          {
            question: 'Which layout?',
            header: 'Layout',
            options: [
              {
                label: 'Option A',
                description: 'Horizontal layout',
                markdown: '┌─────────┐\n│ A │ B │\n└─────────┘',
              },
              {
                label: 'Option B',
                description: 'Vertical layout',
                markdown: '┌───┐\n│ A │\n├───┤\n│ B │\n└───┘',
              },
            ],
            multiSelect: false,
          },
        ],
      });

      // 스키마 검증 통과 확인 (invocation 생성 성공)
      expect(invocation).toBeDefined();
    });

    it('should still work without markdown (backward compatible)', async () => {
      const mockMessageBus = createMockMessageBus();
      const tool = new AskUserTool(mockMessageBus);

      // 기존 방식 — markdown 없이 호출
      const invocation = tool.build({
        questions: [
          {
            question: 'Choose one',
            header: 'Choice',
            options: [
              { label: 'A', description: 'First' },
              { label: 'B', description: 'Second' },
            ],
            multiSelect: false,
          },
        ],
      });

      expect(invocation).toBeDefined();
    });
  });
  ```

- [ ] **[RED-B3]** markdown preview 기본 렌더링 테스트

  ```typescript
  // AskUserDialog.test.tsx (기존 파일에 추가)
  // Issue 5: onSubmit/onCancel 사용 (NOT onAnswer)
  describe('AskUserDialog - markdown preview', () => {
    it('should render markdown preview panel when option has markdown field', () => {
      const questions = [
        {
          question: 'Which layout?',
          header: 'Layout',
          type: QuestionType.CHOICE,
          options: [
            {
              label: 'Horizontal',
              description: 'Side by side',
              markdown: '┌─────────┐\n│ A │ B │\n└─────────┘',
            },
            {
              label: 'Vertical',
              description: 'Stacked',
              markdown: '┌───┐\n│ A │\n├───┤\n│ B │\n└───┘',
            },
          ],
        },
      ];

      const { lastFrame } = render(
        <AskUserDialog
          questions={questions}
          onSubmit={onSubmit}   /* Issue 5: onSubmit (NOT onAnswer) */
          onCancel={onCancel}   /* Issue 5: onCancel 추가 */
        />,
      );

      // preview 패널이 표시되어야 함
      expect(lastFrame()).toContain('┌─────────┐');
    });

    it('should update preview when focused option changes', () => {
      const questions = [
        {
          question: 'Which layout?',
          header: 'Layout',
          type: QuestionType.CHOICE,
          options: [
            {
              label: 'Option A',
              description: 'First',
              markdown: 'Preview A content',
            },
            {
              label: 'Option B',
              description: 'Second',
              markdown: 'Preview B content',
            },
          ],
        },
      ];

      const { lastFrame, stdin } = render(
        <AskUserDialog
          questions={questions}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />,
      );

      // 초기: Option A 포커스 → Preview A 표시
      expect(lastFrame()).toContain('Preview A content');

      // 아래 화살표 → Option B 포커스 → Preview B 표시
      stdin.write('\x1B[B'); // Arrow Down
      expect(lastFrame()).toContain('Preview B content');
    });
  });
  ```

- [ ] **[RED-B4]** markdown 없는 옵션과 혼합 시 동작 테스트

  ```typescript
  // Issue 5: onSubmit/onCancel 사용
  describe('AskUserDialog - markdown mixed', () => {
    it('should not show preview panel when no options have markdown', () => {
      const questions = [
        {
          question: 'Choose one',
          header: 'Choice',
          type: QuestionType.CHOICE,
          options: [
            { label: 'Option A', description: 'No markdown' },
            { label: 'Option B', description: 'No markdown either' },
          ],
        },
      ];

      const { lastFrame } = render(
        <AskUserDialog
          questions={questions}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />,
      );

      // 기존 레이아웃 (preview 패널 없음)
      // → side-by-side 레이아웃이 아닌 기존 단일 열 레이아웃
    });

    it('should not show preview for multiSelect questions', () => {
      const questions = [
        {
          question: 'Select multiple',
          header: 'Multi',
          type: QuestionType.CHOICE,
          multiSelect: true,
          options: [
            {
              label: 'Option A',
              description: 'First',
              markdown: 'Should not appear',
            },
          ],
        },
      ];

      const { lastFrame } = render(
        <AskUserDialog
          questions={questions}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />,
      );

      // multiSelect 시 markdown preview 미표시
      expect(lastFrame()).not.toContain('Should not appear');
    });
  });
  ```

- [ ] **[RED-VERIFY-B]** 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/ask-user.test  # 신규 테스트 FAIL (markdown 미인식)
  npm test -w @didim365/agent-cli -- src/ui/components/AskUserDialog.test  # 신규 테스트 FAIL
  ```

---

## 4B.3 GREEN Phase: types.ts + ask-user.ts + AskUserDialog.tsx 수정

- [ ] **[TASK-B1]** `types.ts`에 `QuestionOption.markdown` 추가
  - 파일: `packages/core/src/confirmation-bus/types.ts`
  - 변경:
    ```typescript
    export interface QuestionOption {
      label: string;
      description: string;
      markdown?: string; // ← 추가: 미리보기 콘텐츠 (ASCII 목업, 코드 스니펫 등)
    }
    ```

- [ ] **[TASK-B2]** `ask-user.ts` JSON Schema에 `markdown` 속성 추가
  - 파일: `packages/core/src/tools/ask-user.ts`
  - 위치: `options.items.properties` 섹션
  - 변경:
    ```typescript
    // options 항목의 properties에 추가
    markdown: {
      type: 'string',
      description: 'Optional preview content shown in a monospace box when this option is focused. ' +
        'Use for ASCII mockups, code snippets, or diagrams that help users visually compare options. ' +
        'Supports multi-line text with newlines.',
    },
    ```

- [ ] **[TASK-B3]** `AskUserDialog.tsx` — markdown preview 활성화 조건 추가
  - 파일: `packages/cli/src/ui/components/AskUserDialog.tsx`
  - 변경: `ChoiceQuestionView` 내에서:
    - `hasMarkdownPreview` 판별: options 중 하나라도 `markdown` 필드 존재 +
      `!multiSelect`
    - `hasMarkdownPreview === true` 이면 side-by-side 레이아웃 활성화

- [ ] **[TASK-B4]** `AskUserDialog.tsx` — MarkdownPreviewPanel 컴포넌트 구현
  - 위치: `AskUserDialog.tsx` 내부 또는 별도 파일
  - 내용:
    - `Ink Box` + `borderStyle: 'round'` 래퍼
    - 포커스된 옵션의 `markdown` 문자열을 monospace `Text`로 렌더링
    - 포커스 변경 시 preview 내용 갱신
  - 레이아웃:
    ```
    ┌─ Options ─────────┐ ┌─ Preview ─────────┐
    │ > Option A        │ │ ┌─────────┐       │
    │   Option B        │ │ │ A │ B │       │
    │                   │ │ └─────────┘       │
    └───────────────────┘ └───────────────────┘
    ```

- [ ] **[TASK-B5]** `AskUserDialog.tsx` — multiSelect 제한 적용
  - 변경: `multiSelect === true` 이면 markdown preview 비활성화
  - 이유: Claude Code 동작과 동일 — multiSelect에서는 preview 미지원

- [ ] **[GREEN-VERIFY-B]** 테스트 통과
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/ask-user.test  # PASS
  npm test -w @didim365/agent-cli -- src/ui/components/AskUserDialog.test  # PASS
  ```

---

## 4.6 REFACTOR Phase: 컴포넌트 구조 개선

- [ ] **[REFACTOR-STRUCTURE]** 코드 구조 개선
  - `MarkdownPreviewPanel` 컴포넌트가 너무 크면 별도 파일로 분리 검토
  - side-by-side 레이아웃 로직을 `ChoiceQuestionView` 내부 private 함수로 추출
  - markdown 콘텐츠 길이 제한 (터미널 너비 초과 시 truncate)
  - DialogManager 내 AskUserDialog 연동 코드 정리

- [ ] **[REFACTOR-VERIFY]** 리팩터링 후 테스트 재확인
  ```bash
  npm test -w @didim365/agent-cli -- src/ui/components/AskUserDialog.test  # 여전히 PASS
  npm test -w @didim365/agent-cli -- src/ui/components/DialogManager.test  # 여전히 PASS
  ```

---

## 4.7 사후 작업 (Post-Work)

- [ ] **[TEST]** 전체 테스트 실행

  ```bash
  npm test -w @didim365/agent-cli-core  # Core (ask-user 변경)
  npm test -w @didim365/agent-cli        # CLI (AskUserDialog + DialogManager 변경)
  ```

- [ ] **[BUILD]** 빌드 확인

  ```bash
  npm run build -w @didim365/agent-cli-core
  npm run build -w @didim365/agent-cli
  ```

- [ ] **[LINT]** 린터 + 타입체크

  ```bash
  npm run lint -w @didim365/agent-cli-core
  npm run lint -w @didim365/agent-cli
  npm run typecheck -w @didim365/agent-cli-core
  npm run typecheck -w @didim365/agent-cli
  ```

- [ ] **[VERIFY]** 기능 검증
  - 확인 항목 1: `ask_user` 도구가 `config.ts`에 등록 확인 (Part A)
  - 확인 항목 2: CLI에서 `ASK_USER_REQUEST` MessageBus 수신 → AskUserDialog 표시
    (Part A)
  - 확인 항목 3: AskUserDialog `onSubmit` → `ASK_USER_RESPONSE` MessageBus 발행
    (Part A, Issue 5)
  - 확인 항목 4: `QuestionOption.markdown` optional 필드 → 기존 호출 깨지지 않음
    (Part B)
  - 확인 항목 5: markdown 있는 옵션 → side-by-side preview 패널 표시 (Part B)
  - 확인 항목 6: 포커스 변경 → preview 내용 갱신 (Part B)
  - 확인 항목 7: markdown 없는 옵션 → 기존 레이아웃 유지 (Part B)
  - 확인 항목 8: multiSelect → preview 미표시 (Part B)

- [ ] **[DOC]** 작업 결과서 작성
  - 파일: `../working_history/Phase4_askuser_markdown_preview_{작업일자}.md`

- [ ] **[COMMIT]** 변경사항 커밋 (Tidy First: E2E 경로 → 스키마 → UI)

  ```bash
  # 1차 커밋: Part A — E2E 경로 구축 (구조적 변경)
  git add packages/core/src/config/config.ts packages/cli/src/ui/components/DialogManager.tsx
  # (CLI MessageBus 구독 관련 파일도 추가)
  git commit -m "feat(core,cli): wire ask_user E2E path — config registration + CLI MessageBus + DialogManager"

  # 2차 커밋: Part B — Core 타입 + 스키마 변경 (구조적 변경)
  git add packages/core/src/confirmation-bus/types.ts packages/core/src/tools/ask-user.ts
  git commit -m "feat(core): add markdown field to QuestionOption + ask_user schema"

  # 3차 커밋: Part B — CLI AskUserDialog 수정 (동작 변경)
  git add packages/cli/src/ui/components/AskUserDialog.tsx packages/cli/src/ui/components/AskUserDialog.test.tsx
  git commit -m "feat(cli): add markdown preview panel to AskUserDialog"
  ```

---

## Phase 완료 조건

| 검증 항목                                                  | 상태 |
| ---------------------------------------------------------- | ---- |
| **Part A: E2E 경로 구축**                                  |      |
| RED(A): config 등록 + CLI 구독 + DialogManager 테스트 작성 | ⬜   |
| GREEN(A): config.ts + CLI + DialogManager 수정 + 통과      | ⬜   |
| ask_user E2E 라운드트립 확인 (Issue 1)                     | ⬜   |
| ask_user cancel 계약 검증 (2차 리뷰 Issue 3)               | ⬜   |
| **Part B: markdown preview**                               |      |
| RED(B): 타입 + 스키마 + preview 테스트 작성                | ⬜   |
| GREEN(B): types.ts + ask-user.ts + AskUserDialog 수정      | ⬜   |
| REFACTOR: 컴포넌트 구조 개선                               | ⬜   |
| **공통**                                                   |      |
| Core 빌드 성공                                             | ⬜   |
| CLI 빌드 성공                                              | ⬜   |
| Lint + Typecheck 통과 (Core + CLI)                         | ⬜   |
| 기존 ask_user 호출 하위 호환 확인                          | ⬜   |
| onSubmit/onCancel props 정확성 확인 (Issue 5)              | ⬜   |
| 작업 결과서 작성                                           | ⬜   |
| 커밋 완료 (3개)                                            | ⬜   |

---

**작성일**: 2026-03-01 **상태**: ⬜ 작성 중 (1차 리뷰 Issue 1,3,5 + 2차 리뷰
Issue 1,3 반영 완료)
