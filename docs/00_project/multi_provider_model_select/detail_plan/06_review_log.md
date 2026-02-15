# 06. 리뷰 반영 로그

## 7. 리뷰 반영 사항 (v2 — 구조 리뷰)

### 이슈 #1: 프로바이더 감지 — env 자동감지 경로 누락 [HIGH]

- **문제**: `useAuth.ts:164-222`에서 env 자동감지(`ANTHROPIC_API_KEY` 존재 등)는
  `process.env['LLM_PROVIDER']`만 설정하고 `setSelectedProvider()`를 호출하지
  않음. `selectedProvider`만 사용하면 env 감지 경로에서 항상 Gemini로 잘못 판단.
- **추가 이슈**: sLM의 UI 키(`slm`)와 내부 키(`openai-compatible`) 불일치.
- **해결**: `resolveActiveProvider()` 함수 도입 (§3.3). `selectedProvider` →
  `LLM_PROVIDER` → API 키 감지 → fallback 순서로 다중 소스 감지.
  `normalizeProviderKey()`로 UI/내부 키 정규화.

### 이슈 #2: Cross-Provider Model Passthrough [HIGH]

- **문제**: `resolveProviderModel()`은 비-Gemini 모델을 무조건 passthrough.
  Claude 모델 ID가 OpenAI API에 전달될 수 있음.
- **해결**: `isModelValidForProvider()` 검증 함수 도입 (§3.4). 프로바이더 변경
  시 현재 모델이 새 프로바이더 레지스트리에 없으면 기본 모델로 리셋.

### 이슈 #3: LLM_MODEL Sync Side Effects [MEDIUM]

- **문제**: `config.ts:661`에서 `LLM_MODEL`이 `settings.model.name`보다 높은
  우선순위. `/model`에서 `config.setModel()`만 호출하면 env는 변경되지 않아 sLM
  시나리오에서 불일치 발생 가능.
- **해결**: `/model` 선택 시 비-Gemini 프로바이더는 `process.env['LLM_MODEL']`도
  동기화 (§3.6). Vertex AI는 Gemini 모델 사용하므로 제외.

### 이슈 #4: DidimAIStudio 프로바이더 레지스트리 누락 [MEDIUM]

- **문제**: 기존 설계의 `PROVIDER_MODEL_REGISTRY`에 `didim` 키 미포함.
  `DEFAULT_PROVIDER_MODELS`에는 `ProviderType.Didim: 'didim-default'`가 존재.
- **해결**: `didim` 항목 추가 with `modelSelectionDisabled: true` +
  `disabledMessage` (§3.1). 모델 선택 비활성 상태로 안내 메시지 표시.

### 이슈 #5: Default Model 이중 관리 위험 [LOW]

- **문제**: `DEFAULT_PROVIDER_MODELS` (providerSelector.ts)과
  `PROVIDER_MODEL_REGISTRY`의 `isDefault`/`presets[0]`이 별도 관리되면 불일치
  위험.
- **해결**: `getDefaultModelFromRegistry()` SSOT 함수 도입 (§3.1).
  `DEFAULT_PROVIDER_MODELS`를 레지스트리에서 파생 (§3.2). 기본 모델 정보는
  `PROVIDER_MODEL_REGISTRY`에서만 관리.

---

## 8. 리뷰 반영 사항 (v3 — UI/UX 리뷰)

### 이슈 #6: 모델 검증이 커스텀 모델을 차단할 수 있음 [HIGH]

- **문제**: v2의 `isModelValidForProvider()`는 레지스트리 목록 외 모델을 모두
  무효 처리. `--model gpt-4o-2024-08-06` 같은 유효한 커스텀 모델이 기본값으로
  대체됨.
- **근거**: 현재 `resolveProviderModel()`은 비-Gemini 모델을 passthrough
  (providerSelector.ts:252). 사용자가 `--model`이나 `LLM_MODEL`로 지정한 커스텀
  모델은 존중해야 함.
- **해결**: `allowCustomModels: true` (기본값) + prefix 기반 소유권 검증 도입
  (§3.1 `isModelOwnedByOtherProvider()`). 다른 프로바이더에 **명확히
  소속**(`claude-*` → OpenAI, `gpt-*` → Claude)되는 모델만 거부하고, 레지스트리
  미등록 커스텀 모델은 허용.
- **E2E**: 시나리오 #15 (커스텀 모델 통과) + #16 (cross-provider 차단)

### 이슈 #7: sLM "기억하기" 동작이 재시작 후 깨짐 [HIGH]

- **문제**: `/model`에서 `LLM_MODEL` env만 동기화. sLM 재시작 복원은
  `settings.security.auth.slmConfig.model` 기반 (useAuth.ts:260). `/model`에서
  바꾼 모델이 다음 실행에서 이전 값으로 복원됨.
- **근거**: `handleSlmConfigComplete` (AppContainer.tsx:753)에서 `slmConfig`
  전체를 settings에 저장. `/model`에서 모델만 변경 시 settings의
  `slmConfig.model`은 이전 값 유지. 재시작 시 `useAuth.ts:260`이 이전
  `slmConfig.model`을 `LLM_MODEL`에 설정.
- **해결**: §3.6.2에서 sLM 프로바이더인 경우
  `settings.security.auth.slmConfig.model`도 함께 갱신. 이로써 env 동기화 +
  settings 영속화가 모두 이루어짐.
- **E2E**: 시나리오 #17 (sLM 재시작 복원)

### 이슈 #8: Gemini 기본값이 Preview 쪽으로 치우칠 위험 [MEDIUM]

- **문제**: v2의 `getDefaultModelFromRegistry()`가 `presets[0]` 우선이라,
  레지스트리 순서대로면 `auto-gemini-3`이 기본값. 실제 기본값 로직은
  `previewFeatures` 여부에 따라 `auto-gemini-2.5` 중심 (config.ts:656-658).
- **근거**: `PREVIEW_GEMINI_MODEL_AUTO = 'auto-gemini-3'` (models.ts:21),
  `DEFAULT_GEMINI_MODEL_AUTO = 'auto-gemini-2.5'` (models.ts:22).
  `config.ts:656`에서 `previewFeatures`일 때만 `auto-gemini-3` 사용.
- **해결**: §3.1 `getDefaultModelFromRegistry()` 수정 — `isDefault: true` 모델
  우선 반환 (`gemini-2.5-pro`). `presets[0]`은 UI 첫 화면의 첫 항목일 뿐 기본
  모델과 다름. Gemini Auto 모델 분기는 기존 `config.ts` 로직이 담당.
- **E2E**: 시나리오 #20 (Gemini 기본값 검증)

### 이슈 #9: Didim env-only 경로에서 프로바이더 감지 누락 [MEDIUM]

- **문제**: v2의 `resolveActiveProvider()`는 API 키 감지에 Claude/OpenAI만 포함.
  `DIDIM_API_KEY` (providerSelector.ts:44)가 존재하지만 감지 경로 누락.
- **해결**: §3.3.2의 API 키 감지에 `DIDIM_API_KEY` 추가.
  `resolveActiveProvider()`가 `process.env['DIDIM_API_KEY']` → `'didim'` 반환.
- **E2E**: 시나리오 #19 (Didim env 감지)

### 이슈 #10: 전역 단일 모델 영속화 — 프로바이더별 기억 UX 부재 [LOW]

- **문제**: `settings.model.name` 단일 필드 (settings.ts:854). 프로바이더 전환
  시 이전 모델 선택 소실.
- **해결**: §3.7 `model.byProvider` 설정 필드 추가. 프로바이더별 최근 모델을
  별도 저장하고, 프로바이더 전환 시 복원. 기존 `model.name`은 하위 호환으로
  유지.
- **E2E**: 시나리오 #18 (프로바이더별 모델 기억)

---

## 9. 리뷰 반영 사항 (v4 — 구현 정합성 리뷰)

### 이슈 #11: model.byProvider 저장 시 스코프 오염 가능 [MEDIUM]

- **문제**: v3의 `saveModelForProvider()`는
  `settings.merged.model?.byProvider`를 기반으로 user scope에 다시 저장.
  `merged`는 system/systemDefaults/user/workspace 4개 scope를 merge한
  결과(`settings.ts:299-305`)이므로, workspace/system에서 내려온 값까지 user
  scope로 복사될 수 있다.
- **근거**: `LoadedSettings.computeMergedSettings()` →
  `mergeSettings(system, systemDefaults, user, workspace, ...)`
  (settings.ts:298-305). `setValue(SettingScope.User, ...)` →
  `settings.forScope(SettingScope.User).settings`에 저장 (settings.ts:340-347).
- **해결**: §3.7.2 `saveModelForProvider()` 수정 — `settings.merged` 대신
  `settings.forScope(SettingScope.User).settings`의 user scope 원본에서
  `byProvider`를 읽고, merge 후 user scope에 저장.

### 이슈 #12: model.byProvider가 재시작 시 초기 모델 결정에 반영되지 않음 [MEDIUM]

- **문제**: v3 설계는 `byProvider`의 저장(§3.7.2 :708)과 프로바이더 전환 시
  복원(§3.7.2 :711)만 명시. 실제 startup model resolution(`config.ts:659-668`)은
  `settings.model?.name` 중심이므로, 프로세스 재시작 후 프로바이더별 기억이
  완전히 동작하지 않음.
- **근거**: `config.ts:659` —
  `specifiedModel = argv.model || LLM_MODEL || GEMINI_MODEL || settings.model?.name`.
  `byProvider` 참조 없음.
- **해결**: §3.7.3 추가 — startup model resolution에
  `byProvider[activeProvider]` 우선 규칙 삽입. 우선순위: argv.model >
  LLM_MODEL > GEMINI_MODEL > **byProvider[activeProvider]** > model.name >
  defaultModel.

### 이슈 #13: sLM 동기화에서 slmConfig 미존재 시 저장 누락 [LOW]

- **문제**: v3의 §3.6.2에서 `if (currentSlmConfig)` 가드가 slmConfig가 없으면
  저장을 건너뜀. env-only openai-compatible
  경로(`LLM_PROVIDER=openai-compatible` + `LLM_MODEL=...` 환경변수만 설정,
  SlmConfigDialog 미거침)에서는 settings에 slmConfig가 존재하지 않을 수 있음.
- **해결**: §3.6.2 수정 — `settings.merged.security?.auth?.slmConfig ?? {}`
  (nullish coalescing)으로 최소 빈 객체를 생성하여 model 필드를 영속화.

### 이슈 #14: 구현 파일 표기 불일치 [LOW]

- **문제**: 수정 파일 요약(§4 #8)에서 `settings.ts`에 "스키마 확장"으로 표기.
  실제 스키마 정의는 `settingsSchema.ts` (`settingsSchema.ts:675-743`에 `model`
  스키마), `settings.ts`는 `saveModelChange()` 등 헬퍼 함수만 포함.
- **해결**: §4 수정 — #8을 `settingsSchema.ts` (스키마 정의), #9로 `settings.ts`
  (헬퍼), #10으로 `config.ts` (startup resolution) 분리.

---
