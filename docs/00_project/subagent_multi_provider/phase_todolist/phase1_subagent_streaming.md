# Phase 1: Category A — 서브에이전트 스트리밍 경로 + fixToolResultRoles 공유 유틸리티

> **목적**: non-Gemini 프로바이더에서 Codebase Investigator, CLI Help,
> Generalist 등 로컬 서브에이전트 실행 가능하도록 수정 **핵심 변경**:
> `fixToolResultRoles()` 공유 유틸리티 선행 구현 → `LlmAgentChatSession` 신규
> 생성 → `local-invocation.ts` factory 주입 **참고 설계**:
> [plan_20260218.md §5.A + §5.B.1](../plan_20260218.md)

---

## 1.1 사전 작업 (Pre-Work)

- [ ] **[CONTEXT]** 작업 목적 및 배경 확인
  - 설계 문서 검토: [plan_20260218.md §5.A](../plan_20260218.md)
  - 에러 재현 경로: `LocalSubagentInvocation.execute()` →
    `GeminiChat.generateContentStream()` → throw

- [ ] **[ANALYSIS-1]** `AgentChatSession` 인터페이스 확인
  - 파일: `packages/core/src/agents/types.ts`
  - 확인: `sendMessageStream()`, `setHistory()`, `getHistory()`,
    `getLastPromptTokenCount()` 시그니처

- [ ] **[ANALYSIS-2]** `local-executor.ts` StreamEvent 소비 패턴 확인
  - 파일: `packages/core/src/agents/local-executor.ts`
  - 확인: `callModel()` (line 654-744)에서 접근하는 StreamEvent 필드
  - 확인: `chunk.functionCalls`, `candidates[0].content.parts`,
    `StreamEventType` enum
  - 확인: line 1048 — tool 결과 메시지:
    `{ role: 'user', parts: toolResponseParts }` 에 **여러 functionResponse**
    포함 가능 [3차 리뷰 #1]

- [ ] **[ANALYSIS-3]** 재사용 유틸리티 시그니처 확인
  - `buildLlmRequestFromGeminiState()` —
    `providers/gemini/requestBuilder.ts:175`
  - `LlmResponseAccumulator` — `providers/gemini/historyBuilder.ts:36`
  - `StreamEventType` enum — `providers/gemini/chat.ts:55`
  - `fixToolResultRoles()` — `core/llmMessageUtils.ts` (Phase 1.2에서 선행 구현)

- [ ] **[ANALYSIS-4]** 기존 에이전트 테스트 베이스라인 기록

  ```bash
  npm test -w @didim365/agent-cli-core -- src/agents/
  ```

- [ ] **[ANALYSIS-5]** OpenAI converter multi-tool_result 처리 확인 [3차 리뷰
      #1]
  - 파일: `packages/core/src/providers/openai/converter.ts`
  - 확인: line 499-519 — `convertToolMessage()` 이 `find()` 사용 → **첫 번째
    tool_result만 처리**, 나머지 유실
  - 확인: Claude converter (`anthropic/converter.ts`) — `for...of` 루프로 모든
    tool_result 처리 (문제 없음)
  - **결론**: `fixToolResultRoles()`에서 multi-tool_result 메시지를 개별
    메시지로 분할해야 OpenAI 경로 호환

---

## 1.2 fixToolResultRoles 공유 유틸리티 선행 구현 (TDD)

> **배경**: `fixToolResultRoles()`는 Category A, B, C 모두에서 사용하는 공유
> 유틸리티. Phase 1(Category A)의 `LlmAgentChatSession`이 이 함수를 필요로
> 하므로 가장 먼저 구현. 설계 문서 참조:
> [plan_20260218.md §5.B.1](../plan_20260218.md)
>
> **[3차 리뷰 #1 반영]** role 변환 뿐 아니라, multi-tool_result 메시지를 개별
> 메시지로 **분할**하는 역할도 포함. OpenAI `convertToolMessage()`이 `find()`로
> 첫 tool_result만 처리하므로, 분할하지 않으면 tool 결과 유실.
>
> **⚠️ [3차 리뷰 #3 참고]** orphan tool message (대응 assistant tool_call 없는
> tool 메시지) 가능성은 현재 범위에서 처리하지 않음. LlmResponseAccumulator가
> assistant→user 페어링을 유지하므로 정상 플로우에서는 발생하지 않음. 향후
> 히스토리 truncation 도입 시 chain validation 검토 필요.

### 1.2.1 RED: fixToolResultRoles 테스트 작성 [리뷰 #7 + 2차 #4 + 3차 #1]

- [ ] **[RED-B0-1]** tool_result-only user → role: 'tool' 변환 테스트

  ```typescript
  // packages/core/src/core/llmMessageUtils.test.ts (신규)
  describe('fixToolResultRoles', () => {
    it('changes role to tool for user message with only valid tool_result content', () => {
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              toolCallId: 'call-1',
              name: 'fn',
              content: 'result',
            },
          ],
        },
      ];
      const result = fixToolResultRoles(messages);
      expect(result[0].role).toBe('tool');
    });

    it('keeps user role for text-only messages', () => {
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'hello' }],
        },
      ];
      const result = fixToolResultRoles(messages);
      expect(result[0].role).toBe('user');
    });

    it('keeps user role for mixed content (text + tool_result)', () => {
      // 혼합 content는 변경 없음
    });

    it('keeps user role for empty content', () => {
      // content.length === 0 guard
    });

    it('does not change assistant role', () => {
      // assistant role 무변경
    });
  });
  ```

- [ ] **[RED-B0-2]** 빈 toolCallId 가드 테스트 [2차 리뷰 #4]

  ```typescript
  // [2차 리뷰 반영 #4] 빈 toolCallId면 role 변경하지 않음
  it('keeps user role when tool_result has empty toolCallId', () => {
    const messages: LlmMessage[] = [
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            toolCallId: '',
            name: 'fn',
            content: 'result',
          },
        ],
      },
    ];
    const result = fixToolResultRoles(messages);
    expect(result[0].role).toBe('user'); // NOT 'tool'
  });

  it('keeps user role when some tool_results have empty toolCallId', () => {
    const messages: LlmMessage[] = [
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            toolCallId: 'call-1',
            name: 'fn1',
            content: 'r1',
          },
          { type: 'tool_result', toolCallId: '', name: 'fn2', content: 'r2' }, // 빈 id
        ],
      },
    ];
    const result = fixToolResultRoles(messages);
    expect(result[0].role).toBe('user'); // 하나라도 빈 id면 변경 안 함
  });
  ```

- [ ] **[RED-B0-3]** multi-tool_result 분할 테스트 [3차 리뷰 #1]

  ```typescript
  // [3차 리뷰 반영 #1] OpenAI convertToolMessage() find() 대응
  // 여러 tool_result가 한 메시지에 있으면 개별 메시지로 분할
  describe('multi-tool_result splitting', () => {
    it('splits multi-tool_result message into individual tool messages', () => {
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              toolCallId: 'call-1',
              name: 'fn1',
              content: 'r1',
            },
            {
              type: 'tool_result',
              toolCallId: 'call-2',
              name: 'fn2',
              content: 'r2',
            },
            {
              type: 'tool_result',
              toolCallId: 'call-3',
              name: 'fn3',
              content: 'r3',
            },
          ],
        },
      ];
      const result = fixToolResultRoles(messages);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        role: 'tool',
        content: [messages[0].content[0]],
      });
      expect(result[1]).toEqual({
        role: 'tool',
        content: [messages[0].content[1]],
      });
      expect(result[2]).toEqual({
        role: 'tool',
        content: [messages[0].content[2]],
      });
    });

    it('does not split single tool_result message', () => {
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              toolCallId: 'call-1',
              name: 'fn',
              content: 'r',
            },
          ],
        },
      ];
      const result = fixToolResultRoles(messages);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('tool');
    });

    it('does not split when any toolCallId is empty (keeps as user)', () => {
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              toolCallId: 'call-1',
              name: 'fn1',
              content: 'r1',
            },
            { type: 'tool_result', toolCallId: '', name: 'fn2', content: 'r2' },
          ],
        },
      ];
      const result = fixToolResultRoles(messages);
      expect(result).toHaveLength(1); // 분할하지 않음
      expect(result[0].role).toBe('user'); // role도 변경 안 함
    });

    it('preserves non-tool_result messages unchanged', () => {
      const messages: LlmMessage[] = [
        { role: 'user', content: [{ type: 'text', text: 'hello' }] },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              toolCallId: 'c1',
              name: 'fn1',
              content: 'r1',
            },
            {
              type: 'tool_result',
              toolCallId: 'c2',
              name: 'fn2',
              content: 'r2',
            },
          ],
        },
        { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
      ];
      const result = fixToolResultRoles(messages);
      expect(result).toHaveLength(4); // 1 (text) + 2 (split) + 1 (assistant)
      expect(result[0].role).toBe('user');
      expect(result[1].role).toBe('tool');
      expect(result[2].role).toBe('tool');
      expect(result[3].role).toBe('assistant');
    });
  });
  ```

- [ ] **[RED-B0-VERIFY]** 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/core/llmMessageUtils  # 반드시 FAIL
  ```

### 1.2.2 GREEN: llmMessageUtils.ts 구현

- [ ] **[TASK-B00]** `llmMessageUtils.ts` 생성
  - 파일: `packages/core/src/core/llmMessageUtils.ts` (신규, ~50줄)
  - 내용: `fixToolResultRoles()` 함수
    - **role 변환**: `role: 'user'` + content 전부 `tool_result` →
      `role: 'tool'` 변환
    - **빈 toolCallId 가드** [2차 #4]: `every(c.toolCallId.length > 0)` — 모든
      tool_result의 toolCallId가 비어있지 않은 경우에만 role 변경
    - **multi-tool_result 분할** [3차 #1]: content에 tool_result가 2개 이상이면
      각각 독립 메시지로 분할 (OpenAI `convertToolMessage()` `find()` 호환)
    - 분할과 role 변경은 동일 조건 (전부 tool_result + 전부 non-empty
      toolCallId)에서만 수행

- [ ] **[GREEN-B0-VERIFY]** llmMessageUtils 테스트 통과
  ```bash
  npm test -w @didim365/agent-cli-core -- src/core/llmMessageUtils  # PASS
  ```

---

## 1.3 RED Phase: 실패 테스트 작성

### 1.3.1 convertLlmEventToStreamEvent() 변환 테스트 (신규)

- [ ] **[RED-1]** TextDelta → CHUNK 변환 테스트

  ```typescript
  // packages/core/src/agents/llmAgentChatSession.test.ts (신규)
  describe('convertLlmEventToStreamEvent', () => {
    it('converts TextDelta to CHUNK with text part', () => {
      const event: LlmEvent = {
        type: LlmEventType.TextDelta,
        text: 'Hello world',
      };
      const result = convertLlmEventToStreamEvent(event);

      expect(result).not.toBeNull();
      expect(result!.type).toBe(StreamEventType.CHUNK);
      expect(result!.value.candidates[0].content.parts[0].text).toBe(
        'Hello world',
      );
    });
  });
  ```

- [ ] **[RED-2]** ThoughtDelta → CHUNK with `thought: true` 변환 테스트

  ```typescript
  it('converts ThoughtDelta to CHUNK with thought flag', () => {
    const event: LlmEvent = {
      type: LlmEventType.ThoughtDelta,
      thought: 'I should analyze...',
    };
    const result = convertLlmEventToStreamEvent(event);

    expect(result!.type).toBe(StreamEventType.CHUNK);
    const part = result!.value.candidates[0].content.parts[0];
    expect(part.text).toBe('I should analyze...');
    expect(part.thought).toBe(true);
  });
  ```

- [ ] **[RED-3]** ToolCallRequest → CHUNK with `functionCalls` 변환 테스트

  ```typescript
  it('converts ToolCallRequest to CHUNK with functionCalls', () => {
    const event: LlmEvent = {
      type: LlmEventType.ToolCallRequest,
      callId: 'call-1',
      name: 'list_directory',
      args: { dir_path: '/src' },
    };
    const result = convertLlmEventToStreamEvent(event);

    expect(result!.type).toBe(StreamEventType.CHUNK);
    expect(result!.value.functionCalls).toHaveLength(1);
    expect(result!.value.functionCalls![0].name).toBe('list_directory');
    expect(
      result!.value.candidates[0].content.parts[0].functionCall,
    ).toBeDefined();
  });
  ```

- [ ] **[RED-4]** Retry / AgentStopped / AgentBlocked 매핑 테스트

  ```typescript
  it('converts Retry to RETRY event', () => {
    const event: LlmEvent = { type: LlmEventType.Retry };
    const result = convertLlmEventToStreamEvent(event);
    expect(result!.type).toBe(StreamEventType.RETRY);
  });

  it('converts AgentStopped to AGENT_EXECUTION_STOPPED', () => {
    const event: LlmEvent = {
      type: LlmEventType.AgentStopped,
      reason: 'completed',
    };
    const result = convertLlmEventToStreamEvent(event);
    expect(result!.type).toBe(StreamEventType.AGENT_EXECUTION_STOPPED);
  });
  ```

- [ ] **[RED-5]** Error event → throw 전파 테스트 [리뷰 반영 #2]

  ```typescript
  it('throws on Error event instead of returning null', async () => {
    // Error event가 StreamEvent null이 아닌 throw로 처리되어
    // local-executor callModel() catch에서 잡히는지 검증
    const errorEvent: LlmEvent = {
      type: LlmEventType.Error,
      error: new Error('API failure'),
    };
    // sendMessageStream 내부에서 throw 발생 검증
  });
  ```

- [ ] **[RED-6]** Finished/MessageEnd → null (skip) + usage 추출 테스트 [리뷰
      반영 #6 + 2차 리뷰 #3]

  ```typescript
  it('returns null for Finished/MessageEnd events', () => {
    expect(
      convertLlmEventToStreamEvent({ type: LlmEventType.Finished }),
    ).toBeNull();
    expect(
      convertLlmEventToStreamEvent({ type: LlmEventType.MessageEnd }),
    ).toBeNull();
  });

  // [2차 리뷰 반영 #3] Claude는 Finished에 usage, OpenAI는 MessageEnd에 usage
  it('updates lastPromptTokenCount from Finished event usage (Claude)', async () => {
    // mock: generator yields [TextDelta, Finished(usage), MessageEnd(no usage)]
    // verify: session.getLastPromptTokenCount() === Finished.usage.promptTokens
  });

  it('updates lastPromptTokenCount from MessageEnd event usage (OpenAI)', async () => {
    // mock: generator yields [TextDelta, Finished(no usage), MessageEnd(usage)]
    // verify: session.getLastPromptTokenCount() === MessageEnd.usage.promptTokens
  });
  ```

### 1.3.2 LlmAgentChatSession 세션 관리 테스트

- [ ] **[RED-7]** history 관리 테스트 (user → streaming 전 추가, model →
      streaming 후)

  ```typescript
  describe('LlmAgentChatSession', () => {
    it('adds user content to history before streaming', async () => {
      // mock generator.llmGenerateContentStream() 설정
      const session = new LlmAgentChatSession(...);
      const gen = await session.sendMessageStream(modelConfigKey, message, promptId, signal);

      // 첫 번째 event 소비 전 history에 user 존재
      await gen.next();
      const history = session.getHistory();
      expect(history[history.length - 1].role).toBe('user');
    });

    it('adds model response to history after stream completes', async () => {
      // stream 전부 소비 후
      const history = session.getHistory();
      expect(history[history.length - 1].role).toBe('model');
    });
  });
  ```

- [ ] **[RED-8]** error 시 model response history 미추가 테스트

- [ ] **[RED-9]** AbortSignal 전파 테스트

- [ ] **[RED-10]** 모델 해석 테스트 — `resolvedConfig.model` 기반 [리뷰 #1 + 3차
      #2 + 4차 #1]

  ```typescript
  it('resolves model via resolveProviderModel(modelConfigKey.model), not config.getModel()', async () => {
    // [4차 리뷰 #1] config.getModel()은 전역 사용자 모델만 반환 → per-alias 오버라이드 무시.
    // local-executor가 이미 getResolvedConfig()로 alias chain을 해석하여
    // modelConfigKey.model에 해석 결과(예: 'gemini-2.5-flash')를 전달함.
    // LlmAgentChatSession은 이 해석된 모델을 resolveProviderModel()에 전달.
    //
    // mock: modelConfigKey = { model: 'gemini-2.5-flash' }  (local-executor가 해석한 결과)
    // mock: providerName = 'claude'
    // verify: llmGenerateContentStream에 전달된 request.model === getDefaultModelForProvider('claude')
    // verify: request.model !== 'gemini-2.5-flash'
  });

  it('passes through user override model from modelConfigKey', async () => {
    // [4차 리뷰 #1] 사용자가 per-alias 오버라이드로 non-Gemini 모델 설정한 경우
    // resolvedConfig.model이 이미 올바른 모델명 → resolveProviderModel이 그대로 통과
    //
    // mock: modelConfigKey = { model: 'claude-haiku-4-5-20251001' }  (사용자 오버라이드)
    // mock: providerName = 'claude'
    // verify: request.model === 'claude-haiku-4-5-20251001'
  });
  ```

- [ ] **[RED-11]** tool_result role 교정 + 분할 테스트 [2차 리뷰 #1 + 3차 #1]

  ```typescript
  it('applies fixToolResultRoles (with splitting) after buildLlmRequestFromGeminiState', async () => {
    // history에 여러 functionResponse를 가진 user 메시지 포함 시
    // llmGenerateContentStream에 전달되는 request.messages에
    // fixToolResultRoles()가 적용되어:
    //   1) multi-tool_result가 개별 메시지로 분할됨
    //   2) 각 메시지의 role이 'tool'로 변경됨
  });
  ```

### 1.3.3 local-invocation factory 주입 테스트

- [ ] **[RED-12]** local-invocation factory 주입 테스트 작성

  ```typescript
  // packages/core/src/agents/local-invocation.test.ts (기존 파일에 추가)
  describe('execute() - multi-provider support', () => {
    it('passes chatFactory when provider is non-Gemini', async () => {
      // mock: generator.providerName = 'claude'
      // mock: isProviderIndependentGenerator() = true
      // verify: LocalAgentExecutor.create() 4번째 인자 !== undefined
    });

    it('passes undefined chatFactory for Gemini provider', async () => {
      // mock: generator.providerName = 'gemini'
      // verify: LocalAgentExecutor.create() 4번째 인자 === undefined
    });

    it('passes undefined chatFactory for non-Gemini without llm* support', async () => {
      // mock: generator.providerName = 'claude'
      // mock: isProviderIndependentGenerator() = false
      // verify: 4번째 인자 === undefined (기존 에러 경로)
    });
  });
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/agents/llmAgentChatSession  # 반드시 FAIL
  npm test -w @didim365/agent-cli-core -- src/agents/local-invocation     # 신규 테스트 FAIL
  ```

---

## 1.4 GREEN Phase: 최소 코드 구현

### 1.4.1 LlmAgentChatSession 구현

- [ ] **[TASK-A01]** `llmAgentChatSession.ts` 생성
  - 파일: `packages/core/src/agents/llmAgentChatSession.ts` (신규, ~200줄)
  - 내용:
    - `LlmAgentChatSession` 클래스 (`AgentChatSession` 인터페이스 구현)
    - `convertLlmEventToStreamEvent()` 함수
    - `sendMessageStream()`:
      1. **`resolveProviderModel(modelConfigKey.model, providerName)`** [4차 #1]
         — local-executor가 `getResolvedConfig()`로 alias chain을 이미 해석하여
         `modelConfigKey.model`에 해석 결과(예: 'gemini-2.5-flash')를 전달.
         `config.getModel()`은 전역 모델만 반환하므로 사용 금지.
         `modelConfigService.getResolvedConfig(modelConfigKey).generateContentConfig`에서
         temperature/topP 추출
      2. `buildLlmRequestFromGeminiState()` → **`fixToolResultRoles()`** 적용
         (role 변환 + multi-tool_result 분할) [2차 #1 + 3차 #1]
      3. user content → history 추가
      4. `llmGenerateContentStream()` 호출
      5. event loop: accumulator + usage 추출 (**`MessageEnd` OR `Finished`**
         양쪽 체크) [2차 #3]
      6. Error event → **throw** (not null) [리뷰 #2]
      7. responseContent → history 추가
  - 재사용:
    - `buildLlmRequestFromGeminiState()` (requestBuilder.ts)
    - `LlmResponseAccumulator` (historyBuilder.ts)
    - `StreamEventType` (chat.ts)
    - `fixToolResultRoles()` (llmMessageUtils.ts — Phase 1.2에서 이미 구현 완료)

- [ ] **[GREEN-VERIFY-1]** llmAgentChatSession 테스트 통과
  ```bash
  npm test -w @didim365/agent-cli-core -- src/agents/llmAgentChatSession  # PASS
  ```

### 1.4.2 local-invocation.ts factory 주입

- [ ] **[TASK-A02]** `local-invocation.ts` 수정
  - 파일: `packages/core/src/agents/local-invocation.ts` (+20줄)
  - 변경 위치: `execute()` 메서드, `LocalAgentExecutor.create()` 호출 전
  - 추가 import: `isProviderIndependentGenerator`, `LlmAgentChatSession`
  - 로직: `isNonGemini && isProviderIndependentGenerator(generator)` →
    chatFactory 주입
  - `providerName`만 전달, 모델은 `sendMessageStream()`에서
    `resolveProviderModel(modelConfigKey.model, providerName)` per-turn 해석
    [리뷰 #1 + 4차 #1]

- [ ] **[GREEN-VERIFY-2]** local-invocation 테스트 통과
  ```bash
  npm test -w @didim365/agent-cli-core -- src/agents/local-invocation  # PASS
  ```

---

## 1.5 REFACTOR Phase

- [ ] **[REFACTOR-A1]** 코드 구조 개선
  - `llmMessageUtils.ts`: JSDoc 주석 정리, 분할 로직 가독성 검토
  - `llmAgentChatSession.ts`: JSDoc 주석 정리, export 순서 정리
  - `local-invocation.ts`: import 정리
  - ESLint `arrow-body-style`, `no-this-alias` 등 프로젝트 컨벤션 확인

- [ ] **[REFACTOR-A-VERIFY]** 리팩터링 후 테스트 재확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/core/llmMessageUtils  # PASS
  npm test -w @didim365/agent-cli-core -- src/agents/                # 전체 에이전트 PASS
  ```

---

## 1.6 사후 작업 (Post-Work)

- [ ] **[TEST-A]** Phase 1 관련 테스트 실행

  ```bash
  npm test -w @didim365/agent-cli-core -- src/core/llmMessageUtils
  npm test -w @didim365/agent-cli-core -- src/agents/
  ```

- [ ] **[LINT-A]** 린터 + 타입체크

  ```bash
  npm run typecheck -w @didim365/agent-cli-core
  npm run lint -w @didim365/agent-cli-core
  ```

- [ ] **[VERIFY-A]** 기능 검증
  - 확인 항목 1: `fixToolResultRoles()` — tool_result-only user → role: 'tool'
    변환 [리뷰 #7]
  - 확인 항목 2: `fixToolResultRoles()` — 빈 toolCallId면 role 변경 안 함 [2차
    #4]
  - 확인 항목 3: `fixToolResultRoles()` — multi-tool_result 메시지 → 개별 메시지
    분할 [3차 #1]
  - 확인 항목 4: TextDelta → StreamEvent.CHUNK 변환
    (`candidates[0].content.parts[0].text`)
  - 확인 항목 5: ToolCallRequest → CHUNK with `functionCalls[]` (local-executor
    호환)
  - 확인 항목 6: non-Gemini 프로바이더 → chatFactory 전달 확인
  - 확인 항목 7: Gemini 프로바이더 → 기존 경로 유지 (회귀 없음)
  - 확인 항목 8: Error event → throw 전파 (protocol_violation 오진단 방지) [리뷰
    #2]
  - 확인 항목 9: Finished/MessageEnd 양쪽 usage → lastPromptTokenCount 갱신 [2차
    #3]
  - 확인 항목 10: fixToolResultRoles() 적용 후 tool_result role 교정 (Category
    A) [2차 #1]
  - 확인 항목 11: 모델 해석 —
    `resolveProviderModel(modelConfigKey.model, providerName)` 기반,
    config.getModel() 미사용 [4차 #1]

- [ ] **[COMMIT-A]** 변경사항 커밋

  ```bash
  # 1차 커밋: 공유 유틸리티 (구조적 변경)
  git add packages/core/src/core/llmMessageUtils.ts packages/core/src/core/llmMessageUtils.test.ts
  git commit -m "feat(core): add fixToolResultRoles utility with multi-tool_result splitting"

  # 2차 커밋: 신규 세션 클래스 (구조적 변경)
  git add packages/core/src/agents/llmAgentChatSession.ts packages/core/src/agents/llmAgentChatSession.test.ts
  git commit -m "feat(agents): add LlmAgentChatSession for multi-provider sub-agent support"

  # 3차 커밋: 기존 파일 수정 (동작 변경)
  git add packages/core/src/agents/local-invocation.ts packages/core/src/agents/local-invocation.test.ts
  git commit -m "feat(agents): inject LlmAgentChatSession factory for non-Gemini providers"
  ```

- [ ] **[CHECKLIST-A]** 완료 조건 체크표시
  - 위 "Phase 1 완료 조건" 테이블의 모든 항목을 `⬜` → `✅`로 변경
  - 미완료 항목이 있으면 사유를 기록하고 Phase 2 사전 작업에서 확인

- [ ] **[DOC-A]** 작업 결과서 작성
  - 파일:
    `docs/00_project/subagent_multi_provider/working_history/subagent_phase1_subagent_streaming_{작업일자}.md`
  - 내용:
    - Phase 1 작업 요약 (변경 파일 목록, 핵심 구현 사항)
    - 테스트 실행 결과 (PASS/FAIL 현황)
    - 린트/타입체크 결과
    - 커밋 해시 목록 (3건)
    - 특이사항 및 Phase 2 전달사항 (주의점, 미해결 이슈 등)
    - 완료 조건 달성 여부 (테이블 복사 + 체크 상태)

---

## Phase 1 변경 파일

| 파일                                 | 액션     | 예상 규모 |
| ------------------------------------ | -------- | --------- |
| `core/llmMessageUtils.ts`            | **신규** | ~50줄     |
| `core/llmMessageUtils.test.ts`       | **신규** | ~120줄    |
| `agents/llmAgentChatSession.ts`      | **신규** | ~200줄    |
| `agents/llmAgentChatSession.test.ts` | **신규** | ~300줄    |
| `agents/local-invocation.ts`         | **수정** | +20줄     |
| `agents/local-invocation.test.ts`    | **수정** | +50줄     |

## Phase 1 완료 조건

| 검증 항목                                                                   | 상태 |
| --------------------------------------------------------------------------- | ---- |
| RED: fixToolResultRoles 유틸 + 빈 toolCallId 가드 테스트                    | ⬜   |
| RED: multi-tool_result 분할 테스트 [3차 #1]                                 | ⬜   |
| GREEN: llmMessageUtils.ts 구현 (role 변환 + 분할) + 테스트 통과             | ⬜   |
| RED: LlmAgentChatSession 변환 테스트 작성                                   | ⬜   |
| RED: Error→throw, Finished+MessageEnd usage 테스트 작성                     | ⬜   |
| RED: fixToolResultRoles 적용 + 분할 테스트 (Category A)                     | ⬜   |
| RED: local-invocation factory 주입 테스트 작성                              | ⬜   |
| GREEN: LlmAgentChatSession 구현 (resolvedConfig.model 기반) + 통과 [4차 #1] | ⬜   |
| GREEN: local-invocation 수정 + 테스트 통과                                  | ⬜   |
| REFACTOR: Phase 1 구조 개선                                                 | ⬜   |
| Phase 1 커밋 완료 (3건)                                                     | ⬜   |
| 완료 조건 체크표시 + 작업 결과서 작성                                       | ⬜   |
