# Phase 1: Core — 모델 레지스트리 + Provider Selector 정합성

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 테스트
> 먼저 작성 → 최소 코드 구현 → 리팩터링 **리팩터링 원칙**: "Make it work → Make
> it right → Make it fast" **참고 문서**:
>
> - [99_TDD_plan.md](../template/99_TDD_plan.md) — TDD 방법론
> - [03_architecture_design.md](../detail_plan/03_architecture_design.md) —
>   §3.1, §3.2, §3.4
> - [04_change_scope_and_steps.md](../detail_plan/04_change_scope_and_steps.md)
>   — Step 1
> - [06_review_log.md](../detail_plan/06_review_log.md) — 이슈 #2, #5, #6, #8

---

## 작업 개요

| 항목        | 내용                                                                                   |
| ----------- | -------------------------------------------------------------------------------------- |
| 프로젝트    | Multi-Provider `/model` Command — Core 레지스트리                                      |
| 영향 범위   | `packages/core/src/config/providerModels.ts` (신규), `providerSelector.ts`, `index.ts` |
| 위험 수준   | 🟡 Medium — Core 패키지 변경, 기존 `DEFAULT_PROVIDER_MODELS` 교체                      |
| 성능 민감도 | 🟢 Low — 정적 데이터 구조, 런타임 성능 영향 미미                                       |
| 참고 설계   | [03_architecture_design.md §3.1~§3.4](../detail_plan/03_architecture_design.md)        |
| 작업 브랜치 | `DID/v0.1` (기존 브랜치 계속 사용)                                                     |

---

## 핵심 리스크 요약

| 리스크                                                               | 영향      | 대응 방안                                   | 상태 |
| -------------------------------------------------------------------- | --------- | ------------------------------------------- | ---- |
| `DEFAULT_PROVIDER_MODELS` 교체 시 기존 provider selector 테스트 깨짐 | 🟠 Medium | 기존 테스트 먼저 확인 후 단계적 교체        | ⬜   |
| `isDefault` 표시 누락 시 잘못된 기본 모델 반환                       | 🟡 Medium | 모든 프로바이더에 `isDefault` 테스트 추가   | ⬜   |
| `isModelOwnedByOtherProvider` prefix 오탐                            | 🟡 Medium | 엣지 케이스(o1, o3-pro 등) 전용 테스트 추가 | ⬜   |

---

## 1.1 사전 작업 (Pre-Work)

> **목적**: 본작업의 실패를 줄이기 위한 작업 준비 과정 **원칙**: 설계 문서와
> 기존 코드를 정확히 이해한 뒤 시작

- [ ] **[CONTEXT]** 작업 목적 및 배경 확인
  - 설계 문서 검토:
    [03_architecture_design.md §3.1](../detail_plan/03_architecture_design.md)
  - 리뷰 이슈 확인: [06_review_log.md](../detail_plan/06_review_log.md) — 이슈
    #2, #5, #6, #8

- [ ] **[ANALYSIS-1]** 현재 `DEFAULT_PROVIDER_MODELS` 분석
  - 파일: `packages/core/src/providers/providerSelector.ts`
  - 확인: 현재 하드코딩 구조, ProviderType enum 값, 기존 테스트 현황
  - 확인: `resolveProviderModel()` 현재 로직과 테스트 커버리지

- [ ] **[ANALYSIS-2]** 현재 `isGeminiSpecificModel()` 로직 분석
  - 파일: `packages/core/src/providers/providerSelector.ts`
  - 확인: Gemini 모델 식별 로직, `auto-gemini*` 패턴 포함 여부

- [ ] **[ANALYSIS-3]** `ProviderType` enum 전수 확인
  - 파일: `packages/core/src/providers/providerTypes.ts`
  - 확인: Gemini, Claude, OpenAI, OpenAICompatible, Didim 등 전체 목록

- [ ] **[ANALYSIS-4]** 기존 테스트 실행 및 베이스라인 기록
  ```bash
  npm test -w @didim365/agent-cli-core -- src/providers/providerSelector.test
  ```

---

## 1.2 RED Phase: 실패 테스트 작성

> **목적**: 구현할 기능을 정의하는 실패 테스트 작성 **원칙**: 테스트가 실패하는
> 것을 확인한 후에만 구현 시작

### 1.2.1 providerModels.ts 테스트 (신규)

- [ ] **[RED-1]** `PROVIDER_MODEL_REGISTRY` 구조 테스트

  ```typescript
  // packages/core/src/config/providerModels.test.ts (신규)
  describe('PROVIDER_MODEL_REGISTRY', () => {
    it('contains all expected provider keys', () => {
      expect(Object.keys(PROVIDER_MODEL_REGISTRY)).toEqual(
        expect.arrayContaining([
          'gemini',
          'claude',
          'openai',
          'openai-compatible',
          'didim',
        ]),
      );
    });

    it('each provider has providerKey matching its registry key', () => {
      for (const [key, group] of Object.entries(PROVIDER_MODEL_REGISTRY)) {
        expect(group.providerKey).toBe(key);
      }
    });
  });
  ```

- [ ] **[RED-2]** `getDefaultModelFromRegistry()` 테스트

  ```typescript
  describe('getDefaultModelFromRegistry', () => {
    it('returns isDefault model for gemini (gemini-2.5-pro, not auto-gemini-3)', () => {
      expect(getDefaultModelFromRegistry('gemini')).toBe('gemini-2.5-pro');
    });

    it('returns isDefault model for claude', () => {
      expect(getDefaultModelFromRegistry('claude')).toBe('claude-opus-4-6');
    });

    it('returns isDefault model for openai', () => {
      expect(getDefaultModelFromRegistry('openai')).toBe('gpt-4.1');
    });

    it('returns "default" for openai-compatible (freeformInput)', () => {
      expect(getDefaultModelFromRegistry('openai-compatible')).toBe('default');
    });

    it('returns "didim-default" for didim (modelSelectionDisabled)', () => {
      expect(getDefaultModelFromRegistry('didim')).toBe('didim-default');
    });

    it('returns "default" for unknown provider', () => {
      expect(getDefaultModelFromRegistry('unknown-provider')).toBe('default');
    });
  });
  ```

- [ ] **[RED-3]** `isModelValidForProvider()` 테스트

  ```typescript
  describe('isModelValidForProvider', () => {
    // 레지스트리 모델 → 유효
    it('accepts registered model for its provider', () => {
      expect(isModelValidForProvider('claude-opus-4-6', 'claude')).toBe(true);
    });

    // 커스텀 모델 → 동일 prefix면 유효
    it('accepts custom model with matching prefix (gpt-4o-2024-08-06)', () => {
      expect(isModelValidForProvider('gpt-4o-2024-08-06', 'openai')).toBe(true);
    });

    // cross-provider prefix → 거부
    it('rejects claude model on openai provider', () => {
      expect(isModelValidForProvider('claude-opus-4-6', 'openai')).toBe(false);
    });

    it('rejects gpt model on claude provider', () => {
      expect(isModelValidForProvider('gpt-4.1', 'claude')).toBe(false);
    });

    // freeformInput → 모든 모델 허용
    it('accepts any model for openai-compatible (freeformInput)', () => {
      expect(
        isModelValidForProvider('my-custom-model', 'openai-compatible'),
      ).toBe(true);
    });

    // modelSelectionDisabled → 스킵
    it('accepts any model for didim (modelSelectionDisabled)', () => {
      expect(isModelValidForProvider('any-model', 'didim')).toBe(true);
    });

    // 알 수 없는 prefix → 허용 (allowCustomModels)
    it('accepts unknown-prefix model (my-custom-llm) on openai', () => {
      expect(isModelValidForProvider('my-custom-llm', 'openai')).toBe(true);
    });

    // o3, o4-mini → openai 소속 확인
    it('rejects o3 on claude provider', () => {
      expect(isModelValidForProvider('o3', 'claude')).toBe(false);
    });

    it('accepts o3 on openai provider', () => {
      expect(isModelValidForProvider('o3', 'openai')).toBe(true);
    });
  });
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/config/providerModels.test  # 반드시 FAIL
  ```

---

## 1.3 GREEN Phase: 최소 코드 구현

> **목적**: 테스트를 통과하는 최소한의 코드 구현 **원칙**: "Make it work" —
> 동작하게 만드는 것이 최우선

- [ ] **[TASK-001]** `providerModels.ts` 생성
  - 파일: `packages/core/src/config/providerModels.ts` (신규)
  - 내용:
    - `ProviderModelInfo` 인터페이스
    - `ProviderModelGroup` 인터페이스
    - `PROVIDER_MODEL_REGISTRY` 상수 (gemini, claude, openai, openai-compatible,
      didim)
    - `getDefaultModelFromRegistry()` 함수
    - `isModelValidForProvider()` 함수
    - `isModelOwnedByOtherProvider()` private 함수
  - 참고:
    [03_architecture_design.md §3.1](../detail_plan/03_architecture_design.md)

- [ ] **[TASK-002]** `index.ts` export 추가
  - 파일: `packages/core/src/index.ts`
  - 작업: `providerModels.ts`의 public export 추가
    ```typescript
    export {
      PROVIDER_MODEL_REGISTRY,
      getDefaultModelFromRegistry,
      isModelValidForProvider,
      type ProviderModelInfo,
      type ProviderModelGroup,
    } from './config/providerModels.js';
    ```

- [ ] **[GREEN-VERIFY]** 테스트 통과 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/config/providerModels.test  # 반드시 PASS
  ```

---

## 1.4 RED Phase (2차): providerSelector 변경 테스트

> **목적**: `DEFAULT_PROVIDER_MODELS` 교체 및 `resolveProviderModel`
> cross-provider 검증 테스트

- [ ] **[RED-4]** `DEFAULT_PROVIDER_MODELS` 레지스트리 파생 테스트

  ```typescript
  // providerSelector.test.ts (기존 파일에 추가)
  describe('DEFAULT_PROVIDER_MODELS from registry', () => {
    it('claude default matches registry', () => {
      expect(DEFAULT_PROVIDER_MODELS[ProviderType.Claude]).toBe(
        'claude-opus-4-6',
      );
    });

    it('openai default matches registry', () => {
      expect(DEFAULT_PROVIDER_MODELS[ProviderType.OpenAI]).toBe('gpt-4.1');
    });
  });
  ```

- [ ] **[RED-5]** `resolveProviderModel()` cross-provider 검증 테스트

  ```typescript
  describe('resolveProviderModel - cross-provider validation', () => {
    it('rejects claude model on openai and returns default', () => {
      const result = resolveProviderModel(
        'claude-opus-4-6',
        ProviderType.OpenAI,
      );
      expect(result).toBe('gpt-4.1'); // openai default
    });

    it('accepts custom model gpt-4o-2024-08-06 on openai', () => {
      const result = resolveProviderModel(
        'gpt-4o-2024-08-06',
        ProviderType.OpenAI,
      );
      expect(result).toBe('gpt-4o-2024-08-06');
    });

    it('accepts unknown-prefix model on openai (allowCustomModels)', () => {
      const result = resolveProviderModel(
        'my-custom-model',
        ProviderType.OpenAI,
      );
      expect(result).toBe('my-custom-model');
    });
  });
  ```

- [ ] **[RED-VERIFY-2]** 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/providers/providerSelector.test  # 신규 테스트 FAIL
  ```

---

## 1.5 GREEN Phase (2차): providerSelector 수정

- [ ] **[TASK-003]** `DEFAULT_PROVIDER_MODELS` 레지스트리 파생으로 교체
  - 파일: `packages/core/src/providers/providerSelector.ts`
  - 변경: 기존 하드코딩 `DEFAULT_PROVIDER_MODELS` 제거 →
    `getDefaultModelFromRegistry()` 기반 파생
  - 참고:
    [03_architecture_design.md §3.2](../detail_plan/03_architecture_design.md)

- [ ] **[TASK-004]** `resolveProviderModel()` cross-provider 검증 추가
  - 파일: `packages/core/src/providers/providerSelector.ts`
  - 변경: 비-Gemini 모델에 `isModelValidForProvider()` 검증 삽입
  - 참고:
    [03_architecture_design.md §3.4](../detail_plan/03_architecture_design.md)

- [ ] **[GREEN-VERIFY-2]** 전체 providerSelector 테스트 통과 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/providers/providerSelector.test  # 전체 PASS
  ```

---

## 1.6 REFACTOR Phase: 코드 개선

> **목적**: 동작을 유지하면서 코드 구조 개선 **원칙**: "Make it right" —
> 테스트가 통과하는 상태에서만 리팩터링

- [ ] **[REFACTOR-STRUCTURE]** 코드 구조 개선
  - `providerModels.ts`: JSDoc 주석 정리, export 순서 정리
  - `providerSelector.ts`: 미사용 import 제거, `DEFAULT_PROVIDER_MODELS` 관련
    주석 갱신
  - 중복 제거: `isGeminiSpecificModel()`과 `isModelOwnedByOtherProvider()`
    gemini prefix 로직 중복 확인

- [ ] **[REFACTOR-VERIFY]** 리팩터링 후 테스트 재확인
  ```bash
  npm test -w @didim365/agent-cli-core  # 전체 core 테스트 PASS
  ```

---

## 1.7 사후 작업 (Post-Work)

> **목적**: 수정된 코드 검증 및 작업 결과 문서화

- [ ] **[TEST]** 전체 테스트 실행

  ```bash
  npm test -w @didim365/agent-cli-core
  ```

- [ ] **[BUILD]** Core 빌드 확인

  ```bash
  npm run build -w @didim365/agent-cli-core
  ```

- [ ] **[LINT]** 린터 + 타입체크

  ```bash
  npm run lint -w @didim365/agent-cli-core
  npm run typecheck -w @didim365/agent-cli-core
  ```

- [ ] **[VERIFY]** 기능 검증
  - 확인 항목 1: `getDefaultModelFromRegistry('gemini')` → `'gemini-2.5-pro'`
    (not `auto-gemini-3`) — 이슈 #8
  - 확인 항목 2: `isModelValidForProvider('claude-opus-4-6', 'openai')` →
    `false` — 이슈 #2
  - 확인 항목 3: `isModelValidForProvider('gpt-4o-2024-08-06', 'openai')` →
    `true` — 이슈 #6
  - 확인 항목 4: `DEFAULT_PROVIDER_MODELS[ProviderType.Didim]` →
    `'didim-default'` — 이슈 #4

- [ ] **[DOC]** 작업 결과서 작성
  - 파일: `../working_history/Phase1_core_model_registry_{작업일자}.md`

- [ ] **[COMMIT]** 변경사항 커밋 (Tidy First: 구조 → 동작 분리)

  ```bash
  # 1차 커밋: 신규 파일 (구조적 변경)
  git add packages/core/src/config/providerModels.ts packages/core/src/config/providerModels.test.ts packages/core/src/index.ts
  git commit -m "feat(core): add PROVIDER_MODEL_REGISTRY + SSOT helpers (providerModels.ts)"

  # 2차 커밋: 기존 파일 수정 (동작 변경)
  git add packages/core/src/providers/providerSelector.ts packages/core/src/providers/providerSelector.test.ts
  git commit -m "feat(core): derive DEFAULT_PROVIDER_MODELS from registry + cross-provider validation"
  ```

---

## Phase 완료 조건

| 검증 항목                                       | 상태 |
| ----------------------------------------------- | ---- |
| RED: providerModels 테스트 작성                 | ⬜   |
| GREEN: providerModels 구현 + 테스트 통과        | ⬜   |
| RED(2차): providerSelector 변경 테스트          | ⬜   |
| GREEN(2차): providerSelector 수정 + 테스트 통과 | ⬜   |
| REFACTOR: 구조 개선                             | ⬜   |
| Core 빌드 성공                                  | ⬜   |
| Lint + Typecheck 통과                           | ⬜   |
| 기존 providerSelector 테스트 회귀 없음          | ⬜   |
| 작업 결과서 작성                                | ⬜   |
| 커밋 완료                                       | ⬜   |

---

**작성일**: 2026-02-15 **상태**: ⬜ 작성 중
