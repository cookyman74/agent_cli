# 05. 검증 계획

## 6. 검증 방법

### 자동 테스트

```bash
# ModelDialog 테스트
npm test -w @didim365/agent-cli -- src/ui/components/ModelDialog.test

# Core 테스트
npm test -w @didim365/agent-cli-core -- src/config/providerModels.test

# Provider 감지 유틸 테스트
npm test -w @didim365/agent-cli -- src/ui/utils/resolveActiveProvider.test

# resolveProviderModel 회귀
npm test -w @didim365/agent-cli-core -- src/providers/providerSelector.test

# Quality gates
npx tsc --noEmit -p packages/cli/tsconfig.json
npm run lint -w @didim365/agent-cli
```

### 수동 E2E 시나리오

| #   | 시나리오                                                                    | 기대 결과                                                                                                               |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | Gemini 선택 → `/model`                                                      | Auto (Gemini 3), Auto (Gemini 2.5), Manual 표시                                                                         |
| 2   | Gemini → Manual                                                             | gemini-3-pro-preview 등 5개 모델 표시                                                                                   |
| 3   | Claude 선택 → `/model`                                                      | Recommended (claude-opus-4-6), Manual 표시                                                                              |
| 4   | Claude → Manual                                                             | claude-opus-4-6, claude-sonnet-4-5, claude-haiku-4-5 표시                                                               |
| 5   | OpenAI 선택 → `/model`                                                      | Recommended (gpt-4.1), Manual 표시                                                                                      |
| 6   | OpenAI → Manual                                                             | gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, gpt-4o, o3, o4-mini 표시                                                           |
| 7   | sLM 선택 → `/model`                                                         | 텍스트 입력 필드 표시                                                                                                   |
| 8   | DidimAIStudio → `/model`                                                    | 모델 선택 비활성 안내 메시지 표시                                                                                       |
| 9   | Claude → claude-haiku 선택                                                  | config.getModel() === 'claude-haiku-4-5-20251001' 확인                                                                  |
| 10  | OpenAI → o3 선택 → 대화                                                     | o3 모델로 응답 생성 확인                                                                                                |
| 11  | 모델 선택 후 `/model` 재실행                                                | 이전 선택이 하이라이트                                                                                                  |
| 12  | **env 자동감지**: `ANTHROPIC_API_KEY` 설정만 → `/model`                     | Claude 모델 목록 표시 (selectedProvider 미설정 경로)                                                                    |
| 13  | **cross-provider**: Claude 모델 선택 → OpenAI로 프로바이더 변경 → API 호출  | OpenAI 기본 모델(gpt-4.1)로 리셋, claude-opus-4-6이 OpenAI에 전달되지 않음                                              |
| 14  | **LLM_MODEL 동기화**: sLM → `/model` → 다른 모델 입력 → 대화                | 입력한 모델로 API 호출, `process.env['LLM_MODEL']` 갱신됨                                                               |
| 15  | **커스텀 모델**: `--model gpt-4o-2024-08-06` → OpenAI 프로바이더            | 레지스트리 미등록이지만 정상 통과 (OpenAI prefix)                                                                       |
| 16  | **커스텀 모델 차단**: `--model claude-opus-4-6` → OpenAI 프로바이더         | `claude-*` prefix → OpenAI에서 거부 → 기본 모델(gpt-4.1)로 대체                                                         |
| 17  | **sLM 재시작 복원**: sLM → `/model` → 'llama3.1' 입력 → CLI 재시작          | 재시작 후 `LLM_MODEL=llama3.1` 복원 (slmConfig.model 동기화 확인)                                                       |
| 18  | **프로바이더별 모델 기억**: Claude → haiku 선택 → OpenAI 전환 → 다시 Claude | Claude 전환 시 haiku가 기억되어 하이라이트                                                                              |
| 19  | **Didim env 감지**: `LLM_PROVIDER=didim` + `DIDIM_API_KEY` 설정 → `/model`  | DidimAIStudio 모델 비활성 안내 표시 (주: `useAuth.ts`가 `DIDIM_API_KEY` 단독 자동감지 미지원이므로 `LLM_PROVIDER` 필수) |
| 20  | **Gemini 기본값**: `previewFeatures: false` → Gemini 기본 모델              | `auto-gemini-2.5` (not `auto-gemini-3`)                                                                                 |

---
