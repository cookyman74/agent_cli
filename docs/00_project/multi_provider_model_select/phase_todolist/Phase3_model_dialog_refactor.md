# Phase 3: CLI — ModelDialog 리팩토링 + FreeformModelInput + 연결

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 테스트
> 먼저 작성 → 최소 코드 구현 → 리팩터링 **리팩터링 원칙**: "Make it work → Make
> it right → Make it fast" **참고 문서**:
>
> - [99_TDD_plan.md](../template/99_TDD_plan.md) — TDD 방법론
> - [03_architecture_design.md](../detail_plan/03_architecture_design.md) —
>   §3.5, §3.6, §3.8, §3.9
> - [04_change_scope_and_steps.md](../detail_plan/04_change_scope_and_steps.md)
>   — Step 4~6
> - [06_review_log.md](../detail_plan/06_review_log.md) — 이슈 #3, #7, #13

---

## 작업 개요

| 항목        | 내용                                                                            |
| ----------- | ------------------------------------------------------------------------------- |
| 프로젝트    | Multi-Provider `/model` Command — UI 리팩토링                                   |
| 영향 범위   | `ModelDialog.tsx`, `FreeformModelInput.tsx` (신규), `DialogManager.tsx`         |
| 위험 수준   | 🟠 High — 사용자 대면 UI 변경, 기존 ModelDialog 전면 리팩토링                   |
| 성능 민감도 | 🟢 Low — React 컴포넌트, 렌더링 성능 영향 미미                                  |
| 참고 설계   | [03_architecture_design.md §3.5~§3.9](../detail_plan/03_architecture_design.md) |
| 작업 브랜치 | `DID/v0.1`                                                                      |

---

## 핵심 리스크 요약

| 리스크                                      | 영향      | 대응 방안                                  | 상태 |
| ------------------------------------------- | --------- | ------------------------------------------ | ---- |
| 기존 ModelDialog 테스트 전면 깨짐           | 🔴 High   | 기존 스냅샷 백업, 단계적 수정              | ⬜   |
| Gemini 프리뷰 필터링 로직 회귀              | 🟠 Medium | Gemini 전용 분기 테스트 보존               | ⬜   |
| `handleSelect` 영속화 누락 (sLM/byProvider) | 🟠 Medium | env + slmConfig + byProvider 동기화 테스트 | ⬜   |
| `LLM_MODEL` env 동기화 부작용               | 🟡 Medium | Gemini 프로바이더에서는 env 미변경 테스트  | ⬜   |

---

## 3.1 사전 작업 (Pre-Work)

- [ ] **[REVIEW]** Phase 2 작업 결과서 검토
  - 파일: `../working_history/Phase2_cli_provider_detect_settings_{작업일자}.md`
  - 확인: resolveActiveProvider 동작, settings 스키마 확장 완료, startup
    resolution 변경

- [ ] **[CONTEXT]** Phase 3 작업 목적 확인
  - 설계:
    [03_architecture_design.md §3.5](../detail_plan/03_architecture_design.md) —
    ModelDialog 리팩토링
  - 설계:
    [03_architecture_design.md §3.6](../detail_plan/03_architecture_design.md) —
    영속화 동기화
  - 설계:
    [03_architecture_design.md §3.8](../detail_plan/03_architecture_design.md) —
    DialogManager 수정
  - 설계:
    [03_architecture_design.md §3.9](../detail_plan/03_architecture_design.md) —
    FreeformModelInput

- [ ] **[ANALYSIS-1]** 현재 `ModelDialog.tsx` 구조 분석
  - 파일: `packages/cli/src/ui/components/ModelDialog.tsx`
  - 확인: 현재 props, 상태 관리, `mainOptions`/`manualOptions` 하드코딩 구조
  - 확인: `shouldShowPreviewModels` 필터링 로직
  - 확인: `config.setModel()` 호출 패턴

- [ ] **[ANALYSIS-2]** 현재 `ModelDialog.test.tsx` 테스트 분석
  - 파일: `packages/cli/src/ui/components/ModelDialog.test.tsx`
  - 확인: 기존 테스트 시나리오, 스냅샷, mock 구조
  - 확인: 영향받는 테스트 목록 정리

- [ ] **[ANALYSIS-3]** `DialogManager.tsx` 현재 ModelDialog 전달 방식
  - 파일: `packages/cli/src/ui/components/DialogManager.tsx`
  - 확인: `uiState.selectedProvider` 접근 가능 여부

- [ ] **[ANALYSIS-4]** 기존 테스트 베이스라인
  ```bash
  npm test -w @didim365/agent-cli -- src/ui/components/ModelDialog.test
  ```

---

## 3.2 RED Phase (Part A): ModelDialog 프로바이더 분기 테스트

> **목적**: 프로바이더별 모델 목록 분기 동작 정의

- [ ] **[RED-1]** Gemini 프로바이더 기본 동작 테스트

  ```typescript
  describe('ModelDialog - Gemini provider', () => {
    it('renders Gemini presets (Auto Gemini 3, Auto Gemini 2.5, Manual)', () => {
      renderWithProviders(<ModelDialog onClose={onClose} selectedProvider="gemini" />);
      // presets + Manual 확인
    });

    it('renders Gemini manual models on Manual select', () => {
      // gemini-3-pro-preview, gemini-2.5-pro 등 확인
    });
  });
  ```

- [ ] **[RED-2]** Claude 프로바이더 분기 테스트

  ```typescript
  describe('ModelDialog - Claude provider', () => {
    it('renders Claude presets (Recommended claude-opus-4-6, Manual)', () => {
      renderWithProviders(<ModelDialog onClose={onClose} selectedProvider="claude" />);
    });

    it('renders Claude manual models', () => {
      // claude-opus-4-6, claude-sonnet-4-5, claude-haiku-4-5 확인
    });
  });
  ```

- [ ] **[RED-3]** OpenAI 프로바이더 분기 테스트

  ```typescript
  describe('ModelDialog - OpenAI provider', () => {
    it('renders OpenAI presets (Recommended gpt-4.1, Manual)', () => {
      renderWithProviders(<ModelDialog onClose={onClose} selectedProvider="openai" />);
    });

    it('renders OpenAI manual models including reasoning models', () => {
      // gpt-4.1, gpt-4.1-mini, gpt-4o, o3, o4-mini 확인
    });
  });
  ```

- [ ] **[RED-4]** DidimAIStudio 비활성 테스트

  ```typescript
  describe('ModelDialog - DidimAIStudio provider', () => {
    it('renders disabled message instead of model list', () => {
      renderWithProviders(<ModelDialog onClose={onClose} selectedProvider="didim-studio" />);
      // 시나리오 기반 안내 메시지 확인
    });
  });
  ```

- [ ] **[RED-5]** env 자동감지 경로 테스트 (selectedProvider 없음)

  ```typescript
  describe('ModelDialog - env auto-detect', () => {
    it('detects Claude via LLM_PROVIDER when selectedProvider is undefined', () => {
      vi.stubEnv('LLM_PROVIDER', 'claude');
      renderWithProviders(<ModelDialog onClose={onClose} />);
      // Claude 모델 목록 표시 확인
    });
  });
  ```

- [ ] **[RED-VERIFY-A]** 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli -- src/ui/components/ModelDialog.test  # 신규 테스트 FAIL
  ```

---

## 3.3 GREEN Phase (Part A): ModelDialog 프로바이더 분기 구현

- [ ] **[TASK-001]** `ModelDialog.tsx` props 확장
  - 파일: `packages/cli/src/ui/components/ModelDialog.tsx`
  - 변경: `selectedProvider?: string` prop 추가
  - 변경: `resolveActiveProvider(selectedProvider)` 호출로 프로바이더 감지

- [ ] **[TASK-002]** `ModelDialog.tsx` 프로바이더별 분기 렌더링
  - 변경: `PROVIDER_MODEL_REGISTRY[provider]` 기반 동적
    `mainOptions`/`manualOptions` 생성
  - 변경: `modelSelectionDisabled` → 안내 메시지 뷰
  - 변경: Gemini 프리뷰 필터링 → `provider === 'gemini'` 분기에서만 적용

- [ ] **[GREEN-VERIFY-A]** ModelDialog 프로바이더 분기 테스트 통과
  ```bash
  npm test -w @didim365/agent-cli -- src/ui/components/ModelDialog.test  # PASS
  ```

---

## 3.4 RED Phase (Part B): handleSelect 영속화 + FreeformModelInput

- [ ] **[RED-6]** `handleSelect` 영속화 동기화 테스트

  ```typescript
  describe('ModelDialog - handleSelect sync', () => {
    it('sets LLM_MODEL env for non-gemini provider', () => {
      // Claude에서 모델 선택 → process.env['LLM_MODEL'] 갱신 확인
    });

    it('does NOT set LLM_MODEL env for gemini provider', () => {
      // Gemini에서 모델 선택 → LLM_MODEL 미변경 확인
    });

    it('updates slmConfig.model in settings for openai-compatible', () => {
      // sLM에서 모델 선택 → settings.setValue('security.auth.slmConfig', ...) 확인
    });

    it('creates minimal slmConfig when none exists (이슈 #13)', () => {
      // slmConfig가 없는 env-only 경로 → 빈 객체 + model 저장 확인
    });

    it('saves model via saveModelForProvider (byProvider sync)', () => {
      // model.name + model.byProvider[provider] 양쪽 저장 확인
    });
  });
  ```

- [ ] **[RED-7]** `FreeformModelInput` 기본 동작 테스트

  ```typescript
  // packages/cli/src/ui/components/FreeformModelInput.test.tsx (신규)
  describe('FreeformModelInput', () => {
    it('renders text input with current model', () => {
      renderWithProviders(
        <FreeformModelInput onSelect={onSelect} onClose={onClose} currentModel="llama3" />
      );
      // "Current model: llama3" 표시 확인
    });

    it('calls onSelect with entered text on Enter', () => {
      // 텍스트 입력 → Enter → onSelect('new-model') 호출 확인
    });

    it('calls onClose on Escape', () => {
      // Esc → onClose() 호출 확인
    });
  });
  ```

- [ ] **[RED-8]** sLM 프로바이더에서 FreeformModelInput 렌더링 테스트

  ```typescript
  describe('ModelDialog - sLM provider', () => {
    it('renders FreeformModelInput for sLM (selectedProvider="slm")', () => {
      renderWithProviders(<ModelDialog onClose={onClose} selectedProvider="slm" />);
      // FreeformModelInput 컴포넌트 렌더링 확인
    });
  });
  ```

- [ ] **[RED-VERIFY-B]** 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli -- src/ui/components/FreeformModelInput.test  # FAIL
  npm test -w @didim365/agent-cli -- src/ui/components/ModelDialog.test  # 신규 FAIL
  ```

---

## 3.5 GREEN Phase (Part B): handleSelect + FreeformModelInput 구현

- [ ] **[TASK-003]** `FreeformModelInput.tsx` 생성
  - 파일: `packages/cli/src/ui/components/FreeformModelInput.tsx` (신규)
  - 내용: TextInput 기반 모델명 입력 컴포넌트
  - 참고:
    [03_architecture_design.md §3.9](../detail_plan/03_architecture_design.md)

- [ ] **[TASK-004]** `ModelDialog.tsx` handleSelect 영속화 동기화 구현
  - 변경: 비-Gemini → `process.env['LLM_MODEL'] = model`
  - 변경: sLM →
    `settings.setValue(SettingScope.User, 'security.auth.slmConfig', {..., model})`
  - 변경: 전체 → `saveModelForProvider(settings, provider, model)` 호출
  - 참고:
    [03_architecture_design.md §3.6.2](../detail_plan/03_architecture_design.md)

- [ ] **[TASK-005]** `ModelDialog.tsx` freeformInput 분기 구현
  - 변경: `modelGroup.freeformInput` → `<FreeformModelInput>` 렌더링

- [ ] **[GREEN-VERIFY-B]** 전체 테스트 통과
  ```bash
  npm test -w @didim365/agent-cli -- src/ui/components/FreeformModelInput.test  # PASS
  npm test -w @didim365/agent-cli -- src/ui/components/ModelDialog.test  # PASS
  ```

---

## 3.6 RED/GREEN Phase (Part C): DialogManager 연결

- [ ] **[RED-9]** DialogManager에서 selectedProvider 전달 테스트

  ```typescript
  describe('DialogManager - ModelDialog props', () => {
    it('passes selectedProvider to ModelDialog', () => {
      // uiState.isModelDialogOpen = true, uiState.selectedProvider = 'claude'
      // → ModelDialog에 selectedProvider="claude" 전달 확인
    });
  });
  ```

- [ ] **[TASK-006]** `DialogManager.tsx` 수정
  - 파일: `packages/cli/src/ui/components/DialogManager.tsx`
  - 변경: `<ModelDialog>` 에 `selectedProvider={uiState.selectedProvider}` prop
    추가
  - 참고:
    [03_architecture_design.md §3.8](../detail_plan/03_architecture_design.md)

- [ ] **[GREEN-VERIFY-C]** DialogManager 테스트 통과
  ```bash
  npm test -w @didim365/agent-cli -- src/ui/components/DialogManager.test  # PASS
  ```

---

## 3.7 REFACTOR Phase: 코드 개선

- [ ] **[REFACTOR-STRUCTURE]** 코드 구조 개선
  - `ModelDialog.tsx`: Gemini 전용 로직을 private 헬퍼로 추출 (프리뷰 필터링 등)
  - `FreeformModelInput.tsx`: validation 로직 (빈 문자열 방지 등)
  - 스냅샷 테스트 업데이트

- [ ] **[REFACTOR-VERIFY]** 리팩터링 후 테스트 재확인
  ```bash
  npm test -w @didim365/agent-cli -- src/ui/components/  # 전체 컴포넌트 테스트 PASS
  ```

---

## 3.8 사후 작업 (Post-Work)

- [ ] **[TEST]** 전체 테스트 실행

  ```bash
  npm test -w @didim365/agent-cli
  npm test -w @didim365/agent-cli-core  # Phase 1 회귀 확인
  ```

- [ ] **[LINT]** 린터 + 타입체크

  ```bash
  npm run lint -w @didim365/agent-cli
  npm run typecheck -w @didim365/agent-cli
  ```

- [ ] **[VERIFY]** 기능 검증 (스냅샷 + 수동)
  - 확인 항목 1: Gemini 모델 다이얼로그 기존과 동일 렌더링
  - 확인 항목 2: Claude 선택 → Claude 모델 목록 표시
  - 확인 항목 3: sLM 선택 → FreeformModelInput 표시
  - 확인 항목 4: DidimAIStudio → 비활성 안내 메시지
  - 확인 항목 5: handleSelect → LLM_MODEL + slmConfig + byProvider 동기화

- [ ] **[DOC]** 작업 결과서 작성
  - 파일: `../working_history/Phase3_model_dialog_refactor_{작업일자}.md`

- [ ] **[COMMIT]** 변경사항 커밋

  ```bash
  # 1차 커밋: FreeformModelInput 신규 (구조적 변경)
  git add packages/cli/src/ui/components/FreeformModelInput.tsx packages/cli/src/ui/components/FreeformModelInput.test.tsx
  git commit -m "feat(cli): add FreeformModelInput component for sLM model selection"

  # 2차 커밋: ModelDialog 리팩토링 + DialogManager 연결 (동작 변경)
  git add packages/cli/src/ui/components/ModelDialog.tsx packages/cli/src/ui/components/ModelDialog.test.tsx packages/cli/src/ui/components/DialogManager.tsx
  git commit -m "feat(cli): refactor ModelDialog for multi-provider model selection"
  ```

---

## Phase 완료 조건

| 검증 항목                                         | 상태 |
| ------------------------------------------------- | ---- |
| RED(A): 프로바이더별 분기 테스트 작성             | ⬜   |
| GREEN(A): ModelDialog 분기 구현 + 통과            | ⬜   |
| RED(B): handleSelect + FreeformModelInput 테스트  | ⬜   |
| GREEN(B): 영속화 동기화 + FreeformModelInput 구현 | ⬜   |
| RED/GREEN(C): DialogManager 연결                  | ⬜   |
| REFACTOR: 구조 개선 + 스냅샷 업데이트             | ⬜   |
| Lint + Typecheck 통과                             | ⬜   |
| Phase 1~2 회귀 없음                               | ⬜   |
| 작업 결과서 작성                                  | ⬜   |
| 커밋 완료                                         | ⬜   |

---

**작성일**: 2026-02-15 **상태**: ⬜ 작성 중
