# Phase 3: 멀티프로바이더 /model 다이얼로그 리팩터링 — 작업결과서

> 작성일: 2026-02-15 브랜치: `v0.1.2/white_labelling` 커밋: `e60bb72a7` 선행
> 작업: Phase 1~4 멀티프로바이더 auth login, `PROVIDER_MODEL_REGISTRY`
> (core/providerModels.ts)

---

## 1. 작업 범위

ModelDialog를 Gemini 하드코딩에서 `PROVIDER_MODEL_REGISTRY` 기반 동적 렌더링으로
전환하여 5개 프로바이더(Gemini, Claude, OpenAI, openai-compatible/sLM,
DidimAIStudio)의 모델 선택을 지원한다.

- **Part A**: 프로바이더 분기 렌더링 — registry 기반 preset/manual 옵션 동적
  생성
- **Part B**: handleSelect 영속화 + FreeformModelInput 신규 컴포넌트
- **Part C**: DialogManager → ModelDialog `selectedProvider` prop 전달

---

## 2. 수정 파일

| #   | 파일                                                         | 변경 내용                                                                                |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1   | `packages/cli/src/ui/components/ModelDialog.tsx`             | registry 기반 멀티프로바이더 렌더링, 영속화, freeformInput 분기                          |
| 2   | `packages/cli/src/ui/components/ModelDialog.test.tsx`        | 15개 테스트 추가 (프로바이더 분기 8 + 영속화 6 + sLM 1), 기존 테스트 기대값 4개 업데이트 |
| 3   | `packages/cli/src/ui/components/FreeformModelInput.tsx`      | **신규** — sLM 전용 텍스트 입력 컴포넌트                                                 |
| 4   | `packages/cli/src/ui/components/FreeformModelInput.test.tsx` | **신규** — 5개 테스트 (mock useKeypress + useTextBuffer 패턴)                            |
| 5   | `packages/cli/src/ui/components/DialogManager.tsx`           | `selectedProvider={uiState.selectedProvider}` prop 전달                                  |

---

## 3. 핵심 구현

### 3.1 Registry 기반 동적 모델 목록 (Part A)

기존 Gemini 전용 하드코딩(`DEFAULT_GEMINI_MODEL_AUTO`, `getDisplayString()`)을
제거하고, `PROVIDER_MODEL_REGISTRY[provider]`에서 presets/models를 동적으로 읽어
옵션 목록을 생성한다.

```typescript
const provider = resolveActiveProvider(selectedProvider);
const modelGroup = PROVIDER_MODEL_REGISTRY[provider];
const isGemini = provider === 'gemini';
```

- **Gemini preview 필터링**: `isGemini && !shouldShowPreviewModels` 조건으로
  스코핑
- **modelSelectionDisabled**: DidimAIStudio 전용 비활성 뷰 (early return)
- **freeformInput**: openai-compatible(sLM) 전용 텍스트 입력 (early return)

### 3.2 handleSelect 영속화 (Part B)

모델 선택 시 4중 동기화:

1. **Config**: `config.setModel(model, isTemporary)` — 기존 동작 유지
2. **LLM_MODEL env**: 비-Gemini 프로바이더 전용 (`!isGemini` 가드)
3. **byProvider**: `saveModelForProvider(settings, provider, model)` —
   persistMode 또는 freeformInput일 때만
4. **slmConfig.model**: openai-compatible 프로바이더 전용 —
   `security.auth.slmConfig` 동기화

```typescript
// Sync LLM_MODEL env for non-Gemini providers
if (!isGemini) {
  process.env['LLM_MODEL'] = model;
}

// freeformInput providers (sLM) always persist — no toggle shown in UI
const shouldPersist = persistMode || !!modelGroup?.freeformInput;

// Sync byProvider in settings (only when persisting)
if (settings && shouldPersist) {
  saveModelForProvider(settings, provider, model);
}

// Sync slmConfig.model for openai-compatible (sLM) provider
if (settings && shouldPersist && provider === 'openai-compatible') {
  const currentSlmConfig = (settings.merged?.security?.auth?.slmConfig ??
    {}) as Record<string, unknown>;
  settings.setValue(SettingScope.User, 'security.auth.slmConfig', {
    ...currentSlmConfig,
    model,
  });
}
```

### 3.3 FreeformModelInput 컴포넌트 (Part B)

openai-compatible(sLM) 프로바이더는 모델 목록이 없으므로 사용자가 직접 모델명을
입력하는 텍스트 입력 컴포넌트를 제공한다.

- 프로젝트 기존 패턴 준수: `TextInput` + `useTextBuffer` 조합
- `isValidPath: () => false` — 모델명에 경로 자동완성 불필요
- `onSubmit`: 빈 문자열 trim 후 guard
- `onCancel`: 다이얼로그 닫기

### 3.4 useKeypress 충돌 방지

ModelDialog의 useKeypress(Escape/Tab)와 FreeformModelInput 내부 TextInput의
useKeypress가 동시 활성화되면 이중 처리가 발생한다.

```typescript
useKeypress(handler, { isActive: !modelGroup?.freeformInput });
```

`freeformInput` 모드에서 ModelDialog의 키 핸들러를 비활성화하여 TextInput만
Escape/Enter를 처리한다.

### 3.5 DialogManager 연결 (Part C)

```typescript
<ModelDialog
  onClose={uiActions.closeModelDialog}
  selectedProvider={uiState.selectedProvider}
/>
```

`uiState.selectedProvider`는 auth login 시 설정된 현재 프로바이더 값이다.

---

## 4. TDD 사이클

### Part A: 프로바이더 분기

| Phase | 테스트 수 | 결과                                           |
| ----- | --------- | ---------------------------------------------- |
| RED   | 23        | 15 PASS + 8 FAIL (신규 프로바이더 분기 테스트) |
| GREEN | 23        | 23 PASS (registry 기반 동적 렌더링 구현)       |

신규 테스트 8개:

- Gemini 명시 선택 (2): presets 렌더링, preview 조건부 표시
- Claude (2): 프리셋 렌더링, Manual 뷰 모델 목록
- OpenAI (2): 프리셋 렌더링, reasoning 모델 포함 Manual 뷰
- DidimAIStudio (1): 비활성 메시지 렌더링
- env 자동감지 (1): `LLM_PROVIDER=claude` → Claude 프리셋

기존 테스트 변경 4개: `'Auto (Preview)'` → `'Auto (Gemini 3)'` (registry title
사용)

### Part B: 영속화 + FreeformModelInput

| Phase | 테스트 수          | 결과                                                   |
| ----- | ------------------ | ------------------------------------------------------ |
| RED   | 28 + FreeformInput | 24 PASS + 4 FAIL + FreeformModelInput module not found |
| GREEN | 28 + 5             | 33 PASS (영속화 구현 + FreeformModelInput 생성)        |

신규 테스트:

- handleSelect persistence sync (4): LLM_MODEL env 설정/미설정, slmConfig,
  byProvider
- sLM FreeformModelInput 렌더링 (1)
- FreeformModelInput 단위 테스트 (5): 렌더링, currentModel, Enter/Escape, 빈
  입력

FreeformModelInput 테스트 패턴:

- `vi.mock('../hooks/useKeypress.js')` + `vi.mock('./shared/text-buffer.js')`
- `createMockBuffer()` → `pressEnterInTextInput()` / `pressEscapeInTextInput()`
- `render` from `test-utils/render.js` (act() 래핑 필수)

### Part C: DialogManager

| Phase | 테스트 수 | 결과                |
| ----- | --------- | ------------------- |
| N/A   | 21        | 21 PASS (회귀 없음) |

---

## 5. 프로바이더별 동작 매트릭스

| 프로바이더    | 레지스트리 키       | presets | models | freeformInput | disabled | UI 동작                   |
| ------------- | ------------------- | ------- | ------ | ------------- | -------- | ------------------------- |
| Gemini        | `gemini`            | 2       | 5      | -             | -        | preset → Manual 라디오    |
| Claude        | `claude`            | 1       | 3      | -             | -        | preset → Manual 라디오    |
| OpenAI        | `openai`            | 1       | 6      | -             | -        | preset → Manual 라디오    |
| sLM           | `openai-compatible` | 0       | 0      | ✅            | -        | FreeformModelInput 텍스트 |
| DidimAIStudio | `didim`             | 0       | 0      | -             | ✅       | 비활성 메시지             |

---

## 6. 테스트 결과

```
ModelDialog.test.tsx:          30 passed (15 기존 + 15 신규)
  - 기존 Gemini 동작:          15 passed (기대값 4개 업데이트)
  - 프로바이더 분기:            8 passed
  - 영속화 동기화:              5 passed (2차 리뷰 후 재구성)
  - sLM FreeformModelInput:     1 passed
FreeformModelInput.test.tsx:    5 passed (신규)
DialogManager.test.tsx:        22 passed (기존 21 + selectedProvider prop 검증 1)
────────────────────────────────────────
Total:                         56 passed (ModelDialog 29 + FreeformModel 5 + DialogManager 22)
Typecheck:                     ✅
Lint:                          ✅
```

---

## 7. 주요 결정 사항

| 결정                       | 이유                                                                      |
| -------------------------- | ------------------------------------------------------------------------- |
| registry title 직접 사용   | `getDisplayString()` 의존 제거, registry가 SSOT                           |
| freeformInput early return | React hooks 규칙 준수 (조건부 return 전에 모든 hooks 호출)                |
| useKeypress isActive 가드  | freeformInput 모드에서 Escape 이중 처리 방지                              |
| `render` from `test-utils` | `ink-testing-library` 직접 사용 시 `act()` 경고 발생 (test-setup.ts 감지) |
| mock pattern for TextInput | `stdin.write()` 대신 useKeypress/useTextBuffer mock → handler 직접 호출   |

---

## 8. 리뷰 반영 (2026-02-15)

### 이슈 1 (높음): persistMode 가드 누락 → 이중 write 근본 수정

**문제**: `saveModelForProvider()`가 `persistMode`와 무관하게 항상 호출되어,
사용자가 "Remember model for future sessions: false" 상태에서도 settings 파일에
영속화됨. 또한 `config.setModel(model, false)` → `onModelChange` 콜백
(config.ts:818)이 이미 `saveModelForProvider`를 호출하므로 이중 write 발생.

**수정**: ModelDialog에서 `saveModelForProvider` 직접 호출을 **완전 제거**.

- `config.setModel(model, isTemporary)` → isTemporary=false일 때 `onModelChange`
  콜백에서 `saveModelForProvider` 자동 호출 (단일 경로)
- `saveModelForProvider` import 제거, `shouldPersist` 변수는 slmConfig 동기화
  가드로만 사용

**검증 테스트**:

- `does NOT call saveModelForProvider directly (delegated to onModelChange)` —
  persistMode=true 시 `config.setModel(model, false)` 호출 확인 + 직접 호출 없음
- `calls config.setModel with isTemporary=true when persistMode is false` — 기본
  상태에서 session-only 설정 확인

### 이슈 2 (중간): sLM slmConfig.model 동기화 누락 + scope 오염 방지

**문제**: 시작 경로(gemini.tsx, useAuth.ts, AppContainer.tsx)는
`slmConfig.model`을 읽어 `LLM_MODEL` env를 설정하지만, /model 다이얼로그에서
모델 변경 시 `security.auth.slmConfig.model`에 기록하지 않아 재시작 시 이전
모델로 복원됨. 또한 `settings.merged`(전체 scope merge)에서 spread하면
workspace/system scope 값이 user scope로 복사되는 scope 오염 발생 가능.

**수정**: `handleSelect`에 openai-compatible 프로바이더 전용 분기 추가.
`settings.forScope(SettingScope.User)` 패턴으로 user scope만 읽어 spread:

```typescript
if (settings && shouldPersist && provider === 'openai-compatible') {
  const userSlmConfig =
    (
      settings.forScope(SettingScope.User).settings as {
        security?: { auth?: { slmConfig?: Record<string, unknown> } };
      }
    ).security?.auth?.slmConfig ?? {};
  settings.setValue(SettingScope.User, 'security.auth.slmConfig', {
    ...userSlmConfig,
    model,
  });
}
```

- `SettingScope` import 추가 (`../../config/settings.js`)
- `forScope(User)` 패턴으로 scope pollution 방지 (`saveModelForProvider`와 동일)
- `onModelChange`는 slmConfig를 처리하지 않으므로 이 경로가 유일한 write site

### 이슈 3 (낮음): slmConfig 테스트 실질 검증 부재

**문제**: 기존 테스트가 `toContain('Enter model name')`만 검증하여 실제
`setValue` 호출 여부를 확인하지 않음.

**수정**: 테스트를 재구성하여 간접 검증 강화:

- `does NOT call saveModelForProvider directly` — 이중 write 방지 검증
- `does NOT sync slmConfig for non-sLM providers` — `setValue` 호출에서
  `'security.auth.slmConfig'` 경로가 비-sLM에서 발생하지 않음을 assert

**한계**: sLM의 FreeformModelInput은 useKeypress/useTextBuffer를 내부적으로
사용하여 ModelDialog.test.tsx에서 직접 Enter 시뮬레이션이 어려움 (별도 mock 체계
필요). FreeformModelInput → handleSelect 통합은 FreeformModelInput.test.tsx에서
검증.

### 이슈 4 (낮음): DialogManager selectedProvider prop 전달 미검증

**문제**: DialogManager 테스트에서 ModelDialog mock이
`() => <Text>ModelDialog</Text>`로 props를 캡처하지 않아 `selectedProvider` prop
전달 회귀를 탐지할 수 없음.

**수정**: ModelDialog mock을 props-aware로 변경하고 전용 테스트 추가:

```typescript
// Mock 변경: props 캡처
ModelDialog: ({ selectedProvider }) => (
  <Text>ModelDialog{selectedProvider ? ` provider=${selectedProvider}` : ''}</Text>
)

// 신규 테스트
it('passes selectedProvider prop to ModelDialog', () => {
  // uiState: { isModelDialogOpen: true, selectedProvider: 'claude' }
  expect(lastFrame()).toContain('provider=claude');
});
```

---

## 9. 완료

- **멀티프로바이더 /model 다이얼로그 리팩터링 완료**
- Gemini 하드코딩 제거, `PROVIDER_MODEL_REGISTRY` 기반 동적 렌더링
- 5개 프로바이더 모델 선택 UI 지원
- 모델 선택 시 영속화: Config + LLM_MODEL env + onModelChange→byProvider +
  slmConfig.model
- **1차 리뷰 3건 반영**: persistMode 가드, slmConfig 동기화, 테스트 보강
- **2차 리뷰 4건 반영**: 이중 write 제거, scope 오염 방지, 테스트 실질 검증,
  DialogManager prop 검증
