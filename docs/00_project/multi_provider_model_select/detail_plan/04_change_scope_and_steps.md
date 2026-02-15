# 04. 변경 범위 및 구현 순서

## 4. 수정 파일 요약

| #   | 파일                                                    | 변경 내용                                                                                           | 분류 |
| --- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---- |
| 1   | `packages/core/src/config/providerModels.ts`            | **신규** — 프로바이더별 모델 레지스트리 + SSOT 헬퍼 함수 + prefix 기반 검증                         | Core |
| 2   | `packages/core/src/providers/providerSelector.ts`       | `DEFAULT_PROVIDER_MODELS`를 레지스트리에서 파생 + `resolveProviderModel()` cross-provider 검증 추가 | Core |
| 3   | `packages/core/src/index.ts`                            | `providerModels.ts` export 추가                                                                     | Core |
| 4   | `packages/cli/src/ui/utils/resolveActiveProvider.ts`    | **신규** — 다중 소스 프로바이더 감지 + 키 정규화                                                    | CLI  |
| 5   | `packages/cli/src/ui/components/ModelDialog.tsx`        | 프로바이더 감지 + 분기 렌더링 + 영속화 동기화                                                       | CLI  |
| 6   | `packages/cli/src/ui/components/FreeformModelInput.tsx` | **신규** — sLM 텍스트 입력 모델 선택                                                                | CLI  |
| 7   | `packages/cli/src/ui/components/DialogManager.tsx`      | ModelDialog에 `selectedProvider` prop 전달                                                          | CLI  |
| 8   | `packages/cli/src/config/settingsSchema.ts`             | `model.byProvider` 스키마 정의 추가                                                                 | CLI  |
| 9   | `packages/cli/src/config/settings.ts`                   | `saveModelForProvider()` 헬퍼 함수 추가                                                             | CLI  |
| 10  | `packages/cli/src/config/config.ts`                     | startup model resolution에 `byProvider[activeProvider]` 우선 규칙 추가                              | CLI  |

---

## 5. 구현 순서

### Step 1: Core — 모델 레지스트리 (Tidy First)

1. `providerModels.ts` 생성 (인터페이스 + 레지스트리 + 헬퍼 함수 + prefix 검증)
2. `index.ts`에서 export
3. `providerSelector.ts`의 `DEFAULT_PROVIDER_MODELS`를 레지스트리 파생으로 변경
4. `resolveProviderModel()`에 cross-provider 검증 추가
5. Core 빌드 + 기존 테스트 통과 확인

### Step 2: CLI — 프로바이더 감지 유틸

1. `resolveActiveProvider.ts` 생성
2. `normalizeProviderKey()` 포함 (slm → openai-compatible, vertex-ai → gemini,
   didim-studio → didim)
3. API 키 감지에 `DIDIM_API_KEY` 포함
4. 테스트 작성

### Step 3: CLI — 설정 스키마 확장 + startup 반영

1. `settingsSchema.ts`에 `model.byProvider` 스키마 정의 추가
2. `settings.ts`에 `saveModelForProvider()` 헬퍼 함수 추가 (user scope 원본에서
   읽기)
3. `config.ts` startup model resolution에 `byProvider[activeProvider]` 우선 규칙
   추가
4. 기존 `saveModelChange()` 호환 유지

### Step 4: CLI — ModelDialog 리팩토링

1. `ModelDialog.tsx`에 `selectedProvider` prop 추가
2. `resolveActiveProvider()` + `PROVIDER_MODEL_REGISTRY` 임포트
3. 프로바이더별 `mainOptions`/`manualOptions` 분기
4. `modelSelectionDisabled` 처리 (DidimAIStudio)
5. Gemini 프리뷰 필터링 로직 유지
6. `handleSelect`에서 `LLM_MODEL` + `slmConfig.model` + `model.byProvider`
   동기화

### Step 5: CLI — FreeformModelInput

1. sLM용 텍스트 입력 컴포넌트 생성
2. ModelDialog에서 `freeformInput` 분기

### Step 6: CLI — 연결

1. `DialogManager.tsx`에서 `selectedProvider` prop 전달
2. 테스트 작성 + 스냅샷 업데이트

### Step 7: Quality Gates

1. typecheck + lint
2. 기존 ModelDialog 테스트 회귀
3. 신규 프로바이더별 테스트
4. `resolveProviderModel()` 테스트 (cross-provider + 커스텀 모델 시나리오)

---
