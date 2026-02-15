# 03. 설계 상세

## 3. 설계

### 3.1 프로바이더별 모델 레지스트리 (Core)

**파일**: `packages/core/src/config/providerModels.ts` (신규)

프로바이더별 모델 목록과 메타데이터를 정의한다. **기존
`DEFAULT_PROVIDER_MODELS`와 이중 관리를 방지하기 위해**, 이 레지스트리에서 기본
모델 정보를 함께 관리하고, `DEFAULT_PROVIDER_MODELS`는 이 레지스트리에서
파생한다.

```typescript
export interface ProviderModelInfo {
  /** API에 전달하는 모델 ID */
  id: string;
  /** UI에 표시할 이름 (생략 시 id 사용) */
  displayName?: string;
  /** 설명 텍스트 */
  description?: string;
  /** 이 모델이 프로바이더의 기본 권장 모델인지 */
  isDefault?: boolean;
  /** 모델 카테고리 (auto, reasoning, general, lite 등) */
  category?: 'auto' | 'recommended' | 'reasoning' | 'general' | 'lite';
}

export interface ProviderModelGroup {
  /** 프로바이더 키 (ProviderType 값과 매칭) */
  providerKey: string;
  /** 첫번째 화면에서 보여줄 프리셋 옵션 */
  presets: Array<{
    value: string;
    title: string;
    description: string;
  }>;
  /** 두번째 화면(Manual)에서 보여줄 개별 모델 목록 */
  models: ProviderModelInfo[];
  /** 텍스트 입력 모드 여부 (sLM용) */
  freeformInput?: boolean;
  /** 모델 선택 비활성 (DidimAIStudio 등) */
  modelSelectionDisabled?: boolean;
  /** 비활성 시 안내 메시지 */
  disabledMessage?: string;
  /** 레지스트리 외 커스텀 모델 허용 여부 (기본 true) */
  allowCustomModels?: boolean;
}

/** 프로바이더별 모델 그룹 */
export const PROVIDER_MODEL_REGISTRY: Record<string, ProviderModelGroup> = {
  gemini: {
    providerKey: 'gemini',
    presets: [
      {
        value: 'auto-gemini-3',
        title: 'Auto (Gemini 3)',
        description: 'Let Didim CLI decide the best model: gemini-3-pro, gemini-3-flash',
      },
      {
        value: 'auto-gemini-2.5',
        title: 'Auto (Gemini 2.5)',
        description: 'Let Didim CLI decide the best model: gemini-2.5-pro, gemini-2.5-flash',
      },
    ],
    models: [
      { id: 'gemini-3-pro-preview', category: 'general' },
      { id: 'gemini-3-flash-preview', category: 'lite' },
      { id: 'gemini-2.5-pro', category: 'general', isDefault: true },
      { id: 'gemini-2.5-flash', category: 'lite' },
      { id: 'gemini-2.5-flash-lite', category: 'lite' },
    ],
    allowCustomModels: true,
  },

  claude: {
    providerKey: 'claude',
    presets: [
      {
        value: 'claude-opus-4-6',
        title: 'Recommended (claude-opus-4-6)',
        description: 'Most intelligent model for building agents and coding',
      },
    ],
    models: [
      { id: 'claude-opus-4-6', description: 'Most intelligent, agents & coding', isDefault: true },
      { id: 'claude-sonnet-4-5-20250929', description: 'Best speed & intelligence balance' },
      { id: 'claude-haiku-4-5-20251001', description: 'Fastest, near-frontier intelligence' },
    ],
    allowCustomModels: true,
  },

  openai: {
    providerKey: 'openai',
    presets: [
      {
        value: 'gpt-4.1',
        title: 'Recommended (gpt-4.1)',
        description: 'Smartest non-reasoning model for complex tasks',
      },
    ],
    models: [
      { id: 'gpt-4.1', description: 'Smartest non-reasoning model', isDefault: true },
      { id: 'gpt-4.1-mini', description: 'Fast, balanced performance' },
      { id: 'gpt-4.1-nano', description: 'Fastest, most cost-efficient' },
      { id: 'gpt-4o', description: 'High-intelligence flagship', category: 'general' },
      { id: 'o3', description: 'Most powerful reasoning model', category: 'reasoning' },
      { id: 'o4-mini', description: 'Fast, cost-efficient reasoning', category: 'reasoning' },
    ],
    allowCustomModels: true,
  },

  'openai-compatible': {
    providerKey: 'openai-compatible',
    presets: [],
    models: [],
    freeformInput: true,
  },

  didim: {
    providerKey: 'didim',
    presets: [],
    models: [],
    modelSelectionDisabled: true,
    disabledMessage: 'DidimAIStudio는 시나리오 기반으로 동작하므로 개별 모델 선택을 지원하지 않습니다.',
  },
};

/**
 * 레지스트리에서 프로바이더의 기본 모델을 추출한다.
 * DEFAULT_PROVIDER_MODELS 대체용 — SSOT (Single Source of Truth).
 *
 * Gemini의 경우 previewFeatures 여부에 따라 기본값이 달라지므로,
 * 이 함수는 isDefault가 표시된 모델을 우선 반환한다.
 * presets[0]은 UI 첫 화면의 첫 항목일 뿐 기본 모델과는 다르다.
 */
export function getDefaultModelFromRegistry(providerKey: string): string {
  const group = PROVIDER_MODEL_REGISTRY[providerKey];
  if (!group) return 'default';

  // freeformInput 또는 modelSelectionDisabled면 고정 기본값
  if (group.freeformInput) return 'default';
  if (group.modelSelectionDisabled) return `${providerKey}-default`;

  // isDefault 표시된 모델 우선
  const defaultModel = group.models.find(m => m.isDefault);
  if (defaultModel) return defaultModel.id;

  // fallback: presets[0] → models[0]
  if (group.presets.length > 0) return group.presets[0].value;
  return group.models[0]?.id ?? 'default';
}

/**
 * 모델이 특정 프로바이더에 유효한지 검증한다.
 * cross-provider model passthrough 방지용.
 *
 * 검증 전략:
 * - freeformInput 프로바이더 → 모든 모델 허용
 * - modelSelectionDisabled → 검증 스킵
 * - allowCustomModels=true (기본값) → 동일 프로바이더 prefix 또는 레지스트리 목록에 있으면 유효
 * - 다른 프로바이더에 명확히 속하는 모델만 거부 (e.g., claude-* → openai에서 거부)
 */
export function isModelValidForProvider(model: string, providerKey: string): boolean {
  const group = PROVIDER_MODEL_REGISTRY[providerKey];
  if (!group) return true; // 알 수 없는 프로바이더면 통과

  // freeformInput이면 모든 모델 허용
  if (group.freeformInput) return true;

  // modelSelectionDisabled면 모델 검증 스킵
  if (group.modelSelectionDisabled) return true;

  // 레지스트리 목록(preset + models)에 있으면 유효
  const presetValues = group.presets.map(p => p.value);
  const modelIds = group.models.map(m => m.id);
  if (presetValues.includes(model) || modelIds.includes(model)) return true;

  // allowCustomModels (기본 true): 다른 프로바이더 소속이 아니면 통과
  const allowCustom = group.allowCustomModels !== false;
  if (allowCustom) {
    return !isModelOwnedByOtherProvider(model, providerKey);
  }

  return false;
}

/**
 * 모델이 다른 프로바이더에 명확히 소속되는지 판단한다.
 * prefix 기반 휴리스틱: claude-* → claude, gpt-*/o3/o4-* → openai, gemini-* → gemini
 */
function isModelOwnedByOtherProvider(model: string, currentProvider: string): boolean {
  const providerPrefixes: Record<string, Array<(m: string) => boolean>> = {
    claude: [(m) => m.startsWith('claude-')],
    openai: [(m) => m.startsWith('gpt-'), (m) => /^o[0-9]/.test(m)],
    gemini: [(m) => m.startsWith('gemini-'), (m) => m.startsWith('auto-gemini')],
  };

  for (const [provider, checks] of Object.entries(providerPrefixes)) {
    if (provider === currentProvider) continue;
    if (checks.some(check => check(model))) return true;
  }
  return false;
}
```

### 3.2 DEFAULT_PROVIDER_MODELS 일원화 (Core)

**파일**: `packages/core/src/providers/providerSelector.ts`

기존 `DEFAULT_PROVIDER_MODELS`를 레지스트리에서 파생하여 **이중 관리를 제거**:

```typescript
import { getDefaultModelFromRegistry } from '../config/providerModels.js';

// 기존 하드코딩 제거, 레지스트리에서 파생
const DEFAULT_PROVIDER_MODELS: Record<ProviderType, string> = {
  [ProviderType.Gemini]: getDefaultModelFromRegistry('gemini'),
  [ProviderType.Claude]: getDefaultModelFromRegistry('claude'),
  [ProviderType.OpenAI]: getDefaultModelFromRegistry('openai'),
  [ProviderType.OpenAICompatible]:
    getDefaultModelFromRegistry('openai-compatible'),
  [ProviderType.Didim]: getDefaultModelFromRegistry('didim'),
};
```

> **Gemini 기본값 주의**: `getDefaultModelFromRegistry('gemini')`는
> `isDefault: true`인 `gemini-2.5-pro`를 반환한다 (`auto-gemini-3`이 아님).
> Gemini의 Auto 모델 분기(`previewFeatures` 여부에 따른 `auto-gemini-3` vs
> `auto-gemini-2.5`)는 기존 `config.ts:656-658`의 로직이 담당하며, 레지스트리의
> `getDefaultModelFromRegistry()`는 이 분기에 관여하지 않는다.

### 3.3 프로바이더 감지 로직 강화 (CLI)

#### 3.3.1 문제: `selectedProvider`만으로는 감지 불완전

`useAuth.ts`에서 env 자동감지 경로(경로 B)는 `process.env['LLM_PROVIDER']`만
설정하고 `selectedProvider` state를 설정하지 않는다.

또한 `selectedProvider`의 UI 키(`slm`)와 내부 저장 키(`openai-compatible`)가
불일치한다.

#### 3.3.2 해결: 다중 소스 프로바이더 감지 함수

`ModelDialog`에서 사용할 프로바이더 감지 로직을 별도 함수로 추출:

```typescript
// packages/cli/src/ui/utils/resolveActiveProvider.ts (신규)

/**
 * 현재 활성 프로바이더를 결정한다.
 *
 * 우선순위:
 * 1. UI에서 명시 선택된 프로바이더 (selectedProvider)
 * 2. 환경변수 LLM_PROVIDER
 * 3. API 키 기반 자동감지
 * 4. fallback: 'gemini'
 *
 * @param selectedProvider - UIState의 selectedProvider (UI 키)
 * @returns 정규화된 프로바이더 키 (레지스트리 키와 매칭)
 */
export function resolveActiveProvider(selectedProvider?: string): string {
  // 1. UI 선택값이 있으면 내부 키로 변환
  if (selectedProvider) {
    return normalizeProviderKey(selectedProvider);
  }

  // 2. LLM_PROVIDER 환경변수
  const llmProvider = process.env['LLM_PROVIDER'];
  if (llmProvider) {
    return normalizeProviderKey(llmProvider);
  }

  // 3. API 키 기반 감지 (providerSelector.ts의 PROVIDER_ENV_VARS와 동일 순서)
  if (process.env['ANTHROPIC_API_KEY']) return 'claude';
  if (process.env['OPENAI_API_KEY']) return 'openai';
  if (process.env['DIDIM_API_KEY']) return 'didim';

  // 4. Fallback
  return 'gemini';
}

/**
 * UI 키 / env 키 → 레지스트리 키 정규화.
 * 'slm' → 'openai-compatible', 'vertex-ai' → 'gemini' 등.
 */
function normalizeProviderKey(key: string): string {
  switch (key) {
    case 'slm':
      return 'openai-compatible';
    case 'vertex-ai':
      return 'gemini'; // Vertex AI는 Gemini 모델 사용
    case 'didim-studio':
      return 'didim';
    default:
      return key;
  }
}
```

### 3.4 Cross-Provider Model Passthrough 방지

#### 3.4.1 문제

`resolveProviderModel()`은 비-Gemini 모델을 무조건 passthrough한다. 따라서
Claude 모델 ID(`claude-opus-4-6`)가 OpenAI API에 그대로 전달될 수 있다.

#### 3.4.2 해결: prefix 기반 소유권 검증

프로바이더 변경이 발생하는 시점에 **현재 모델이 다른 프로바이더에 명확히
소속되는지 검증**하고, 소속되면 기본 모델로 리셋. 레지스트리에 없는 커스텀
모델(`--model gpt-4o-2024-08-06` 등)은 **다른 프로바이더 prefix가 아닌 한
허용**:

```typescript
// resolveProviderModel() 수정
import {
  isModelValidForProvider,
  getDefaultModelFromRegistry,
} from '../config/providerModels.js';

export function resolveProviderModel(
  model: string,
  provider: ProviderType | string,
): string {
  // Gemini-specific 모델 + 비-Gemini 프로바이더 → 기존 로직
  if (isGeminiSpecificModel(model)) {
    if (provider === ProviderType.Gemini) return model;
    const llmModel = process.env['LLM_MODEL'];
    if (llmModel) return llmModel;
    return getDefaultModelFromRegistry(provider as string);
  }

  // 비-Gemini 모델: 해당 프로바이더에 유효한지 검증
  // allowCustomModels=true이므로, 다른 프로바이더 소유 모델만 거부
  const providerKey = provider as string;
  if (!isModelValidForProvider(model, providerKey)) {
    return getDefaultModelFromRegistry(providerKey);
  }

  return model;
}
```

> **커스텀 모델 보호**: `isModelValidForProvider()`는 `allowCustomModels: true`
> (기본값)인 프로바이더에서 레지스트리 미등록 모델도 허용한다. 단, `claude-*`이
> OpenAI로, `gpt-*`이 Claude로 전달되는 경우만 차단. `--model gpt-4o-2024-08-06`
> 같은 날짜 suffix 모델은 OpenAI 프로바이더에서 정상 통과.

### 3.5 ModelDialog 리팩토링 (CLI)

**파일**: `packages/cli/src/ui/components/ModelDialog.tsx`

#### 3.5.1 프로바이더 감지

`resolveActiveProvider()`를 사용하여 **3가지 감지 경로 모두 커버**:

```typescript
import { resolveActiveProvider } from '../utils/resolveActiveProvider.js';

export function ModelDialog({ onClose, selectedProvider }: ModelDialogProps) {
  const config = useContext(ConfigContext);
  const [view, setView] = useState<'main' | 'manual'>('main');

  // 다중 소스에서 프로바이더 감지
  const provider = resolveActiveProvider(selectedProvider);
  const modelGroup =
    PROVIDER_MODEL_REGISTRY[provider] || PROVIDER_MODEL_REGISTRY['gemini'];

  // ...
}
```

> **변경 사항**: props 이름을 `provider`가 아닌 `selectedProvider`로 하여,
> UIState의 값을 그대로 전달하고, 내부에서 `resolveActiveProvider()`가 정규화.

#### 3.5.2 DidimAIStudio — 모델 선택 비활성

```typescript
// modelSelectionDisabled인 경우 안내 메시지만 표시
if (modelGroup.modelSelectionDisabled) {
  return <ModelSelectionDisabledView
    message={modelGroup.disabledMessage}
    onClose={onClose}
  />;
}
```

#### 3.5.3 프로바이더별 분기

```typescript
// sLM: freeformInput 모드 → 텍스트 입력 UI
if (modelGroup.freeformInput) {
  return <FreeformModelInput onSelect={handleSelect} onClose={onClose} />;
}

// 첫번째 화면: presets + Manual
const mainOptions = [
  ...modelGroup.presets.map(p => ({
    value: p.value,
    title: p.title,
    description: p.description,
    key: p.value,
  })),
  {
    value: 'Manual',
    title: 'Manual',
    description: 'Manually select a model',
    key: 'Manual',
  },
];

// 두번째 화면: 개별 모델 목록
const manualOptions = modelGroup.models.map(m => ({
  value: m.id,
  title: m.displayName || m.id,
  description: m.description,
  key: m.id,
}));

// ... 나머지 로직은 현행과 동일 (선택 → config.setModel)
```

#### 3.5.4 Gemini 프리뷰 모델 필터링

Gemini의 경우 기존 `shouldShowPreviewModels` 로직을 유지한다:

- `config.getPreviewFeatures() && config.getHasAccessToPreviewModel()` 일 때만
  Gemini 3 모델 표시
- 비-Gemini 프로바이더는 이 필터링이 불필요 (항상 전체 목록 표시)

### 3.6 Config.setModel() + 영속화 동기화

#### 3.6.1 문제

현재 `config.setModel(model)`은 `config.model` 인스턴스 필드만 변경한다. 그러나:

- `config.ts:661`에서 `process.env['LLM_MODEL']`이 `settings.model.name`보다
  높은 우선순위
- sLM에서 `LLM_MODEL`이 설정된 상태에서 다른 모델을 `/model`로 선택하면, 현재
  세션 내 `config.getModel()`은 변경되지만 프로세스 재시작 시 `LLM_MODEL` env
  값이 다시 우선됨
- sLM → Claude로 프로바이더 변경 시 `delete process.env['LLM_MODEL']`이 호출되나
  (`useAuth.ts:277`), Claude/OpenAI에서 `/model`로 모델 변경 시에는 env가
  갱신되지 않음
- **sLM 재시작 복원**: `useAuth.ts:260`이
  `settings.security.auth.slmConfig.model`을 읽어 `LLM_MODEL`에 설정하므로,
  `/model`에서 env만 변경하면 재시작 시 이전 값으로 돌아감

#### 3.6.2 해결

```typescript
const handleSelect = (model: string) => {
  if (config) {
    config.setModel(model, persistMode ? false : true);

    // 비-Gemini 프로바이더: LLM_MODEL env 동기화
    if (provider !== 'gemini') {
      process.env['LLM_MODEL'] = model;
    }

    // sLM 프로바이더: slmConfig.model도 settings에 동기화 (재시작 시 복원용)
    // env-only openai-compatible 경로에서는 slmConfig가 없을 수 있으므로
    // 최소 객체를 생성하여 model 필드를 영속화한다.
    if (provider === 'openai-compatible' && settings) {
      const currentSlmConfig = (settings.merged.security?.auth?.slmConfig ??
        {}) as Record<string, string>;
      settings.setValue(SettingScope.User, 'security.auth.slmConfig', {
        ...currentSlmConfig,
        model,
      });
    }
  }
  onClose();
};
```

> **sLM 재시작 보장**: `/model`에서 sLM 모델 변경 시 `slmConfig.model`도
> 갱신하므로, 다음 실행의 `useAuth.ts:260` 복원 경로에서 변경된 모델이 올바르게
> 로드된다.

### 3.7 프로바이더별 모델 영속화 (설정 전략)

#### 3.7.1 문제

현재 `settings.model.name`은 전역 단일 필드. 프로바이더 전환 시 이전 모델 선택이
소실된다.

#### 3.7.2 해결: `modelByProvider` 설정 필드 추가

```typescript
// settings schema 확장
{
  model: {
    name: string;          // 기존: 현재 활성 모델 (하위 호환)
    byProvider?: {         // 신규: 프로바이더별 최근 모델
      gemini?: string;     // e.g., 'auto-gemini-2.5'
      claude?: string;     // e.g., 'claude-opus-4-6'
      openai?: string;     // e.g., 'gpt-4.1'
      'openai-compatible'?: string;  // e.g., 'llama3'
    };
  }
}
```

**동작 흐름**:

1. `/model`에서 모델 선택 시:
   - `model.name` 갱신 (기존과 동일)
   - `model.byProvider[currentProvider]`에도 저장

2. 프로바이더 전환 시:
   - `model.byProvider[newProvider]`가 있으면 해당 모델로 복원
   - 없으면 프로바이더 기본 모델 사용

3. `/model` 다이얼로그 열 때:
   - 초기 선택(하이라이트): `model.byProvider[currentProvider]` 또는
     `config.getModel()`

```typescript
// config.ts 또는 ModelDialog.tsx에서 활용
function getLastModelForProvider(
  settings: Settings,
  provider: string,
): string | undefined {
  return settings.model?.byProvider?.[provider];
}

function saveModelForProvider(
  settings: LoadedSettings,
  provider: string,
  model: string,
): void {
  // 전역 모델 저장 (기존)
  settings.setValue(SettingScope.User, 'model.name', model);
  // 프로바이더별 모델 저장 (신규)
  // ⚠️ settings.merged가 아닌 user scope 원본에서 읽어야
  //    workspace/system에서 내려온 값이 user scope로 복사되는 오염 방지
  const userSettings = settings.forScope(SettingScope.User).settings as {
    model?: { byProvider?: Record<string, string> };
  };
  const userByProvider = userSettings.model?.byProvider ?? {};
  settings.setValue(SettingScope.User, 'model.byProvider', {
    ...userByProvider,
    [provider]: model,
  });
}
```

> **하위 호환**: `model.name`은 기존과 동일하게 유지. `model.byProvider`는
> optional이므로 기존 설정 파일에서도 에러 없이 동작.

#### 3.7.3 Startup Model Resolution에 byProvider 반영

현재 `config.ts:659-668`의 startup model resolution 경로는
`settings.model?.name`만 사용한다. `model.byProvider`는 저장/전환 시에만
사용되므로, **프로세스 재시작 시 프로바이더별 기억이 완전 동작하지 않을 수
있다**.

이를 해결하기 위해 startup에서 `byProvider[activeProvider]`를 `model.name`보다
우선하는 규칙을 추가한다:

```typescript
// config.ts — startup model resolution 수정
// activeProvider 결정: LLM_PROVIDER env → settings의 selectedProvider → undefined
const activeProvider =
  process.env['LLM_PROVIDER'] ||
  normalizeProviderKey(settings.security?.auth?.selectedProvider) ||
  undefined;

const specifiedModel =
  argv.model ||
  process.env['LLM_MODEL'] ||
  process.env['GEMINI_MODEL'] ||
  // byProvider 우선: 활성 프로바이더에 저장된 모델이 있으면 사용
  (activeProvider && settings.model?.byProvider?.[activeProvider]) ||
  settings.model?.name;
```

**우선순위 체인** (수정 후):

1. `argv.model` (CLI --model 인자)
2. `process.env['LLM_MODEL']` (sLM 등 env 오버라이드)
3. `process.env['GEMINI_MODEL']` (레거시 호환)
4. `settings.model.byProvider[activeProvider]` (**신규**)
5. `settings.model.name` (전역 fallback)
6. `defaultModel` (previewFeatures 분기)

> **sLM과의 관계**: sLM은 `useAuth.ts:260`에서 `slmConfig.model` → `LLM_MODEL`
> env를 설정하므로, 우선순위 2에서 이미 처리된다. `byProvider`(우선순위 4)는
> Claude/OpenAI 등 env 오버라이드가 없는 프로바이더에서 주로 효과를 발휘한다.

### 3.8 DialogManager 수정

**파일**: `packages/cli/src/ui/components/DialogManager.tsx`

```diff
  if (uiState.isModelDialogOpen) {
-   return <ModelDialog onClose={uiActions.closeModelDialog} />;
+   return <ModelDialog
+     onClose={uiActions.closeModelDialog}
+     selectedProvider={uiState.selectedProvider}
+   />;
  }
```

### 3.9 FreeformModelInput 컴포넌트 (신규)

**파일**: `packages/cli/src/ui/components/FreeformModelInput.tsx` (신규)

sLM 프로바이더용 텍스트 입력 모델 선택:

```typescript
interface FreeformModelInputProps {
  onSelect: (model: string) => void;
  onClose: () => void;
  currentModel?: string;
}

export function FreeformModelInput({
  onSelect,
  onClose,
  currentModel,
}: FreeformModelInputProps) {
  // TextInput으로 모델명 직접 입력
  // 현재 모델: LLM_MODEL || 'default' 표시
  // Enter → onSelect(입력값)
  // Esc → onClose()
}
```

---
