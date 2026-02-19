# Phase 2: Category B — BaseLlmClient 유틸리티 호출 경로

> **목적**: `BaseLlmClient._generateWithRetry()` 레거시 호출을
> `llmGenerateContent()` 경로로 분기 **파급력**: 이 수정 하나로 11개
> 호출자(loopDetectionService, chatCompressionService, sessionSummaryService,
> nextSpeakerChecker, editCorrector, llm-edit-fixer 등) 자동 수정 **호출자 코드
> 변경: 0건** **참고**: `fixToolResultRoles()` 유틸리티는 Phase 1.2에서 이미
> 구현 완료 (role 변환 + multi-tool_result 분할 포함 [3차 #1]) **참고 설계**:
> [plan_20260218.md §5.B](../plan_20260218.md)
>
> **⚠️ [3차 #2→4차 #1]** `modelConfigKey.model` (예: `'summarizer-default'`,
> `'loop-detection'`)은 config alias 키이며 실제 모델명이 아님.
> `resolveProviderModel()`의 입력으로 직접 사용하면 안 됨.
> ~~`this.config.getModel()`~~ (전역 모델만 반환, per-alias 오버라이드 무시)도
> 부적합. **올바른 접근법**: `getResolvedConfig(modelConfigKey).model` → alias
> chain 해석 결과(예: `'gemini-2.5-flash'`) → `resolveProviderModel()` →
> 프로바이더 기본 모델. 사용자 per-alias 오버라이드 시 resolvedConfig.model이
> 이미 올바른 모델명(예: `'claude-haiku'`)이므로 그대로 통과.

---

## 2.1 사전 작업 (Pre-Work)

- [ ] **[PREV-REVIEW]** Phase 1 작업 결과서 확인
  - 파일:
    `docs/00_project/subagent_multi_provider/working_history/subagent_phase1_subagent_streaming_{작업일자}.md`
  - 확인: Phase 1 완료 조건 전체 달성 여부
  - 확인: Phase 2 전달사항 (주의점, 미해결 이슈)
  - 확인: `fixToolResultRoles()` 유틸리티 구현 완료 상태 (Phase 2에서 재사용)
  - **미완료 항목 있으면 Phase 2 착수 전 해소 필요**

- [ ] **[CONTEXT]** 작업 목적 및 배경 확인
  - 설계 문서 검토: [plan_20260218.md §5.B](../plan_20260218.md)
  - 에러 재현 경로: `loopDetectionService.queryLoopDetectionModel()` →
    `BaseLlmClient.generateJson()` → `_generateWithRetry()` →
    `contentGenerator.generateContent()` → throw

- [ ] **[ANALYSIS-1]** `BaseLlmClient._generateWithRetry()` 현재 로직 분석
  - 파일: `packages/core/src/core/baseLlmClient.ts`
  - 확인: line 411-509 전체 흐름, `applyModelSelection()`, `retryWithBackoff()`,
    `handleFallback()`
  - 확인: line 467 —
    `this.contentGenerator.generateContent(requestParams, promptId)` (레거시
    호출 지점)

- [ ] **[ANALYSIS-2]** `convertContentsToLlmMessages()` 변환 정합성 확인
  - 파일: `packages/core/src/providers/gemini/typeConversion.ts`
  - 확인: role 매핑 (`model` → `assistant`, `user` → `user`), Part 변환 (text,
    functionCall, functionResponse, inlineData)
  - 확인: `toolCallId: part.functionResponse.id ?? ''` (line 53) — 빈 문자열
    가능성

- [ ] **[ANALYSIS-3]** `LlmGenerateResponse` 타입 구조 확인 [리뷰 #4]
  - 파일: `packages/core/src/providers/types.ts`
  - 확인: `{ id, content: LlmContent[], model, stopReason, usage? }` 구조
  - `getResponseText()` 호환을 위해 `candidates[0].content.parts[0].text` 구조
    필요

- [ ] **[ANALYSIS-4]** config alias vs 실제 모델명 구분 확인 [3차 #2 + 4차 #1]
  - `modelConfigKey.model` 값: `'summarizer-default'`, `'loop-detection'`,
    `'web-fetch'` 등 — **config alias 키**
  - `isGeminiSpecificModel('loop-detection')` = `false` →
    `resolveProviderModel()`이 그대로 통과시킴 → API 에러
  - ~~`this.config.getModel()`~~ = 전역 사용자 모델만 반환 → per-alias
    오버라이드 무시 [4차 #1]
  - `getResolvedConfig({ model: 'loop-detection' })` → alias chain 해석 →
    `resolvedConfig.model = 'gemini-2.5-flash'` — **해석된 실제 모델명**
  - `resolveProviderModel('gemini-2.5-flash', 'claude')` →
    `isGeminiSpecificModel` = true → provider default ✅
  - 사용자 오버라이드 시: `resolvedConfig.model = 'claude-haiku'` → pass through
    ✅
  - **결론**:
    `resolveProviderModel(getResolvedConfig(modelConfigKey).model, providerName)`
    사용

- [ ] **[ANALYSIS-5]** 기존 baseLlmClient 테스트 베이스라인 기록
  ```bash
  npm test -w @didim365/agent-cli-core -- src/core/baseLlmClient
  ```

---

## 2.2 RED Phase: 실패 테스트 작성

- [ ] **[RED-B1]** non-Gemini `generateJson()` llm\* 경로 테스트

  ```typescript
  // packages/core/src/core/baseLlmClient.test.ts (기존 파일에 추가)
  describe('BaseLlmClient - non-Gemini provider', () => {
    it('calls llmGenerateContent for non-Gemini generateJson', async () => {
      // mock: contentGenerator.providerName = 'claude'
      // mock: isProviderIndependentGenerator() = true
      // mock: llmGenerateContent() → LlmGenerateResponse with JSON text
      const client = new BaseLlmClient(mockGenerator, mockConfig);
      const result = await client.generateJson({
        modelConfigKey: { model: 'summarizer-default' },
        contents: [{ role: 'user', parts: [{ text: 'analyze' }] }],
        schema: { type: 'object' },
        abortSignal: new AbortController().signal,
        promptId: 'test',
      });

      expect(mockGenerator.llmGenerateContent).toHaveBeenCalled();
      expect(mockGenerator.generateContent).not.toHaveBeenCalled();
      expect(result).toEqual(expect.any(Object));
    });
  });
  ```

- [ ] **[RED-B2]** non-Gemini `generateContent()` llm\* 경로 테스트

  ```typescript
  it('calls llmGenerateContent for non-Gemini generateContent', async () => {
    const result = await client.generateContent({
      modelConfigKey: { model: 'web-fetch' },
      contents: [{ role: 'user', parts: [{ text: 'summarize' }] }],
      abortSignal: new AbortController().signal,
      promptId: 'test',
    });

    expect(mockGenerator.llmGenerateContent).toHaveBeenCalled();
    expect(getResponseText(result)).toBe('expected text');
  });
  ```

- [ ] **[RED-B3]** Gemini `generateJson()` 기존 경로 유지 (회귀) 테스트

  ```typescript
  it('calls legacy generateContent for Gemini provider', async () => {
    // mock: contentGenerator.providerName = 'gemini' (또는 undefined)
    const result = await client.generateJson({ ... });

    expect(mockGenerator.generateContent).toHaveBeenCalled();
    expect(mockGenerator.llmGenerateContent).not.toHaveBeenCalled();
  });
  ```

- [ ] **[RED-B4]** `_convertLlmResponseToGeminiResponse()` 변환 테스트

  ```typescript
  it('converts LlmGenerateResponse to GenerateContentResponse compatible with getResponseText', () => {
    // LlmGenerateResponse: { content: [{ type: 'text', text: 'hello' }] }
    // → GenerateContentResponse: { candidates: [{ content: { role: 'model', parts: [{ text: 'hello' }] } }] }
    // → getResponseText() === 'hello'
  });
  ```

- [ ] **[RED-B5]** systemInstruction 정규화 테스트 (string, Part, Content 형식)

- [ ] **[RED-B6]** retry 동작 테스트 (non-Gemini 경로에서도 retry 정상 동작)

- [ ] **[RED-B7]** responseFormat: 'json' 전달 테스트 [리뷰 #3]

  ```typescript
  it('passes responseFormat json for generateJson on non-Gemini', async () => {
    // additionalProperties 존재 시 responseFormat: 'json' 문자열 전달 검증
  });
  ```

- [ ] **[RED-B8]** fixToolResultRoles 적용 테스트 [리뷰 #7]

  ```typescript
  it('applies fixToolResultRoles to messages before llmGenerateContent call', async () => {
    // contents에 functionResponse part 포함
    // llmGenerateContent에 전달된 messages에서 tool_result의 role이 'tool'인지 검증
  });
  ```

- [ ] **[RED-B9]** resolvedConfig.model 기반 모델 해석 테스트 [3차 #2 + 4차 #1]

  ```typescript
  it('uses getResolvedConfig().model for model resolution, not modelConfigKey alias or config.getModel()', async () => {
    // [4차 #1] config.getModel()은 전역 모델만 반환 → per-alias 오버라이드 무시
    // getResolvedConfig(modelConfigKey)가 alias chain을 해석하여 실제 모델 반환
    //
    // mock: modelConfigService.getResolvedConfig({ model: 'loop-detection' })
    //       → { model: 'gemini-2.5-flash', generateContentConfig: { ... } }
    // mock: providerName = 'claude'
    // verify: llmGenerateContent에 전달된 request.model === getDefaultModelForProvider('claude')
    // verify: request.model !== 'loop-detection'
    // verify: request.model !== config.getModel()  (전역 모델과도 다를 수 있음)
  });

  it('passes through user override model from resolvedConfig', async () => {
    // mock: getResolvedConfig({ model: 'loop-detection' }) → { model: 'claude-haiku' }
    // verify: request.model === 'claude-haiku'
  });
  ```

- [ ] **[RED-B-VERIFY]** 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/core/baseLlmClient  # 신규 테스트 FAIL
  ```

---

## 2.3 GREEN Phase: 최소 코드 구현

- [ ] **[TASK-B01]** `baseLlmClient.ts` 수정
  - 파일: `packages/core/src/core/baseLlmClient.ts` (+80줄)
  - 추가 import: `isProviderIndependentGenerator`,
    `convertContentsToLlmMessages`, `fixToolResultRoles`,
    `resolveProviderModel`, `LlmGenerateRequest`
  - 변경 내용:
    1. `_generateWithRetry()` 내부:
       `isNonGemini && isProviderIndependentGenerator(generator)` 체크 → llm\*
       경로 분기
    2. **모델 해석**:
       `const resolvedConfig = modelConfigService.getResolvedConfig(modelConfigKey)`
       → `resolveProviderModel(resolvedConfig.model, providerName)` [4차 #1] —
       `modelConfigKey.model`(config alias)도 `config.getModel()`(전역 모델)도
       사용 금지. generateContentConfig는 resolvedConfig에서 추출
    3. `_callLlmGenerateContent()` 신규 private 메서드: Content[] → LlmMessage[]
       변환 + `fixToolResultRoles()` 적용 (role 변환 + multi-tool_result 분할
       [3차 #1]) [리뷰 #7] + llmGenerateContent() 호출
    4. `_convertLlmResponseToGeminiResponse()` 신규 private 메서드:
       `LlmGenerateResponse` [리뷰 #4] → GenerateContentResponse 변환
    5. `responseFormat: 'json'` 문자열 전달 [리뷰 #3]

- [ ] **[GREEN-B-VERIFY]** baseLlmClient 테스트 통과
  ```bash
  npm test -w @didim365/agent-cli-core -- src/core/baseLlmClient  # 전체 PASS
  ```

---

## 2.4 REFACTOR Phase

- [ ] **[REFACTOR-B1]** 코드 구조 개선
  - `_callLlmGenerateContent()` 파라미터 정리 (파라미터 객체 패턴 검토)
  - systemInstruction 정규화 로직 → private 헬퍼 추출 가능 여부 검토
  - JSDoc 주석 정리

- [ ] **[REFACTOR-B-VERIFY]** 리팩터링 후 테스트 재확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/core/baseLlmClient  # PASS
  ```

---

## 2.5 사후 작업 (Post-Work)

- [ ] **[TEST-B]** Phase 2 관련 테스트 실행

  ```bash
  npm test -w @didim365/agent-cli-core -- src/core/baseLlmClient
  ```

- [ ] **[LINT-B]** 린터 + 타입체크

  ```bash
  npm run typecheck -w @didim365/agent-cli-core
  npm run lint -w @didim365/agent-cli-core
  ```

- [ ] **[VERIFY-B]** 기능 검증
  - 확인 항목 1: non-Gemini `generateJson()` → `llmGenerateContent()` 호출
  - 확인 항목 2: non-Gemini `generateContent()` → `llmGenerateContent()` 호출
  - 확인 항목 3: Gemini `generateJson()` → 기존 레거시 경로 유지 (회귀 없음)
  - 확인 항목 4: `getResponseText()` 호환 — 변환된 GenerateContentResponse에서
    정상 추출
  - 확인 항목 5: 호출자 변경 0건 — loopDetectionService 등 코드 변경 없이 동작
  - 확인 항목 6: `fixToolResultRoles()` 적용 — tool_result role 교정 [리뷰 #7]
  - 확인 항목 7: `responseFormat: 'json'` 문자열 전달 [리뷰 #3]
  - 확인 항목 8: 모델 해석 — `resolvedConfig.model` 기반, config alias 및
    config.getModel() 미사용 [4차 #1]
  - 확인 항목 9: `fixToolResultRoles()` multi-tool_result 분할 적용 [3차 #1]

- [ ] **[COMMIT-B]** 변경사항 커밋

  ```bash
  git add packages/core/src/core/baseLlmClient.ts packages/core/src/core/baseLlmClient.test.ts
  git commit -m "feat(core): add llm* path to BaseLlmClient for multi-provider utility calls"
  ```

- [ ] **[CHECKLIST-B]** 완료 조건 체크표시
  - 위 "Phase 2 완료 조건" 테이블의 모든 항목을 `⬜` → `✅`로 변경
  - 미완료 항목이 있으면 사유를 기록하고 Phase 3 사전 작업에서 확인

- [ ] **[DOC-B]** 작업 결과서 작성
  - 파일:
    `docs/00_project/subagent_multi_provider/working_history/subagent_phase2_basellmclient_{작업일자}.md`
  - 내용:
    - Phase 2 작업 요약 (변경 파일, 핵심 구현: llm\* 분기,
      \_convertLlmResponseToGeminiResponse 등)
    - 테스트 실행 결과 (PASS/FAIL 현황)
    - 린트/타입체크 결과
    - 커밋 해시
    - 특이사항 및 Phase 3 전달사항
    - 완료 조건 달성 여부

---

## Phase 2 변경 파일

| 파일                         | 액션     | 예상 규모 |
| ---------------------------- | -------- | --------- |
| `core/baseLlmClient.ts`      | **수정** | +80줄     |
| `core/baseLlmClient.test.ts` | **수정** | +120줄    |

## Phase 2 완료 조건

| 검증 항목                                          | 상태 |
| -------------------------------------------------- | ---- |
| RED: BaseLlmClient non-Gemini 테스트 작성          | ⬜   |
| GREEN: BaseLlmClient llm\* 분기 구현 + 테스트 통과 | ⬜   |
| REFACTOR: Phase 2 구조 개선                        | ⬜   |
| Phase 2 커밋 완료                                  | ⬜   |
| 완료 조건 체크표시 + 작업 결과서 작성              | ⬜   |
