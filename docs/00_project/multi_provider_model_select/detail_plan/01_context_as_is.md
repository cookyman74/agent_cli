# 01. AS-IS 분석

## 1. 현재 상태 (AS-IS)

### 1.1 문제

`/model` 명령 실행 시 **Gemini 모델만** 표시된다. Claude나 OpenAI 프로바이더를
선택한 사용자도 Gemini 모델 목록(Auto Gemini 3, Auto Gemini 2.5, Manual →
gemini-2.5-pro 등)을 보게 되며, 선택해도 실제로는 `providerSelector.ts`의
`resolveProviderModel()`이 프로바이더 기본 모델로 대체한다.

### 1.2 현재 코드 구조

```
/model 명령 실행
  → modelCommand.ts: config.refreshUserQuota() → dialog: 'model'
    → DialogManager.tsx: <ModelDialog onClose={...} />
      → ModelDialog.tsx: Gemini 모델 하드코딩
        - mainOptions: Auto (Gemini 3), Auto (Gemini 2.5), Manual
        - manualOptions: gemini-3-pro-preview, gemini-3-flash-preview, gemini-2.5-pro, ...
      → config.setModel(model) 호출
        → providerSelector.ts: resolveProviderModel()에서 비-Gemini 프로바이더면 기본 모델로 대체
```

### 1.3 관련 파일

| 파일                                              | 역할                                                         |
| ------------------------------------------------- | ------------------------------------------------------------ |
| `packages/cli/src/ui/components/ModelDialog.tsx`  | 모델 선택 UI (Gemini 하드코딩)                               |
| `packages/cli/src/ui/hooks/useModelCommand.ts`    | 다이얼로그 열기/닫기 상태                                    |
| `packages/cli/src/ui/commands/modelCommand.ts`    | `/model` 슬래시 커맨드 핸들러                                |
| `packages/core/src/config/models.ts`              | Gemini 모델 상수 + resolve/display 함수                      |
| `packages/core/src/config/config.ts`              | `getModel()`, `setModel()`, `getActiveModel()`               |
| `packages/core/src/providers/providerSelector.ts` | `DEFAULT_PROVIDER_MODELS`, `resolveProviderModel()`          |
| `packages/cli/src/ui/auth/providerMetadata.ts`    | 프로바이더 UI 메타데이터                                     |
| `packages/cli/src/ui/auth/useAuth.ts`             | 인증 및 프로바이더 선택 상태 관리                            |
| `packages/cli/src/config/config.ts`               | 모델 해석 우선순위 (`LLM_MODEL` > `GEMINI_MODEL` > settings) |
| `packages/cli/src/config/settings.ts`             | `saveModelChange()` → 전역 `model.name` 단일 필드 영속화     |

### 1.4 현재 프로바이더 감지 경로 분석

프로바이더가 결정되는 경로가 **3가지** 있으며, 각 경로에서 상태가 다르게
설정된다:

| 경로            | 트리거                          | `selectedProvider` (UI state) | `LLM_PROVIDER` (env)          | `config.model`               |
| --------------- | ------------------------------- | ----------------------------- | ----------------------------- | ---------------------------- |
| A. UI 선택      | ProviderSelectDialog → onSelect | ✅ 설정됨                     | ✅ 설정됨                     | Gemini 기본값 유지           |
| B. Env 자동감지 | `ANTHROPIC_API_KEY` 등 존재     | ❌ **설정 안됨**              | ✅ 설정됨                     | Gemini 기본값 유지           |
| C. sLM 복원     | useAuth → slmConfig 로드        | ✅ 'slm' 설정됨               | ✅ 'openai-compatible' 설정됨 | `LLM_MODEL` env로 오버라이드 |

> **핵심 이슈**: 경로 B에서 `selectedProvider`가 설정되지 않아,
> `selectedProvider`만으로 프로바이더를 판단하면 Gemini로 잘못 인식될 수 있다.

### 1.5 Cross-Provider Model Passthrough 문제

`resolveProviderModel()`의 현재 로직:

```typescript
// providerSelector.ts:252-271
export function resolveProviderModel(
  model: string,
  provider: ProviderType | string,
): string {
  // 1. 비-Gemini 모델명은 무조건 passthrough
  if (!isGeminiSpecificModel(model)) {
    return model; // ← 'claude-opus-4-6'을 OpenAI에 보내도 그대로 통과
  }
  // 2. Gemini provider면 그대로
  if (provider === ProviderType.Gemini) return model;
  // 3. LLM_MODEL 우선
  const llmModel = process.env['LLM_MODEL'];
  if (llmModel) return llmModel;
  // 4. 프로바이더 기본 모델
  return DEFAULT_PROVIDER_MODELS[providerKey] ?? model;
}
```

Claude 모델을 선택한 뒤 프로바이더를 OpenAI로 변경해도, `claude-opus-4-6`이
그대로 OpenAI API에 전달된다.

### 1.6 LLM_MODEL 우선순위 문제

`config.ts:659-668`에서 모델 해석 순서:

```typescript
const specifiedModel =
  argv.model ||
  process.env['LLM_MODEL'] || // ← 최우선 (CLI 인자 다음)
  process.env['GEMINI_MODEL'] ||
  settings.model?.name;
```

`/model`에서 `config.setModel(model)` 호출 시:

- `config.model` (인스턴스 필드)만 변경됨
- `process.env['LLM_MODEL']`은 변경되지 않음
- 프로세스 내에서는 `config.getModel()`이 인스턴스 필드를 반환하므로 동작하나,
  sLM에서 `LLM_MODEL`이 설정된 상태라면 프로세스 재시작 시 env 값이 다시 우선됨

### 1.7 sLM 모델 영속화 경로 분석

sLM에서 모델이 저장·복원되는 경로:

```
[저장 (SlmConfigDialog → handleSlmConfigComplete)]
  AppContainer.tsx:753 → settings.setValue('security.auth.slmConfig', slmConfig)
    → slmConfig.model 에 사용자 입력값 저장

[복원 (useAuth → 재시작)]
  useAuth.ts:238 → settings.merged.security.auth.slmConfig 로드
  useAuth.ts:260 → if (slmConfig.model) process.env['LLM_MODEL'] = slmConfig.model
```

`/model`에서 모델 변경 시 `process.env['LLM_MODEL']`만 갱신하고
`settings.security.auth.slmConfig.model`은 갱신하지 않으면, **재시작 시 이전
슬렘 모델로 되돌아감**.

### 1.8 Gemini 기본 모델 분기 로직

`config.ts:656-658`에서 Gemini 기본 모델은 `previewFeatures` 설정에 따라 분기:

```typescript
const defaultModel = settings.general?.previewFeatures
  ? PREVIEW_GEMINI_MODEL_AUTO // 'auto-gemini-3' (models.ts:21)
  : DEFAULT_GEMINI_MODEL_AUTO; // 'auto-gemini-2.5' (models.ts:22)
```

레지스트리의 `getDefaultModelFromRegistry()`가 `presets[0]`을 무조건 반환하면,
`previewFeatures` 여부와 무관하게 항상 `auto-gemini-3`이 기본값이 된다.

### 1.9 모델 영속화 구조

현재 모델 저장은 **전역 단일 필드**:

```typescript
// settings.ts:854
loadedSettings.setValue(SettingScope.User, 'model.name', model);
```

프로바이더를 전환할 때마다 이전 프로바이더에서 선택한 모델이 소실된다. 예:
Claude에서 `claude-haiku-4-5` 선택 → OpenAI 전환 → 다시 Claude 전환 시
`claude-haiku-4-5`를 기억하지 못함.

---
