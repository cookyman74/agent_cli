# Phase 3: Category C — GeminiClient.generateContent() 도구 호출 경로

> **목적**: `web-fetch.ts`, `web-search.ts`가 호출하는
> `GeminiClient.generateContent()`를 non-Gemini에서도 동작하도록 수정 **전략**:
> `GeminiClient.generateContent()` 메서드에 직접 llm\* 분기 추가 +
> `retryWithBackoff()` + `getResolvedConfig()` 적용 [2차 #2] **도구
> 파일(web-fetch, web-search) 변경: 0건** **참고 설계**:
> [plan_20260218.md §5.C](../plan_20260218.md)
>
> **⚠️ [3차 #2→4차 #1]** `modelConfigKey.model` (예: `'web-fetch'`,
> `'web-search'`, `'web-fetch-fallback'`)은 config alias 키이며 실제 모델명이
> 아님. `isGeminiSpecificModel('web-fetch')` = `false` →
> `resolveProviderModel()`이 custom model 정책으로 그대로 통과 → API 에러.
> ~~`this.config.getModel()`~~ (전역 모델만 반환, per-alias 오버라이드 무시)도
> 부적합 [4차 #1]. **올바른 접근법**: `getResolvedConfig(modelConfigKey).model`
> → alias chain 해석(예: `'gemini-2.5-flash'`) → `resolveProviderModel()` →
> 프로바이더 기본 모델.
>
> **⚠️ [4차 리뷰 #2]** non-Gemini web-fetch/web-search는 Gemini 전용
> 도구(`urlContext`, `googleSearch`)가 없어 **환각 응답** 위험. 성공 판정이
> "응답 텍스트 비어있지 않음" (web-fetch.ts:311, web-search.ts:98)이므로 환각도
> 성공으로 처리됨. web-fetch: non-Gemini → throw 에러 → web-fetch.ts catch(382)
> → error result 반환 [5차 #3]. web-search: non-Gemini → throw 에러 →
> web-search.ts catch → error result 반환.
>
> **⚠️ [5차 리뷰 #2]** `registerCoreTool(WebSearchTool, this)`
> (config.ts:2007)이 무조건 실행 — non-Gemini에서도 model에 web-search 툴 노출.
> 에러 반환해도 model이 반복 호출할 수 있음. 에러 메시지를 명확히 작성하여 model
> 학습 유도. 구조적 해소(provider별 tool 미등록)는 hotfix 범위 밖.
>
> **⚠️ [5차 리뷰 #3]** web-fetch fallback 유도: 4차 계획의 "빈 응답 반환 →
> processingError → fallback" 방식은 web-fetch.ts:311 의존 (계약적 불안정).
> throw 에러 방식으로 변경 시 catch(382) → error result (fallback 미발동).
> fallback 발동 원하면 web-fetch.ts에 non-Gemini 가드 2줄 추가 필요 (선택적).
>
> **ℹ️ [5차 리뷰 #4]** alias 기반 인프라 호출(loop-detection, summarizer 등)에서
> `resolveProviderModel()`이 provider default 강제 — **설계 의도**. 인프라
> 호출은 cost-effective 모델 사용이 올바름. `LLM_MODEL` env var로 전역 override
> 가능.

---

## 3.1 사전 작업 (Pre-Work)

- [ ] **[PREV-REVIEW]** Phase 2 작업 결과서 확인
  - 파일:
    `docs/00_project/subagent_multi_provider/working_history/subagent_phase2_basellmclient_{작업일자}.md`
  - 확인: Phase 2 완료 조건 전체 달성 여부
  - 확인: Phase 3 전달사항 (주의점, 미해결 이슈)
  - 확인: `_convertLlmResponseToGeminiResponse()` 구현 상태 (Phase 3 DRY 검토 시
    참조)
  - **미완료 항목 있으면 Phase 3 착수 전 해소 필요**

- [ ] **[CONTEXT]** 작업 목적 확인
  - 설계 문서 검토: [plan_20260218.md §5.C](../plan_20260218.md)
  - 에러 재현 경로: `web-search.ts` → `geminiClient.generateContent()` →
    `client.ts:1167` → `contentGenerator.generateContent()` → throw

- [ ] **[ANALYSIS-1]** `GeminiClient.generateContent()` 현재 로직 분석
  - 파일: `packages/core/src/core/client.ts`
  - 확인: line 1116-1210 — retry, fallback, model selection 로직
  - 확인: line 1122 — `getResolvedConfig(modelConfigKey)` [2차 #2]
  - 확인: line 1135 — `applyModelSelection()` (Gemini 전용)
  - 확인: line 1167 — `this.getContentGeneratorOrFail().generateContent()`
    (레거시 호출 지점)
  - 확인: line 1203 — `retryWithBackoff()` 옵션 (Gemini 전용 콜백 포함) [2차 #2]

- [ ] **[ANALYSIS-2]** web-fetch/web-search 호출 패턴 확인
  - `web-fetch.ts:275` —
    `geminiClient.generateContent({ model: 'web-fetch' }, contents, signal)`
  - `web-search.ts:83` —
    `geminiClient.generateContent({ model: 'web-search' }, contents, signal)`
  - 확인: 반환값에서 `groundingMetadata` 접근 여부 (web-search만 사용)
  - **[3차 #2]** `modelConfigKey.model` = `'web-fetch'` / `'web-search'` =
    config alias 키 (실제 모델명 아님)

- [ ] **[ANALYSIS-3A]** config alias → model 해석 경로 확인 [3차 #2 + 4차 #1]
  - `defaultModelConfigs.ts:161` —
    `'web-fetch': { extends: 'gemini-2.5-flash-base' }` (config alias 정의)
  - `isGeminiSpecificModel('web-fetch')` = `false` (GEMINI_ALIASES에 없음,
    'gemini-' 접두사 없음)
  - `resolveProviderModel('web-fetch', 'claude')` → custom model 허용 →
    `'web-fetch'` 그대로 반환 → **API 에러**
  - ~~`this.config.getModel()`~~ = 전역 모델만 반환 → per-alias 오버라이드 무시
    [4차 #1]
  - `getResolvedConfig({ model: 'web-fetch' })` → alias chain →
    `resolvedConfig.model = 'gemini-2.5-flash'`
  - `resolveProviderModel('gemini-2.5-flash', 'claude')` → provider default ✅
  - **결론**:
    `resolveProviderModel(getResolvedConfig(modelConfigKey).model, providerName)`
    사용

- [ ] **[ANALYSIS-3B]** non-Gemini web-fetch/web-search 환각 위험 분석 [4차 리뷰
      #2]
  - `defaultModelConfigs.ts:157` —
    `'web-search': { tools: [{ googleSearch: {} }] }` — Gemini 전용
  - `defaultModelConfigs.ts:165` —
    `'web-fetch': { tools: [{ urlContext: {} }] }` — Gemini 전용
  - non-Gemini 프로바이더에는 이 도구들이 없음 → LLM이 URL 내용을 환각으로 생성
  - `web-fetch.ts:301-314` — `urlContextMeta` 없으면 → `!responseText.trim()` 만
    체크 → 환각 텍스트도 성공
  - `web-search.ts:98` — `!responseText.trim()` 만 체크 → 동일
  - `web-fetch.ts:124` — `executeFallback()` 이미 존재 (HTTP 직접 fetch + 콘텐츠
    추출)
  - **결론**: web-fetch → throw 에러 (catch → error result), web-search → throw
    에러 (catch → error result)
  - **참고** [5차 #3]: web-fetch fallback 발동에는 web-fetch.ts에 non-Gemini
    가드 추가 필요 (선택적 2줄 수정)

- [ ] **[ANALYSIS-3C]** web-search 툴 등록 및 반복 호출 위험 분석 [5차 리뷰 #2]
  - `config.ts:2007` — `registerCoreTool(WebSearchTool, this)` 무조건 실행
    (프로바이더 무관)
  - non-Gemini에서도 model에 web-search 툴이 노출됨
  - model이 web-search를 호출 → `generateContent()` throw → 에러 tool result
    반환 → model이 재호출 가능
  - **대응**: 에러 메시지를 명확히 작성 ("Web search requires Gemini provider
    with googleSearch capability. Not available for [provider].") → model 학습
    유도
  - **구조적 해소** (provider별 tool 미등록)은 hotfix 범위 밖 — 향후 tool
    registry 리팩터링 시 검토
  - 대화 턴 제한(기존 max agent turns)으로 무한 루프 방지

- [ ] **[ANALYSIS-3]** 기존 client.ts 관련 테스트 베이스라인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/core/client
  ```

---

## 3.2 RED Phase: 실패 테스트 작성

- [ ] **[RED-C1]** non-Gemini `GeminiClient.generateContent()` llm\* 경로 테스트

  ```typescript
  // packages/core/src/core/client.test.ts (기존 파일에 추가)
  describe('GeminiClient.generateContent() - non-Gemini', () => {
    it('calls llmGenerateContent directly for non-Gemini provider', async () => {
      // mock: contentGenerator.providerName = 'claude'
      // mock: isProviderIndependentGenerator() = true
      // mock: generator.llmGenerateContent() → LlmGenerateResponse
      const result = await geminiClient.generateContent(
        { model: 'web-fetch' },
        [{ role: 'user', parts: [{ text: 'test' }] }],
        signal,
      );
      expect(mockGenerator.llmGenerateContent).toHaveBeenCalled();
      expect(mockGenerator.generateContent).not.toHaveBeenCalled();
    });
  });
  ```

- [ ] **[RED-C2]** non-Gemini + systemInstruction 포함 검증 [리뷰 #5]

  ```typescript
  it('includes systemInstruction via getCoreSystemPrompt for non-Gemini', async () => {
    // llmGenerateContent에 전달된 request.systemInstruction 존재 검증
  });
  ```

- [ ] **[RED-C3]** non-Gemini + retryWithBackoff 적용 검증 [2차 #2]

  ```typescript
  it('applies retryWithBackoff for non-Gemini (without Gemini-specific callbacks)', async () => {
    // 일시적 에러 시 재시도 발생 검증
    // Gemini 전용 콜백(onPersistent429, onValidationRequired) 미설정 검증
  });
  ```

- [ ] **[RED-C4]** non-Gemini + getResolvedConfig 적용 검증 [2차 #2]

  ```typescript
  it('applies getResolvedConfig temperature/topP for non-Gemini', async () => {
    // modelConfigService.getResolvedConfig() 호출 검증
    // llmGenerateContent request에 temperature, topP 포함 검증
  });
  ```

- [ ] **[RED-C5]** non-Gemini + fixToolResultRoles 적용 검증

  ```typescript
  it('applies fixToolResultRoles to converted messages', async () => {
    // contents에 functionResponse part 포함 시
    // fixToolResultRoles() 적용 검증
  });
  ```

- [ ] **[RED-C6]** Gemini `GeminiClient.generateContent()` 기존 경로 유지 테스트

  ```typescript
  it('uses legacy generateContent for Gemini provider', async () => {
    // 기존 retry/fallback 로직 유지 (회귀 검증)
  });
  ```

- [ ] **[RED-C7]** resolvedConfig.model 기반 모델 해석 테스트 [3차 #2 + 4차 #1]

  ```typescript
  it('uses getResolvedConfig().model for model resolution, not config alias or config.getModel()', async () => {
    // [4차 #1] config.getModel()은 전역 모델만 반환 → per-alias 오버라이드 무시
    //
    // mock: modelConfigService.getResolvedConfig({ model: 'web-fetch' })
    //       → { model: 'gemini-2.5-flash', generateContentConfig: { tools: [{ urlContext: {} }] } }
    // mock: providerName = 'claude'
    // verify: llmGenerateContent에 전달된 request.model === getDefaultModelForProvider('claude')
    // verify: request.model !== 'web-fetch'
    // verify: request.model !== config.getModel()
  });
  ```

- [ ] **[RED-C8]** non-Gemini web-fetch/web-search → throw 에러 테스트 [4차 #2 +
      5차 #2~#3]

  ```typescript
  it('throws for non-Gemini web-fetch (Gemini-only urlContext tool)', async () => {
    // non-Gemini + modelConfigKey.model === 'web-fetch'
    // → Gemini 전용 urlContext 도구 없어 환각 위험
    // → generateContent()가 throw → web-fetch.ts catch(382) → error result 반환
    // [5차 #3] "빈 응답 반환" 대신 throw 방식 — 계약적 안정성 확보
    await expect(
      geminiClient.generateContent({ model: 'web-fetch' }, contents, signal),
    ).rejects.toThrow(/URL context requires Gemini provider/);
  });

  it('throws for non-Gemini web-search with clear error message (Gemini-only tool)', async () => {
    // non-Gemini + modelConfigKey.model === 'web-search'
    // → Gemini 전용 googleSearch 도구 없이는 검색 불가
    // → 명시적 에러 throw with descriptive message
    // [5차 #2] 명확한 메시지로 model 학습 유도 (반복 호출 억제)
    await expect(
      geminiClient.generateContent({ model: 'web-search' }, contents, signal),
    ).rejects.toThrow(/Web search requires Gemini provider/);
  });

  it('does not throw for non-Gemini with general model config key', async () => {
    // non-Gemini + modelConfigKey.model === 'summarizer-default'
    // → web-fetch/web-search 아님 → 정상 llm* 경로 진행
  });
  ```

- [ ] **[RED-C-VERIFY]** 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/core/client  # 신규 테스트 FAIL
  ```

---

## 3.3 GREEN Phase: 최소 코드 구현

- [ ] **[TASK-C01]** `client.ts` `generateContent()` 메서드 수정
  - 파일: `packages/core/src/core/client.ts` (+25줄)
  - 변경 위치: `generateContent()` 메서드 시작 부분 (line ~1116)
  - 추가 import: `isProviderIndependentGenerator`,
    `convertContentsToLlmMessages`, `fixToolResultRoles`,
    `resolveProviderModel`, `retryWithBackoff`
  - 로직:
    1. non-Gemini 감지 → `isProviderIndependentGenerator()` 체크
    2. **[4차 #2 + 5차 #2~#3] web-fetch/web-search throw 가드**:
       - `modelConfigKey.model === 'web-search'` → throw Error("Web search
         requires Gemini provider with googleSearch capability. Not available
         for [provider].") [5차 #2: 명확한 에러 메시지로 model 학습 유도]
       - `modelConfigKey.model === 'web-fetch'` 또는 `'web-fetch-fallback'` →
         throw Error("URL context requires Gemini provider. Fallback to HTTP
         fetch.") [5차 #3: "빈 응답 반환" 대신 throw → web-fetch.ts catch(382)가
         error result 반환]
       - **참고**: throw 방식은 web-fetch.ts `executeFallback()` 미발동.
         fallback 원하면 web-fetch.ts에 non-Gemini 가드 2줄 추가 (선택적, 별도
         커밋 권장)
    3. `getCoreSystemPrompt()` 호출 [리뷰 #5]
    4. **`const resolvedConfig = getResolvedConfig(modelConfigKey)`** →
       temperature/topP + 해석된 모델명 [2차 #2 + 4차 #1]
    5. **`resolveProviderModel(resolvedConfig.model, providerName)`** [4차 #1] —
       `modelConfigKey.model`(config alias)도 `config.getModel()`(전역 모델)도
       사용 금지
    6. `convertContentsToLlmMessages()` + `fixToolResultRoles()` (role 변환 +
       multi-tool_result 분할 [3차 #1]) [리뷰 #7]
    7. `retryWithBackoff(apiCall, { authType })` — Gemini 전용 콜백 미설정 [2차
       #2]
    8. `_convertLlmResponseToGeminiResponse()` 또는 인라인 변환
  - **기존 Gemini retry/fallback 로직 변경 없음**

- [ ] **[TASK-C02]** (선택적) `web-fetch.ts` non-Gemini 가드 추가 [5차 #3]
  - 파일: `packages/core/src/tools/web-fetch.ts` (+2줄)
  - 변경 위치: `processUrlsWithGemini()` 메서드,
    `geminiClient.generateContent()` 호출 전
  - 추가 로직:
    ```typescript
    // non-Gemini에서는 urlContext 도구 없음 → 직접 HTTP fallback 사용
    const providerName = this.config.getContentGenerator().providerName;
    if (providerName != null && providerName !== 'gemini') {
      return await this.executeFallback(signal);
    }
    ```
  - **적용 시 효과**: non-Gemini web-fetch → `executeFallback()` 직접 실행 (HTTP
    fetch + LLM 요약)
  - **미적용 시**: throw → catch(382) → error result 반환 (fallback 미발동,
    error message로 model에 전달)
  - **적용 판단 기준**: HTTP fallback 품질이 error result보다 나은 UX 제공 시
    적용 권장

- [ ] **[GREEN-C-VERIFY]** client.ts 테스트 통과
  ```bash
  npm test -w @didim365/agent-cli-core -- src/core/client  # PASS
  ```

---

## 3.4 REFACTOR Phase

- [ ] **[REFACTOR-C1]** 코드 구조 개선
  - `_convertLlmResponseToGeminiResponse()` DRY 검토: BaseLlmClient와 동일 로직
    → 공통 유틸리티 추출 여부 판단 (의존성 최소화 vs DRY 트레이드오프)
  - non-Gemini 분기 로직 가독성 개선
  - JSDoc 주석 정리

- [ ] **[REFACTOR-C-VERIFY]** 리팩터링 후 테스트 재확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/core/client  # PASS
  ```

---

## 3.5 사후 작업 (Post-Work)

- [ ] **[TEST-C]** Phase 3 관련 테스트 실행

  ```bash
  npm test -w @didim365/agent-cli-core -- src/core/client
  npm test -w @didim365/agent-cli-core -- src/tools/web-fetch  # 회귀 확인
  npm test -w @didim365/agent-cli-core -- src/tools/web-search  # 회귀 확인
  ```

- [ ] **[LINT-C]** 린터 + 타입체크

  ```bash
  npm run typecheck -w @didim365/agent-cli-core
  ```

- [ ] **[VERIFY-C]** 기능 검증
  - 확인 항목 1: non-Gemini → `llmGenerateContent()` 직접 호출 (BaseLlmClient
    경유 아님)
  - 확인 항목 2: non-Gemini → `retryWithBackoff()` 적용 (Gemini 전용 콜백
    미설정) [2차 #2]
  - 확인 항목 3: non-Gemini → `getResolvedConfig()` 경유 temperature/topP 반영
    [2차 #2]
  - 확인 항목 4: non-Gemini → systemInstruction 포함 [리뷰 #5]
  - 확인 항목 5: Gemini → 기존 retry/fallback 경로 유지
  - 확인 항목 6: web-fetch.ts, web-search.ts 코드 변경 없음
  - 확인 항목 7: 모델 해석 — `resolvedConfig.model` 기반, config alias 및
    config.getModel() 미사용 [4차 #1]
  - 확인 항목 8: non-Gemini web-fetch → throw 에러 (환각 방지) — catch(382) →
    error result [4차 #2 + 5차 #3]
  - 확인 항목 9: non-Gemini web-search → throw 에러 (명확한 메시지로 model 학습
    유도) [4차 #2 + 5차 #2]
  - 확인 항목 10: non-Gemini 일반 modelConfigKey → web-fetch/search 가드에
    걸리지 않고 정상 llm\* 경로 진행 [5차 #2]

- [ ] **[COMMIT-C]** 변경사항 커밋

  ```bash
  git add packages/core/src/core/client.ts packages/core/src/core/client.test.ts
  git commit -m "feat(core): route non-Gemini GeminiClient.generateContent() via llm* with retry"
  ```

- [ ] **[CHECKLIST-C]** 완료 조건 체크표시
  - 위 "Phase 3 완료 조건" 테이블의 모든 항목을 `⬜` → `✅`로 변경
  - 미완료 항목이 있으면 사유를 기록하고 Phase 4 사전 작업에서 확인

- [ ] **[DOC-C]** 작업 결과서 작성
  - 파일:
    `docs/00_project/subagent_multi_provider/working_history/subagent_phase3_geminiclient_{작업일자}.md`
  - 내용:
    - Phase 3 작업 요약 (변경 파일, 핵심 구현: llm\* 분기, web-fetch/search 가드
      등)
    - 테스트 실행 결과 (PASS/FAIL 현황, web-fetch/web-search 회귀 확인)
    - 린트/타입체크 결과
    - 커밋 해시
    - 특이사항 및 Phase 4 전달사항
    - 완료 조건 달성 여부

---

## Phase 3 변경 파일

| 파일                  | 액션                       | 예상 규모 |
| --------------------- | -------------------------- | --------- |
| `core/client.ts`      | **수정**                   | +25줄     |
| `core/client.test.ts` | **수정**                   | +50줄     |
| `tools/web-fetch.ts`  | **수정** (선택적) [5차 #3] | +2줄      |

## Phase 3 완료 조건

| 검증 항목                                                                                              | 상태 |
| ------------------------------------------------------------------------------------------------------ | ---- |
| RED: GeminiClient.generateContent non-Gemini + retry 테스트                                            | ⬜   |
| RED: resolvedConfig.model 기반 모델 해석 테스트 [4차 #1]                                               | ⬜   |
| RED: non-Gemini web-fetch/web-search throw 에러 + 일반 modelConfigKey 통과 테스트 [4차 #2 + 5차 #2~#3] | ⬜   |
| GREEN: client.ts llm\* 직접 분기 + retryWithBackoff + 가드 + 테스트 통과                               | ⬜   |
| REFACTOR: \_convertLlmResponseToGeminiResponse DRY 검토                                                | ⬜   |
| Phase 3 커밋 완료                                                                                      | ⬜   |
| 완료 조건 체크표시 + 작업 결과서 작성                                                                  | ⬜   |
