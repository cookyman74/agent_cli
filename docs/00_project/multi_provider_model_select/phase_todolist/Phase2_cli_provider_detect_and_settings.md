# Phase 2: CLI — 프로바이더 감지 유틸 + 설정 스키마 확장

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 테스트
> 먼저 작성 → 최소 코드 구현 → 리팩터링 **리팩터링 원칙**: "Make it work → Make
> it right → Make it fast" **참고 문서**:
>
> - [99_TDD_plan.md](../template/99_TDD_plan.md) — TDD 방법론
> - [03_architecture_design.md](../detail_plan/03_architecture_design.md) —
>   §3.3, §3.7
> - [04_change_scope_and_steps.md](../detail_plan/04_change_scope_and_steps.md)
>   — Step 2~3
> - [06_review_log.md](../detail_plan/06_review_log.md) — 이슈 #1, #9, #10, #11,
>   #12

---

## 작업 개요

| 항목        | 내용                                                                               |
| ----------- | ---------------------------------------------------------------------------------- |
| 프로젝트    | Multi-Provider `/model` Command — 프로바이더 감지 + 설정 확장                      |
| 영향 범위   | `resolveActiveProvider.ts` (신규), `settingsSchema.ts`, `settings.ts`, `config.ts` |
| 위험 수준   | 🟡 Medium — settings 스키마 변경 + startup resolution 수정                         |
| 성능 민감도 | 🟢 Low — startup 1회 실행 로직                                                     |
| 참고 설계   | [03_architecture_design.md §3.3, §3.7](../detail_plan/03_architecture_design.md)   |
| 작업 브랜치 | `DID/v0.1`                                                                         |

---

## 핵심 리스크 요약

| 리스크                                                         | 영향      | 대응 방안                                                                                                                                              | 상태 |
| -------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `model.byProvider` 스키마 추가 시 기존 settings 파싱 오류      | 🟠 Medium | optional 필드로 추가, 기존 설정 파일 호환 테스트                                                                                                       | ⬜   |
| startup resolution 변경으로 기존 모델 선택 깨짐                | 🟠 Medium | `LLM_PROVIDER` 미설정 시 기존 경로와 동일하게 동작 검증                                                                                                | ⬜   |
| `saveModelForProvider` scope 오염 (이슈 #11)                   | 🟡 Medium | user scope 원본에서 읽기 전용 테스트 추가                                                                                                              | ⬜   |
| `resolveActiveProvider()` vs Core `selectProvider()` drift     | 🟡 Medium | 계약 기반 검증: (1) `LLM_PROVIDER` 설정 시 동일 프로바이더 선택, (2) API key 단독 시 동일 감지. 완전 동일성이 아닌 공통 입력에 대한 동일 결과만 테스트 | ⬜   |
| Didim env-only: `useAuth.ts`가 `DIDIM_API_KEY` 자동감지 미지원 | 🟡 Medium | `resolveActiveProvider()`는 감지 가능하나 앱 진입(`useAuth`)에서 막힘. E2E 전제조건을 `LLM_PROVIDER=didim`으로 명확화                                  | ⬜   |

---

## 2.1 사전 작업 (Pre-Work)

- [ ] **[REVIEW]** Phase 1 작업 결과서 검토
  - 파일: `../working_history/Phase1_core_model_registry_{작업일자}.md`
  - 확인: 체크리스트 완료 여부, 미해결 이슈, Core 빌드 상태

- [ ] **[CONTEXT]** Phase 2 작업 목적 확인
  - 설계:
    [03_architecture_design.md §3.3](../detail_plan/03_architecture_design.md) —
    `resolveActiveProvider()`
  - 설계:
    [03_architecture_design.md §3.7](../detail_plan/03_architecture_design.md) —
    `model.byProvider` + startup
  - 리뷰 이슈: #1(env 감지 경로), #9(Didim env), #10(byProvider), #11(scope
    오염), #12(startup)

- [ ] **[ANALYSIS-1]** 현재 `settingsSchema.ts` 구조 분석
  - 파일: `packages/cli/src/config/settingsSchema.ts`
  - 확인: `model` 섹션 구조 (line 675~743), `properties` 필드 패턴

- [ ] **[ANALYSIS-2]** 현재 `settings.ts` 헬퍼 분석
  - 파일: `packages/cli/src/config/settings.ts`
  - 확인: `saveModelChange()` 패턴, `LoadedSettings.forScope()` API,
    `setValue()` 동작

- [ ] **[ANALYSIS-3]** `config.ts` startup model resolution 분석
  - 파일: `packages/cli/src/config/config.ts:656-668`
  - 확인: `specifiedModel` 결정 로직, `LLM_PROVIDER` 접근 가능 시점

- [ ] **[ANALYSIS-4]** 기존 테스트 베이스라인 기록
  ```bash
  npm test -w @didim365/agent-cli -- src/config/settings
  npm test -w @didim365/agent-cli -- src/config/config
  ```

---

## 2.2 RED Phase: 실패 테스트 작성

### Part A: resolveActiveProvider 테스트

- [ ] **[RED-1]** `resolveActiveProvider()` 기본 동작 테스트

  ```typescript
  // packages/cli/src/ui/utils/resolveActiveProvider.test.ts (신규)
  describe('resolveActiveProvider', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('returns normalized key when selectedProvider is "slm"', () => {
      expect(resolveActiveProvider('slm')).toBe('openai-compatible');
    });

    it('returns "gemini" when selectedProvider is "vertex-ai"', () => {
      expect(resolveActiveProvider('vertex-ai')).toBe('gemini');
    });

    it('returns "didim" when selectedProvider is "didim-studio"', () => {
      expect(resolveActiveProvider('didim-studio')).toBe('didim');
    });

    it('returns passthrough for known keys (claude, openai, gemini)', () => {
      expect(resolveActiveProvider('claude')).toBe('claude');
      expect(resolveActiveProvider('openai')).toBe('openai');
      expect(resolveActiveProvider('gemini')).toBe('gemini');
    });
  });
  ```

- [ ] **[RED-2]** `resolveActiveProvider()` env fallback 테스트

  ```typescript
  describe('resolveActiveProvider - env fallback', () => {
    it('uses LLM_PROVIDER when selectedProvider is undefined', () => {
      vi.stubEnv('LLM_PROVIDER', 'claude');
      expect(resolveActiveProvider()).toBe('claude');
    });

    it('normalizes LLM_PROVIDER value', () => {
      vi.stubEnv('LLM_PROVIDER', 'openai-compatible');
      expect(resolveActiveProvider()).toBe('openai-compatible');
    });

    it('detects ANTHROPIC_API_KEY → claude', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-xxx');
      expect(resolveActiveProvider()).toBe('claude');
    });

    it('detects OPENAI_API_KEY → openai', () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-xxx');
      expect(resolveActiveProvider()).toBe('openai');
    });

    it('detects DIDIM_API_KEY → didim', () => {
      vi.stubEnv('DIDIM_API_KEY', 'didim-xxx');
      expect(resolveActiveProvider()).toBe('didim');
    });

    it('falls back to gemini when no env set', () => {
      expect(resolveActiveProvider()).toBe('gemini');
    });

    it('selectedProvider takes priority over LLM_PROVIDER', () => {
      vi.stubEnv('LLM_PROVIDER', 'openai');
      expect(resolveActiveProvider('claude')).toBe('claude');
    });
  });
  ```

### Part B: settings 스키마 + 헬퍼 테스트

- [ ] **[RED-3]** `model.byProvider` 스키마 존재 테스트

  ```typescript
  // settingsSchema.test.ts (기존 파일에 추가)
  describe('model.byProvider schema', () => {
    it('model has byProvider property in schema', () => {
      const schema = getSettingsSchema();
      expect(schema.model.properties?.byProvider).toBeDefined();
      expect(schema.model.properties?.byProvider.type).toBe('object');
    });
  });
  ```

- [ ] **[RED-4]** `saveModelForProvider()` 동작 테스트

  ```typescript
  // settings.test.ts (기존 파일에 추가)
  describe('saveModelForProvider', () => {
    it('saves model.name and model.byProvider[provider]', () => {
      // LoadedSettings mock 준비
      saveModelForProvider(
        loadedSettings,
        'claude',
        'claude-haiku-4-5-20251001',
      );

      // model.name 저장 확인
      expect(loadedSettings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'model.name',
        'claude-haiku-4-5-20251001',
      );
      // model.byProvider 저장 확인 — user scope 원본에서 읽기
      expect(loadedSettings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'model.byProvider',
        expect.objectContaining({ claude: 'claude-haiku-4-5-20251001' }),
      );
    });

    it('preserves existing byProvider entries for other providers', () => {
      // user scope에 기존 { openai: 'gpt-4.1' } 존재
      saveModelForProvider(loadedSettings, 'claude', 'claude-opus-4-6');

      expect(lastByProviderArg).toEqual({
        openai: 'gpt-4.1',
        claude: 'claude-opus-4-6',
      });
    });

    it('reads from user scope only (not merged) — scope 오염 방지', () => {
      // merged에는 workspace에서 온 { gemini: 'gemini-2.5-pro' } 존재
      // user scope에는 byProvider 없음
      saveModelForProvider(loadedSettings, 'claude', 'claude-opus-4-6');

      // workspace의 gemini가 user에 복사되지 않아야 함
      expect(lastByProviderArg).toEqual({ claude: 'claude-opus-4-6' });
    });
  });
  ```

### Part C: startup model resolution 테스트

- [ ] **[RED-5]** `config.ts` startup에서 `byProvider` 우선 규칙 테스트

  ```typescript
  // config.test.ts 또는 별도 통합 테스트
  describe('startup model resolution with byProvider', () => {
    it('uses byProvider[activeProvider] over model.name', () => {
      // settings.model.name = 'gpt-4.1'
      // settings.model.byProvider.claude = 'claude-haiku-4-5-20251001'
      // LLM_PROVIDER = 'claude'
      // → resolvedModel should be 'claude-haiku-4-5-20251001'
    });

    it('falls back to model.name when byProvider is empty', () => {
      // settings.model.name = 'gpt-4.1'
      // settings.model.byProvider = {} or undefined
      // LLM_PROVIDER = 'claude'
      // → resolvedModel should be 'gpt-4.1'
    });

    it('LLM_MODEL still takes priority over byProvider', () => {
      // LLM_MODEL = 'custom-model'
      // settings.model.byProvider.claude = 'claude-haiku-4-5-20251001'
      // LLM_PROVIDER = 'claude'
      // → resolvedModel should be 'custom-model'
    });

    it('uses selectedProvider from settings when LLM_PROVIDER is unset', () => {
      // LLM_PROVIDER = undefined
      // settings.security.auth.selectedProvider = 'claude'
      // settings.model.byProvider.claude = 'claude-haiku-4-5-20251001'
      // → activeProvider = normalizeProviderKey('claude') = 'claude'
      // → resolvedModel should be 'claude-haiku-4-5-20251001'
    });

    it('skips byProvider when neither LLM_PROVIDER nor selectedProvider is set', () => {
      // LLM_PROVIDER = undefined
      // settings.security.auth.selectedProvider = undefined
      // settings.model.byProvider.claude = 'claude-haiku-4-5-20251001'
      // settings.model.name = 'gpt-4.1'
      // → activeProvider = undefined → byProvider 룩업 건너뜀
      // → resolvedModel should be 'gpt-4.1'
    });
  });
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli -- src/ui/utils/resolveActiveProvider.test  # FAIL
  npm test -w @didim365/agent-cli -- src/config/settings  # 신규 테스트 FAIL
  ```

---

## 2.3 GREEN Phase: 최소 코드 구현

### Part A: resolveActiveProvider

- [ ] **[TASK-001]** `resolveActiveProvider.ts` 생성
  - 파일: `packages/cli/src/ui/utils/resolveActiveProvider.ts` (신규)
  - 내용: `resolveActiveProvider()`, `normalizeProviderKey()`
  - 참고:
    [03_architecture_design.md §3.3.2](../detail_plan/03_architecture_design.md)

- [ ] **[GREEN-VERIFY-A]** resolveActiveProvider 테스트 통과
  ```bash
  npm test -w @didim365/agent-cli -- src/ui/utils/resolveActiveProvider.test  # PASS
  ```

### Part B: settings 스키마 + 헬퍼

- [ ] **[TASK-002]** `settingsSchema.ts`에 `model.byProvider` 스키마 추가
  - 파일: `packages/cli/src/config/settingsSchema.ts`
  - 위치: `model.properties` 섹션 (line ~743 이전)
  - 변경: `byProvider` 속성 추가 (type: 'object', optional, showInDialog: false)

- [ ] **[TASK-003]** `settings.ts`에 `saveModelForProvider()` 추가
  - 파일: `packages/cli/src/config/settings.ts`
  - 위치: `saveModelChange()` 아래
  - 핵심: `settings.forScope(SettingScope.User).settings`에서 user scope 원본
    읽기 (이슈 #11)

- [ ] **[GREEN-VERIFY-B]** settings 테스트 통과
  ```bash
  npm test -w @didim365/agent-cli -- src/config/settings  # PASS
  ```

### Part C: startup model resolution

- [ ] **[TASK-004]** `config.ts` startup model resolution 수정
  - 파일: `packages/cli/src/config/config.ts`
  - 위치: `specifiedModel` 결정 부분 (line ~659)
  - 변경: `(activeProvider && settings.model?.byProvider?.[activeProvider])`
    삽입
  - **activeProvider 산출**:
    `process.env['LLM_PROVIDER'] || normalizeProviderKey(settings.security?.auth?.selectedProvider) || undefined`
    — `selectedProvider`는 **merged scope**에서 읽기 (읽기 전용 → merged 적절).
    `byProvider` 쓰기의 user scope 전용(R5)과 구분. `LLM_PROVIDER`가 없고
    `selectedProvider`만 settings에 저장된 케이스도 커버. 둘 다 없으면
    `byProvider` 룩업 건너뜀
  - 참고:
    [03_architecture_design.md §3.7.3](../detail_plan/03_architecture_design.md)

- [ ] **[GREEN-VERIFY-C]** config 테스트 통과
  ```bash
  npm test -w @didim365/agent-cli -- src/config/config  # PASS
  ```

---

## 2.4 REFACTOR Phase: 코드 개선

- [ ] **[REFACTOR-STRUCTURE]** 코드 구조 개선
  - `resolveActiveProvider.ts`: `normalizeProviderKey` export 여부 결정
    (테스트용 export 필요 시)
  - `settings.ts`: `saveModelForProvider()`와 `saveModelChange()`의 에러 핸들링
    패턴 통일
  - `config.ts`: 변경 주변 주석 갱신 (우선순위 체인 설명)

- [ ] **[REFACTOR-VERIFY]** 리팩터링 후 테스트 재확인
  ```bash
  npm test -w @didim365/agent-cli  # 전체 CLI 테스트 PASS
  ```

---

## 2.5 사후 작업 (Post-Work)

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

- [ ] **[VERIFY]** 기능 검증
  - 확인 항목 1: `resolveActiveProvider('slm')` → `'openai-compatible'` — 이슈
    #1 키 정규화
  - 확인 항목 2: `resolveActiveProvider()` + `DIDIM_API_KEY` → `'didim'` — 이슈
    #9
  - 확인 항목 3: `saveModelForProvider()` user scope만 읽기 — 이슈 #11
  - 확인 항목 4: startup `byProvider[activeProvider]` 우선 — 이슈 #12
  - 확인 항목 5: 기존 settings 파일(byProvider 없음)에서 에러 없음 — 하위 호환

- [ ] **[DOC]** 작업 결과서 작성
  - 파일: `../working_history/Phase2_cli_provider_detect_settings_{작업일자}.md`

- [ ] **[COMMIT]** 변경사항 커밋

  ```bash
  # 1차 커밋: resolveActiveProvider 신규 (구조적 변경)
  git add packages/cli/src/ui/utils/resolveActiveProvider.ts packages/cli/src/ui/utils/resolveActiveProvider.test.ts
  git commit -m "feat(cli): add resolveActiveProvider util — multi-source provider detection"

  # 2차 커밋: settings 스키마 + 헬퍼 + startup (동작 변경)
  git add packages/cli/src/config/settingsSchema.ts packages/cli/src/config/settings.ts packages/cli/src/config/config.ts
  git commit -m "feat(cli): add model.byProvider schema + saveModelForProvider + startup resolution"
  ```

---

## Phase 완료 조건

| 검증 항목                                       | 상태 |
| ----------------------------------------------- | ---- |
| RED: resolveActiveProvider 테스트 작성          | ⬜   |
| GREEN: resolveActiveProvider 구현 + 통과        | ⬜   |
| RED: settings 스키마/헬퍼 테스트 작성           | ⬜   |
| GREEN: settingsSchema + settings.ts 구현 + 통과 | ⬜   |
| RED: startup resolution 테스트 작성             | ⬜   |
| GREEN: config.ts 수정 + 통과                    | ⬜   |
| REFACTOR: 구조 개선                             | ⬜   |
| Lint + Typecheck 통과                           | ⬜   |
| Phase 1 회귀 없음                               | ⬜   |
| 작업 결과서 작성                                | ⬜   |
| 커밋 완료                                       | ⬜   |

---

**작성일**: 2026-02-15 **상태**: ⬜ 작성 중
