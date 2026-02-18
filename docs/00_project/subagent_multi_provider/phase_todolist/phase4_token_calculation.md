# Phase 4: Category D — 토큰 계산 경로

> **목적**: `tokenCalculation.ts`의 미디어 파일 토큰 계산에서 non-Gemini
> `llmCountTokens()` 경로 추가 **영향**: 미디어(이미지) 포함 입력의 토큰 계산.
> 텍스트만인 경우 영향 없음 (로컬 추정치 사용) **참고 설계**:
> [plan_20260218.md §5.D](../plan_20260218.md)

---

## 4.1 사전 작업 (Pre-Work)

- [ ] **[PREV-REVIEW]** Phase 3 작업 결과서 확인
  - 파일:
    `docs/00_project/subagent_multi_provider/working_history/subagent_phase3_geminiclient_{작업일자}.md`
  - 확인: Phase 3 완료 조건 전체 달성 여부
  - 확인: Phase 4 전달사항 (주의점, 미해결 이슈)
  - 확인: web-fetch/web-search non-Gemini 가드 구현 상태 [4차 #2]
  - **미완료 항목 있으면 Phase 4 착수 전 해소 필요**

- [ ] **[CONTEXT]** 작업 목적 확인
  - 설계 문서 검토: [plan_20260218.md §5.D](../plan_20260218.md)
  - 에러 재현: `tokenCalculation.ts:92` → `contentGenerator.countTokens()` →
    throw (미디어 포함 시)

- [ ] **[ANALYSIS-1]** `tokenCalculation.ts` 현재 로직 분석
  - 파일: `packages/core/src/utils/tokenCalculation.ts`
  - 확인: line 85-102 — `hasMedia` 분기, `countTokens()` 호출, catch 폴백

- [ ] **[ANALYSIS-2]** 기존 tokenCalculation 테스트 베이스라인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/utils/tokenCalculation
  ```

---

## 4.2 RED Phase: 실패 테스트 작성

- [ ] **[RED-D1]** non-Gemini + media → `llmCountTokens()` 호출 테스트

  ```typescript
  // packages/core/src/utils/tokenCalculation.test.ts (기존 파일에 추가)
  describe('tokenCalculation - non-Gemini', () => {
    it('calls llmCountTokens for non-Gemini provider with media', async () => {
      // mock: contentGenerator.providerName = 'claude'
      // mock: isProviderIndependentGenerator() = true
      // mock: llmCountTokens() → { totalTokens: 150 }
      const result = await calculateTokenCount(
        mockGenerator,
        'claude-model',
        partsWithMedia,
      );
      expect(mockGenerator.llmCountTokens).toHaveBeenCalled();
      expect(result).toBe(150);
    });
  });
  ```

- [ ] **[RED-D2]** non-Gemini + text only → 로컬 추정치 (API 미호출) 테스트

  ```typescript
  it('uses local estimate for non-Gemini text-only input', async () => {
    // API 호출 없이 로컬 추정치 반환 검증
    expect(mockGenerator.llmCountTokens).not.toHaveBeenCalled();
  });
  ```

- [ ] **[RED-D3]** Gemini + media → 기존 `countTokens()` 유지 테스트 (회귀)

  ```typescript
  it('uses legacy countTokens for Gemini provider with media', async () => {
    // mock: contentGenerator.providerName = 'gemini'
    expect(mockGenerator.countTokens).toHaveBeenCalled();
    expect(mockGenerator.llmCountTokens).not.toHaveBeenCalled();
  });
  ```

- [ ] **[RED-D-VERIFY]** 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/utils/tokenCalculation  # 신규 테스트 FAIL
  ```

---

## 4.3 GREEN Phase: 최소 코드 구현

- [ ] **[TASK-D01]** `tokenCalculation.ts` 수정
  - 파일: `packages/core/src/utils/tokenCalculation.ts` (+15줄)
  - 변경 위치: `hasMedia` 분기 내부 (line ~90)
  - 추가 import: `isProviderIndependentGenerator`, `convertContentToLlmMessage`
    [리뷰 #4]
  - 로직: non-Gemini + llm\* 지원 → `llmCountTokens()` 호출, 기존 catch 폴백
    유지

- [ ] **[GREEN-D-VERIFY]** tokenCalculation 테스트 통과
  ```bash
  npm test -w @didim365/agent-cli-core -- src/utils/tokenCalculation  # PASS
  ```

---

## 4.4 REFACTOR Phase

- [ ] **[REFACTOR-D1]** 코드 구조 개선
  - non-Gemini / Gemini 분기 가독성 개선
  - 공통 에러 처리(catch 폴백) 로직 정리

- [ ] **[REFACTOR-D-VERIFY]** 리팩터링 후 테스트 재확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/utils/tokenCalculation  # PASS
  ```

---

## 4.5 사후 작업 (Post-Work)

- [ ] **[LINT-D]** 린터 + 타입체크

  ```bash
  npm run typecheck -w @didim365/agent-cli-core
  ```

- [ ] **[VERIFY-D]** 기능 검증
  - 확인 항목 1: non-Gemini + media → `llmCountTokens()` 호출
  - 확인 항목 2: non-Gemini + text only → 로컬 추정치 (API 미호출)
  - 확인 항목 3: Gemini + media → 기존 `countTokens()` 유지 (회귀 없음)
  - 확인 항목 4: llmCountTokens 실패 시 기존 catch 폴백 동작

- [ ] **[COMMIT-D]** 변경사항 커밋

  ```bash
  git add packages/core/src/utils/tokenCalculation.ts packages/core/src/utils/tokenCalculation.test.ts
  git commit -m "feat(utils): add llmCountTokens path for non-Gemini token calculation"
  ```

- [ ] **[CHECKLIST-D]** 완료 조건 체크표시
  - 위 "Phase 4 완료 조건" 테이블의 모든 항목을 `⬜` → `✅`로 변경
  - 미완료 항목이 있으면 사유를 기록하고 Phase 5 사전 작업에서 확인

- [ ] **[DOC-D]** 작업 결과서 작성
  - 파일:
    `docs/00_project/subagent_multi_provider/working_history/subagent_phase4_token_calculation_{작업일자}.md`
  - 내용:
    - Phase 4 작업 요약 (변경 파일, 핵심 구현: llmCountTokens 분기)
    - 테스트 실행 결과 (PASS/FAIL 현황)
    - 린트/타입체크 결과
    - 커밋 해시
    - 특이사항 및 Phase 5 전달사항
    - 완료 조건 달성 여부

---

## Phase 4 변경 파일

| 파일                             | 액션     | 예상 규모 |
| -------------------------------- | -------- | --------- |
| `utils/tokenCalculation.ts`      | **수정** | +15줄     |
| `utils/tokenCalculation.test.ts` | **수정** | +30줄     |

## Phase 4 완료 조건

| 검증 항목                                            | 상태 |
| ---------------------------------------------------- | ---- |
| RED: tokenCalculation non-Gemini 테스트              | ✅   |
| GREEN: tokenCalculation llmCountTokens 분기 + 테스트 | ✅   |
| REFACTOR: Phase 4 구조 개선                          | ✅   |
| Phase 4 커밋 완료                                    | ✅   |
| 완료 조건 체크표시 + 작업 결과서 작성                | ✅   |
