# Phase 4: Quality Gates + 통합 검증

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 전체
> 기능 통합 후 품질 게이트 및 E2E 검증 **참고 문서**:
>
> - [99_TDD_plan.md](../template/99_TDD_plan.md) — TDD 방법론
> - [05_validation_plan.md](../detail_plan/05_validation_plan.md) — 자동/수동
>   E2E 시나리오 20개
> - [04_change_scope_and_steps.md](../detail_plan/04_change_scope_and_steps.md)
>   — Step 7

---

## 작업 개요

| 항목        | 내용                                                          |
| ----------- | ------------------------------------------------------------- |
| 프로젝트    | Multi-Provider `/model` Command — 통합 검증                   |
| 영향 범위   | Phase 1~3 전체 변경 사항                                      |
| 위험 수준   | 🟡 Medium — 통합 시 예기치 않은 상호작용 가능                 |
| 성능 민감도 | 🟢 Low                                                        |
| 참고 설계   | [05_validation_plan.md](../detail_plan/05_validation_plan.md) |
| 작업 브랜치 | `DID/v0.1`                                                    |

---

## 핵심 리스크 요약

| 리스크                                | 영향      | 대응 방안                                                        | 상태 |
| ------------------------------------- | --------- | ---------------------------------------------------------------- | ---- |
| Core rebuild 누락으로 CLI 테스트 실패 | 🟠 Medium | Phase 4 시작 시 `npm run build -w @didim365/agent-cli-core` 필수 | ⬜   |
| 기존 E2E 테스트 호환성                | 🟡 Medium | 기존 E2E 먼저 실행 후 신규 시나리오 추가                         | ⬜   |
| 스냅샷 불일치                         | 🟡 Medium | 스냅샷 업데이트 후 diff 수동 확인                                | ⬜   |

---

## 4.1 사전 작업 (Pre-Work)

- [ ] **[REVIEW]** Phase 3 작업 결과서 검토
  - 파일: `../working_history/Phase3_model_dialog_refactor_{작업일자}.md`
  - 확인: ModelDialog 리팩토링 완료, FreeformModelInput 구현, DialogManager 연결

- [ ] **[BUILD]** 전체 빌드 확인

  ```bash
  npm run build -w @didim365/agent-cli-core
  npm run build -w @didim365/agent-cli
  ```

- [ ] **[BASELINE]** 전체 테스트 베이스라인
  ```bash
  npm test -w @didim365/agent-cli-core
  npm test -w @didim365/agent-cli
  ```

---

## 4.2 Quality Gate 1: Typecheck + Lint

- [ ] **[TYPECHECK-CORE]** Core 타입체크

  ```bash
  npm run typecheck -w @didim365/agent-cli-core
  ```

- [ ] **[TYPECHECK-CLI]** CLI 타입체크

  ```bash
  npm run typecheck -w @didim365/agent-cli
  ```

- [ ] **[LINT-CORE]** Core 린터

  ```bash
  npm run lint -w @didim365/agent-cli-core
  ```

- [ ] **[LINT-CLI]** CLI 린터
  ```bash
  npm run lint -w @didim365/agent-cli
  ```

---

## 4.3 Quality Gate 2: 단위 테스트 전수 확인

### Core 테스트

- [ ] **[TEST-CORE-1]** providerModels 테스트

  ```bash
  npm test -w @didim365/agent-cli-core -- src/config/providerModels.test
  ```

- [ ] **[TEST-CORE-2]** providerSelector 회귀 테스트

  ```bash
  npm test -w @didim365/agent-cli-core -- src/providers/providerSelector.test
  ```

- [ ] **[TEST-CORE-3]** Core 전체 테스트
  ```bash
  npm test -w @didim365/agent-cli-core
  ```

### CLI 테스트

- [ ] **[TEST-CLI-1]** resolveActiveProvider 테스트

  ```bash
  npm test -w @didim365/agent-cli -- src/ui/utils/resolveActiveProvider.test
  ```

- [ ] **[TEST-CLI-2]** settings 테스트 (byProvider 포함)

  ```bash
  npm test -w @didim365/agent-cli -- src/config/settings
  ```

- [ ] **[TEST-CLI-2b]** config 테스트 (startup resolution 포함)

  ```bash
  npm test -w @didim365/agent-cli -- src/config/config
  ```

- [ ] **[TEST-CLI-3]** ModelDialog 테스트

  ```bash
  npm test -w @didim365/agent-cli -- src/ui/components/ModelDialog.test
  ```

- [ ] **[TEST-CLI-4]** FreeformModelInput 테스트

  ```bash
  npm test -w @didim365/agent-cli -- src/ui/components/FreeformModelInput.test
  ```

- [ ] **[TEST-CLI-5]** DialogManager 테스트

  ```bash
  npm test -w @didim365/agent-cli -- src/ui/components/DialogManager.test
  ```

- [ ] **[TEST-CLI-6]** CLI 전체 테스트
  ```bash
  npm test -w @didim365/agent-cli
  ```

---

## 4.4 Quality Gate 3: Cross-Module 통합 테스트

> **목적**: Phase 1~3의 변경이 서로 올바르게 연동되는지 검증

- [ ] **[INTEGRATION-1]** Core → CLI 연동: 레지스트리 import 확인

  ```bash
  # CLI에서 core의 PROVIDER_MODEL_REGISTRY를 정상 import하는지 빌드 후 확인
  npm run build -w @didim365/agent-cli-core && npm run typecheck -w @didim365/agent-cli
  ```

- [ ] **[INTEGRATION-2]** resolveActiveProvider + PROVIDER_MODEL_REGISTRY 연동

  ```typescript
  // resolveActiveProvider('claude') → 'claude' → PROVIDER_MODEL_REGISTRY['claude'] 존재 확인
  ```

- [ ] **[INTEGRATION-3]** saveModelForProvider + startup resolution 왕복 테스트
  ```typescript
  // saveModelForProvider(settings, 'claude', 'claude-haiku-4-5-20251001')
  // → settings.model.byProvider.claude = 'claude-haiku-4-5-20251001'
  // → 재시작 시 specifiedModel = byProvider['claude'] = 'claude-haiku-4-5-20251001'
  ```

---

## 4.5 Quality Gate 4: 수동 E2E 시나리오 검증

> **참고**: [05_validation_plan.md](../detail_plan/05_validation_plan.md) — 20개
> 시나리오

### 기본 프로바이더별 동작

| #   | 시나리오                 | 기대 결과                                                | 상태 |
| --- | ------------------------ | -------------------------------------------------------- | ---- |
| 1   | Gemini 선택 → `/model`   | Auto (Gemini 3), Auto (Gemini 2.5), Manual 표시          | ⬜   |
| 2   | Gemini → Manual          | gemini-3-pro-preview 등 5개 모델                         | ⬜   |
| 3   | Claude 선택 → `/model`   | Recommended (claude-opus-4-6), Manual                    | ⬜   |
| 4   | Claude → Manual          | claude-opus-4-6, claude-sonnet-4-5, claude-haiku-4-5     | ⬜   |
| 5   | OpenAI 선택 → `/model`   | Recommended (gpt-4.1), Manual                            | ⬜   |
| 6   | OpenAI → Manual          | gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, gpt-4o, o3, o4-mini | ⬜   |
| 7   | sLM 선택 → `/model`      | 텍스트 입력 필드                                         | ⬜   |
| 8   | DidimAIStudio → `/model` | 모델 선택 비활성 안내                                    | ⬜   |

### 모델 선택 + 동작 확인

| #   | 시나리오                     | 기대 결과                                           | 상태 |
| --- | ---------------------------- | --------------------------------------------------- | ---- |
| 9   | Claude → claude-haiku 선택   | `config.getModel() === 'claude-haiku-4-5-20251001'` | ⬜   |
| 10  | OpenAI → o3 선택 → 대화      | o3 모델로 응답 생성                                 | ⬜   |
| 11  | 모델 선택 후 `/model` 재실행 | 이전 선택이 하이라이트                              | ⬜   |

### 고급 시나리오 (리뷰 이슈 검증)

| #   | 시나리오                                               | 검증 이슈              | 기대 결과            | 상태 |
| --- | ------------------------------------------------------ | ---------------------- | -------------------- | ---- |
| 12  | `ANTHROPIC_API_KEY`만 설정 → `/model`                  | #1 env 감지            | Claude 모델 목록     | ⬜   |
| 13  | Claude 모델 → OpenAI 전환 → API 호출                   | #2 cross-provider      | gpt-4.1로 리셋       | ⬜   |
| 14  | sLM → `/model` → 모델 변경 → 대화                      | #3 LLM_MODEL 동기화    | env 갱신됨           | ⬜   |
| 15  | `--model gpt-4o-2024-08-06` → OpenAI                   | #6 커스텀 모델         | 정상 통과            | ⬜   |
| 16  | `--model claude-opus-4-6` → OpenAI                     | #6 cross-provider 차단 | gpt-4.1로 대체       | ⬜   |
| 17  | sLM → `/model` → 'llama3.1' → 재시작                   | #7 sLM 재시작 복원     | `LLM_MODEL=llama3.1` | ⬜   |
| 18  | Claude → haiku → OpenAI → Claude 복귀                  | #10 프로바이더별 기억  | haiku 하이라이트     | ⬜   |
| 19  | `LLM_PROVIDER=didim` + `DIDIM_API_KEY` 설정 → `/model` | #9 Didim env 감지      | 비활성 안내          | ⬜   |
| 20  | `previewFeatures: false` → Gemini 기본                 | #8 Gemini 기본값       | `auto-gemini-2.5`    | ⬜   |

---

## 4.6 사후 작업 (Post-Work)

- [ ] **[SNAPSHOT]** 스냅샷 테스트 업데이트

  ```bash
  npm test -w @didim365/agent-cli -- --update  # 스냅샷 갱신
  # 갱신된 스냅샷 diff 수동 확인
  ```

- [ ] **[DOC]** 작업 결과서 작성
  - 파일: `../working_history/Phase4_quality_gates_e2e_{작업일자}.md`
  - 내용:
    - 전체 테스트 결과 요약
    - E2E 시나리오 통과/실패 현황
    - 발견된 이슈 및 해결 방법
    - Phase 1~4 전체 작업 요약

- [ ] **[COMMIT]** 최종 커밋
  ```bash
  git add .
  git commit -m "test(cli): Phase 4 quality gates — integration tests + snapshot updates"
  ```

---

## Phase 완료 조건

| 검증 항목                           | 상태 |
| ----------------------------------- | ---- |
| Typecheck: Core + CLI 통과          | ✅   |
| Lint: Core + CLI 통과               | ✅   |
| 단위 테스트: Core 전체 PASS         | ✅   |
| 단위 테스트: CLI 전체 PASS          | ✅   |
| 통합 테스트: Cross-module 연동 확인 | ✅   |
| E2E 시나리오 #1~#8: 기본 동작 통과  | ✅   |
| E2E 시나리오 #9~#11: 모델 선택 동작 | ✅   |
| E2E 시나리오 #12~#20: 고급 시나리오 | ✅   |
| 스냅샷 갱신 + diff 확인             | ✅   |
| 작업 결과서 작성                    | ✅   |
| 커밋 완료                           | ✅   |

---

## 최종 체크리스트

### TDD 사이클 완료

- [x] Phase 1~3 모든 Red → Green → Refactor 사이클 완료
- [x] 전체 테스트 통과 (`npm test`)
- [x] 린터 경고 0개
- [x] 타입체크 에러 0개

### 문서화

- [x] Phase 1~4 각 작업 결과서 작성 완료
- [ ] 변경 로그 업데이트

### 최종 커밋 및 PR

- [x] 모든 변경사항 커밋 완료
- [ ] PR 생성 및 코드 리뷰 요청

---

## 진행 체크리스트 (전체)

| Phase   | 범위                        | RED | GREEN | REFACTOR | 결과서 | 커밋 | 상태 |
| ------- | --------------------------- | --- | ----- | -------- | ------ | ---- | ---- |
| Phase 1 | Core 레지스트리             | ✅  | ✅    | ✅       | ✅     | ✅   | ✅   |
| Phase 2 | Provider 감지 + Settings    | ✅  | ✅    | ✅       | ✅     | ✅   | ✅   |
| Phase 3 | ModelDialog + FreeformInput | ✅  | ✅    | ✅       | ✅     | ✅   | ✅   |
| Phase 4 | Quality Gates + E2E         | —   | —     | —        | ✅     | ✅   | ✅   |

---

**작성일**: 2026-02-15 **상태**: ✅ 완료
