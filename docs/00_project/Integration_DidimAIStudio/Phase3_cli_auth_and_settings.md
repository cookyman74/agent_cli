# Phase 3: CLI — Auth UI + Settings 확장

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 테스트
> 먼저 작성 → 최소 코드 구현 → 리팩터링 **리팩터링 원칙**: "Make it work → Make
> it right → Make it fast" **참고 문서**:
>
> - [99_TDD_plan.md](../../multi_provider_model_select/template/99_TDD_plan.md)
>   — TDD 방법론
> - [Phase2 결과서](./working_history/) — 이전 Phase 결과 검토
> - [DidimAIStudio 연동 가이드](../../../../docs/temp_howto_develop_integration_didimaistudio.md)
>   — §3, §7, §8

---

## 작업 개요

| 항목        | 내용                                                          |
| ----------- | ------------------------------------------------------------- |
| 프로젝트    | DidimAIStudio 연동 — Auth UI + Settings 확장                  |
| 영향 범위   | Auth 상태머신 전체, 다이얼로그, providerMetadata, 설정 스키마 |
| 위험 수준   | 🟠 Medium-High — Auth 상태머신 전체 변경 + 설정 영속화        |
| 성능 민감도 | 🟢 Low — UI/설정 로직                                         |
| 참고 설계   | 기존 Auth 다이얼로그 패턴 (Ink components)                    |
| 작업 브랜치 | `DID/v0.3`                                                    |

---

## 핵심 리스크 요약

| 리스크                                      | 영향      | 대응 방안                                                    | 상태 |
| ------------------------------------------- | --------- | ------------------------------------------------------------ | ---- |
| Auth 상태머신 전체 변경으로 기존 흐름 깨짐  | 🟠 Medium | AuthState + AppContainer + DialogManager + useAuth 전수 변경 | ⬜   |
| Didim 설정 정규화로 사용자 설정 영구 손실   | 🔴 High   | "일시적 무시" 패턴 적용 (settings.json 덮어쓰기 금지)        | ⬜   |
| JWT 토큰 UI 노출 (TextInput masking 미지원) | 🟡 Medium | 커스텀 MaskedTextInput 구현 또는 truncated 표시 패턴         | ⬜   |
| 기존 settings 파싱 오류 (didimConfig 추가)  | 🟡 Medium | optional 필드 + slmConfig/vertexConfig 패턴 참고             | ⬜   |
| providerMetadata 주석/동작 모순             | 🟢 Low    | 주석 수정 + 실제 동작에 맞게 정리                            | ⬜   |

---

## 3.1 사전 작업 (Pre-Work)

- [ ] **[REVIEW]** Phase 2 작업 결과서 검토
  - 파일: `./working_history/Phase2_core_didim_adapter_{작업일자}.md`
  - 확인: DidimAdapter 동작 확인, contentGenerator 등록 완료

- [ ] **[CONTEXT]** Phase 3 작업 목적 확인
  - ComingSoon → 실제 Auth 다이얼로그 전환
  - **Auth 상태머신 전체 변경** (1팀 Issue #2 대응)
  - JWT 토큰 + 서버 도메인 + 스트림 모드 입력 UI
  - Didim 전용 설정 영속화 (didimConfig 객체)
  - 설정 "일시적 무시" 패턴 구현 (영구 삭제 방지)

- [ ] **[ANALYSIS-1]** Auth 상태머신 전수 분석 (1팀 Issue #2 + 2팀 Issue #2
      대응)

  > **⚠️ 2팀 Issue #2 대응**: `isPreviewingDidimStudio`는 9개 위치에 분산되어
  > 있다. 1곳이라도 누락하면 상태 불일치로 런타임 오류 발생 가능.
  - `isPreviewingDidimStudio` / `PreviewingDidimStudio` **전수 참조 목록
    (9곳)**:

    | #   | 파일                                               | 라인       | 역할                                                        |
    | --- | -------------------------------------------------- | ---------- | ----------------------------------------------------------- | --- | ----------- |
    | 1   | `packages/cli/src/ui/types.ts`                     | 43         | AuthState enum 정의                                         |
    | 2   | `packages/cli/src/ui/contexts/UIStateContext.tsx`  | 68         | UIState 인터페이스 `isPreviewingDidimStudio: boolean`       |
    | 3   | `packages/cli/src/ui/AppContainer.tsx`             | 581        | `const isPreviewingDidimStudio = authState === ...` 파생    |
    | 4   | `packages/cli/src/ui/AppContainer.tsx`             | 869        | `setAuthState(AuthState.PreviewingDidimStudio)` 전환 트리거 |
    | 5   | `packages/cli/src/ui/AppContainer.tsx`             | 1326       | `!isPreviewingDidimStudio &&` 초기 프롬프트 조건            |
    | 6   | `packages/cli/src/ui/AppContainer.tsx`             | 1342       | `isPreviewingDidimStudio,` useEffect 의존성                 |
    | 7   | `packages/cli/src/ui/AppContainer.tsx`             | 1785       | `isPreviewingDidimStudio                                    |     | ` 조건 체크 |
    | 8   | `packages/cli/src/ui/AppContainer.tsx`             | 1870, 1972 | useCallback 의존성 배열                                     |
    | 9   | `packages/cli/src/ui/components/DialogManager.tsx` | 275        | `if (uiState.isPreviewingDidimStudio)` → ComingSoon 렌더링  |

  - 추가 관련 파일:
    - `packages/cli/src/ui/auth/useAuth.ts:281` — Didim 자동감지 로직
    - `packages/cli/src/ui/auth/DidimStudioComingSoonDialog.tsx` — 현재 Coming
      Soon UI
    - `packages/cli/src/test-utils/render.tsx` — 테스트 유틸 mock
      (handleDidimConfigComplete 추가 필요)
    - `packages/cli/src/ui/AppContainer.test.tsx` — 관련 테스트 업데이트 필요

  - 확인: **전체 auth flow**: 프로바이더 선택 → AuthState 전환 → DialogManager
    렌더링 → 인증 완료
  - **현재 문제**: Didim 선택 시 무조건 `PreviewingDidimStudio` → ComingSoon으로
    빠지며, 실제 인증 흐름(`AwaitingApiKeyInput` 등)으로 진입하지 않음

- [ ] **[ANALYSIS-2]** providerMetadata 현재 상태 분석
  - 파일: `packages/cli/src/ui/auth/providerMetadata.ts`
  - 확인: `didim-studio` 엔트리의 `envVarName: ''`, `keychainEntry: ''` 빈값
  - 확인: **주석 모순** (1팀 Issue #8) — 주석은 "hidden from user
    selection"이지만 `PROVIDER_SELECT_ITEMS`에 `'didim-studio'` 포함됨

- [ ] **[ANALYSIS-3]** 설정 스키마 분석 (1팀 Issue #3 대응)
  - 파일: `packages/cli/src/config/settingsSchema.ts`
  - 확인: 현재 Didim 전용 필드 **없음** — `didimStreamMode`,
    `didimServerAddress`, `systemRole`, `useThinking`, `useVisionMode` 모두
    미존재
  - 참고: `slmConfig` (line 1372-1421), `vertexConfig` (line 1423-1449) 패턴 —
    **`didimConfig` 객체로 동일 패턴 적용**

- [ ] **[ANALYSIS-4]** TextInput masking 가능성 분석 (1팀 Issue #5 대응)
  - 파일: `packages/cli/src/ui/components/shared/TextInput.tsx:17`
  - 확인: `TextInputProps`에 `masked`/`password` 옵션 **없음**
  - 참고: 현재 모든 프로바이더(Gemini, Claude, OpenAI)도 API key 평문 입력
  - 대안 검토: 커스텀 MaskedTextInput 또는 truncated display 패턴

- [ ] **[REGRESSION]** Phase 1~2 회귀 테스트 실행
  ```bash
  npm test -w @didim365/agent-cli-core -- --run src/providers/didim/
  ```

---

## 3.2 RED Phase (Part A): Auth 다이얼로그 + 상태머신 테스트

> **목적**: Didim Auth 다이얼로그 및 상태머신 전환의 실패 테스트 작성

- [ ] **[RED-1]** DidimStudioAuthDialog 렌더링 테스트

  ```typescript
  // packages/cli/src/ui/auth/DidimStudioAuthDialog.test.tsx

  describe('DidimStudioAuthDialog', () => {
    it('should render domain input field', () => {
      const { lastFrame } = render(<DidimStudioAuthDialog onComplete={vi.fn()} />);
      expect(lastFrame()).toContain('Server Domain');
    });

    it('should render JWT token input field with masking', () => {
      // 2팀 Issue #7 대응: 라벨 존재뿐 아닌 실제 마스킹 동작 검증
      const { lastFrame } = render(<DidimStudioAuthDialog onComplete={vi.fn()} />);
      expect(lastFrame()).toContain('JWT Token');
    });

    it('should not display JWT token in plaintext after input', () => {
      // 2팀 Issue #7 대응: 입력 후 화면에 토큰 원문이 노출되지 않는지 검증
      // 구현 방식에 따라:
      // - MaskedTextInput: 렌더 결과에 'eyJhbGciOi...' 원문이 포함되지 않아야 함
      // - Truncated display: 'eyJh...xyz0' 형식으로만 표시
      const { lastFrame, stdin } = render(
        <DidimStudioAuthDialog onComplete={vi.fn()} />,
      );
      // JWT 토큰 입력 시뮬레이션 (구현 시 실제 입력 필드 포커스 방식에 맞게 조정)
      // stdin.write('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      // expect(lastFrame()).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('should render stream mode selector', () => {
      const { lastFrame } = render(<DidimStudioAuthDialog onComplete={vi.fn()} />);
      expect(lastFrame()).toContain('Stream Mode');
    });

    // 2팀 Issue #5 대응: defaultConfig prefill 테스트
    it('should prefill fields from defaultConfig when re-entering auth', () => {
      const defaultConfig = {
        serverAddress: 'aistudio.didim365.com',
        streamMode: 'improved' as const,
      };
      const { lastFrame } = render(
        <DidimStudioAuthDialog onComplete={vi.fn()} defaultConfig={defaultConfig} />
      );
      expect(lastFrame()).toContain('aistudio.didim365.com');
      // streamMode도 'improved'로 사전 선택되어야 함
    });
  });
  ```

- [ ] **[RED-2]** Auth 다이얼로그 저장 테스트

  ```typescript
  describe('DidimStudioAuthDialog save flow', () => {
    it('should call onComplete with domain, apiKey, streamMode', async () => {
      const onComplete = vi.fn();
      // 입력 시뮬레이션 후 저장
      // onComplete가 { serverAddress, apiKey, streamMode } 으로 호출되는지 검증
    });

    it('should validate domain is not empty', async () => {
      // 빈 도메인 → 에러 메시지 표시
    });

    it('should validate JWT token is not empty', async () => {
      // 빈 토큰 → 에러 메시지 표시
    });
  });
  ```

- [ ] **[RED-2B]** Auth 저장 계약(save contract) 테스트 (2팀 Issue #2 — High)

  > **⚠️ 핵심**: UI 표면 확인만으로는 부족하다. Didim 인증 완료 시 실제로
  > 수행되어야 하는 저장 계약을 직접 검증해야 한다. 기존 SLM/Vertex 인증도
  > AppContainer의 completion handler(handleSlmConfigComplete,
  > handleVertexConfigComplete)에서 이 저장 로직을 처리한다.

  ```typescript
  // packages/cli/src/ui/AppContainer.test.tsx (또는 별도 통합 테스트)

  describe('handleDidimConfigComplete — auth save contract', () => {
    it('should save didimConfig to settings (security.auth.didimConfig)', async () => {
      // handleDidimConfigComplete 호출 후
      // settings에 { security: { auth: { didimConfig: { serverAddress, streamMode } } } } 저장 확인
      const config = {
        serverAddress: 'aistudio.didim365.com',
        apiKey: 'test-jwt-token',
        streamMode: 'improved' as const,
      };

      await capturedUIActions.handleDidimConfigComplete(config);

      // settings 저장 함수가 didimConfig 포함하여 호출되었는지 검증
      expect(mockSaveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          security: expect.objectContaining({
            auth: expect.objectContaining({
              didimConfig: expect.objectContaining({
                serverAddress: 'aistudio.didim365.com',
                streamMode: 'improved',
              }),
            }),
          }),
        }),
      );
    });

    it('should set DIDIM_API_KEY environment variable', async () => {
      const config = {
        serverAddress: 'aistudio.didim365.com',
        apiKey: 'test-jwt-token',
        streamMode: 'sse' as const,
      };

      await capturedUIActions.handleDidimConfigComplete(config);

      expect(process.env['DIDIM_API_KEY']).toBe('test-jwt-token');
    });

    it('should set LLM_PROVIDER to didim', async () => {
      const config = {
        serverAddress: 'aistudio.didim365.com',
        apiKey: 'test-jwt-token',
        streamMode: 'sse' as const,
      };

      await capturedUIActions.handleDidimConfigComplete(config);

      // selectedProvider 또는 LLM_PROVIDER가 'didim'으로 설정되었는지 검증
      expect(mockSaveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedProvider: 'didim',
        }),
      );
    });

    it('should persist didimConfig across restart (settings.json roundtrip)', async () => {
      // 저장된 settings를 재로드했을 때 didimConfig가 복원되는지 검증
      // handleVertexConfigComplete 테스트 패턴 참조 (AppContainer.test.tsx:2505)
    });

    it('should transition auth state to authenticated after save', async () => {
      const config = {
        serverAddress: 'aistudio.didim365.com',
        apiKey: 'test-jwt-token',
        streamMode: 'sse' as const,
      };

      await capturedUIActions.handleDidimConfigComplete(config);

      // auth 상태가 인증 완료 상태로 전환되었는지 검증
    });
  });
  ```

- [ ] **[RED-3]** Auth 상태머신 전환 테스트 (1팀 Issue #2 대응)

  ```typescript
  describe('Auth state machine — Didim flow', () => {
    it('should transition to AuthenticatingDidim state on didim-studio selection', () => {
      // AppContainer에서 providerKey === 'didim-studio' 선택 시
      // AuthState.PreviewingDidimStudio가 아닌 새로운 AuthState로 전환
    });

    it('should render DidimStudioAuthDialog in DialogManager for Didim auth state', () => {
      // DialogManager가 새로운 Didim 인증 상태에서
      // ComingSoon이 아닌 DidimStudioAuthDialog를 렌더링
    });

    it('should complete auth and return to main on successful Didim login', () => {
      // onComplete 후 AuthState.Authenticated 등으로 전환
    });
  });
  ```

- [ ] **[RED-VERIFY-A]** Part A 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli -- --run src/ui/auth/DidimStudioAuthDialog.test.tsx
  ```

---

## 3.3 GREEN Phase (Part A): Auth 다이얼로그 + 상태머신 구현

- [ ] **[TASK-001]** JWT 토큰 입력 마스킹 대응 (1팀 Issue #5)
  - **방법 A**: 커스텀 `MaskedTextInput` 컴포넌트 생성
    - 기존 `TextInput` 래핑, 표시 시 `•` 문자로 대체
  - **방법 B**: 입력값 truncated 표시 (앞 4자 + `...` + 뒤 4자)
  - **방법 C**: 별도 입력 패턴 없이 보안 경고 메시지 표시
  - ⚠️ 현재 모든 프로바이더가 평문 API key 입력이므로, Didim만 별도 처리할지
    프로젝트 전체 TextInput 확장으로 갈지 판단 필요

- [ ] **[TASK-002]** DidimStudioAuthDialog 컴포넌트 생성
  - 파일: `packages/cli/src/ui/auth/DidimStudioAuthDialog.tsx`
  - 입력 필드:
    - Server Domain (TextInput) — placeholder: `aistudio.didim365.com`
    - JWT Token (MaskedTextInput 또는 TextInput) — placeholder: `eyJhbGciOi...`
    - Stream Mode (Select) — `sse` | `improved`
  - 저장 버튼 → `onComplete(settings)` 호출
  - ESC → `onCancel()` 호출

- [ ] **[TASK-003]** Auth 상태머신 변경 (1팀 Issue #2 + 2팀 Issue #2 대응 — 핵심
      변경)

  > **⚠️ 전수 변경 필수**: `isPreviewingDidimStudio`가 9곳에 분산 (ANALYSIS-1
  > 참조). 리네임은 IDE "Find and Replace in Files" 또는 `rg` 전역 검색으로
  > 수행하고, 변경 후 `npm run typecheck -w @didim365/agent-cli`로 누락 확인.

  **변경 1**: `packages/cli/src/ui/types.ts:43`
  - `AuthState.PreviewingDidimStudio` → `AuthState.AuthenticatingDidim` 으로
    변경
  - 주석 업데이트: "Step 2E: Authenticating DidimAIStudio"

  **변경 2**: `packages/cli/src/ui/contexts/UIStateContext.tsx:68`
  - `isPreviewingDidimStudio: boolean` → `isAuthenticatingDidim: boolean`

  **변경 3**: `packages/cli/src/ui/AppContainer.tsx` — **7곳 일괄 변경**
  - Line 581: `const isPreviewingDidimStudio` → `const isAuthenticatingDidim`
  - Line 869: `setAuthState(AuthState.PreviewingDidimStudio)` →
    `setAuthState(AuthState.AuthenticatingDidim)`
  - Line 1326: `!isPreviewingDidimStudio` → `!isAuthenticatingDidim`
  - Line 1342: `isPreviewingDidimStudio,` → `isAuthenticatingDidim,`
  - Line 1785: `isPreviewingDidimStudio ||` → `isAuthenticatingDidim ||`
  - Line 1870, 1972: `isPreviewingDidimStudio,` → `isAuthenticatingDidim,`

  **변경 4**: `packages/cli/src/ui/components/DialogManager.tsx:275`
  - 변경 전: `uiState.isPreviewingDidimStudio` → `DidimStudioComingSoonDialog`
    렌더링
  - 변경 후: `uiState.isAuthenticatingDidim` → `DidimStudioAuthDialog` 렌더링
  - `onComplete` 콜백: `uiActions.handleDidimConfigComplete` 연결 (TASK-003B
    참조)
  - `defaultConfig` prop: `settings.merged.security?.auth?.didimConfig` 전달
    (2팀 Issue #5 대응)

  **변경 5**: `packages/cli/src/ui/auth/useAuth.ts`
  - Didim 인증 완료 시 `DIDIM_API_KEY` env 설정
  - `didimConfig` settings 저장 연동
  - 자동감지 로직 (`DIDIM_API_KEY` 존재 시) 유지/보강

  **변경 6**: `packages/cli/src/test-utils/render.tsx`
  - mock UIActions에 `handleDidimConfigComplete: vi.fn()` 추가
  - `isPreviewingDidimStudio` → `isAuthenticatingDidim` mock 상태 변경

- [ ] **[TASK-003B]** `handleDidimConfigComplete` UIActions 핸들러 추가 (2팀
      Issue #3 대응)

  > **패턴 참조**: `handleSlmConfigComplete` (AppContainer.tsx:719),
  > `handleVertexConfigComplete` (AppContainer.tsx:795)

  **변경 1**: `packages/cli/src/ui/contexts/UIActionsContext.tsx`
  - UIActions 인터페이스에 추가:
    ```typescript
    handleDidimConfigComplete: (config: {
      serverAddress: string;
      apiKey: string;
      streamMode: 'sse' | 'improved';
    }) => Promise<void>;
    ```

  **변경 2**: `packages/cli/src/ui/AppContainer.tsx`
  - `handleDidimConfigComplete` useCallback 구현 (handleSlmConfigComplete 패턴
    참조):
    ```typescript
    const handleDidimConfigComplete = useCallback(
      async (config: {
        serverAddress: string;
        apiKey: string;
        streamMode: 'sse' | 'improved';
      }) => {
        // 1. DIDIM_API_KEY env 설정
        // 2. didimConfig를 settings에 저장 (security.auth.didimConfig)
        // 3. LLM_PROVIDER=didim 설정
        // 4. auth 상태 완료 전환
      },
      [...deps],
    );
    ```
  - `uiActions` useMemo에 `handleDidimConfigComplete` 추가

  **변경 3**: `packages/cli/src/ui/components/DialogManager.tsx`
  - DidimStudioAuthDialog에 `onComplete={uiActions.handleDidimConfigComplete}`
    연결
  - `defaultConfig` prop으로 기존 didimConfig 전달 (2팀 Issue #5 대응):
    ```typescript
    const didimConfig = settings?.merged?.security?.auth?.didimConfig;
    // ...
    <DidimStudioAuthDialog
      onComplete={uiActions.handleDidimConfigComplete}
      onCancel={uiActions.handleCancelAuth}
      defaultConfig={didimConfig}
    />
    ```

  **변경 4**: `packages/cli/src/test-utils/render.tsx`
  - `handleDidimConfigComplete: vi.fn()` 추가

  **변경 5**: `packages/cli/src/ui/AppContainer.test.tsx`
  - `handleDidimConfigComplete` 동작 테스트 추가 (handleVertexConfigComplete
    테스트 패턴 참조)

- [ ] **[TASK-004]** providerMetadata 업데이트
  - 파일: `packages/cli/src/ui/auth/providerMetadata.ts`
  - 변경: `envVarName: 'DIDIM_API_KEY'` 설정
  - **주석 모순 수정** (1팀 Issue #8):
    - 변경 전: "Didim provider is hidden from user selection"
    - 변경 후: "Didim provider is shown in user selection and activated via auth
      dialog or DIDIM_API_KEY env var"
  - 필요 시 추가 메타데이터 업데이트

- [ ] **[TASK-005]** DidimStudioComingSoonDialog 정리
  - 파일 삭제 또는 deprecation 처리
  - 사용처 전수 확인 (전역 검색: `DidimStudioComingSoon`, `ComingSoonDialog`)
  - DialogManager 등 모든 import 경로 DidimStudioAuthDialog로 교체

- [ ] **[GREEN-VERIFY-A]** Part A 테스트 통과 확인
  ```bash
  npm test -w @didim365/agent-cli -- --run src/ui/auth/DidimStudioAuthDialog.test.tsx
  ```

---

## 3.4 RED Phase (Part B): Settings 확장 테스트

> **⚠️ 핵심 설계 변경 (1팀 Issue #3 + 2팀 Issue #3 대응)**:
>
> - 현재 settingsSchema에 Didim 전용 필드가 **전혀 없음**
> - `slmConfig`, `vertexConfig`와 동일한 패턴으로 `didimConfig` 객체를 추가
> - 설정 정규화는 **"일시적 무시"** 패턴 적용 — settings.json을 직접 덮어쓰지
>   않음

- [ ] **[RED-4]** Didim 전용 설정 스키마 테스트

  > **⚠️ 2팀 Issue #4 대응**: `didimConfig`의 올바른 설정 경로는
  > `security.auth.didimConfig`이다. `slmConfig` (settingsSchema.ts:1372),
  > `vertexConfig` (settingsSchema.ts:1423) 패턴 참조. 최상위 `didimConfig`가
  > 아닌 `security.auth.didimConfig`에 위치해야 한다.

  ```typescript
  describe('Didim settings schema (security.auth.didimConfig)', () => {
    it('should accept didimConfig.streamMode field', () => {
      const settings = loadSettings({
        security: {
          auth: {
            didimConfig: { streamMode: 'improved' },
          },
        },
      });
      expect(settings.security?.auth?.didimConfig?.streamMode).toBe('improved');
    });

    it('should accept didimConfig.serverAddress field', () => {
      const settings = loadSettings({
        security: {
          auth: {
            didimConfig: { serverAddress: 'aistudio.didim365.com' },
          },
        },
      });
      expect(settings.security?.auth?.didimConfig?.serverAddress).toBe(
        'aistudio.didim365.com',
      );
    });

    it('should default didimConfig.streamMode to "sse"', () => {
      const settings = loadSettings({
        security: { auth: { didimConfig: {} } },
      });
      expect(settings.security?.auth?.didimConfig?.streamMode).toBe('sse');
    });

    it('should persist didimConfig across restart', () => {
      // settings.json의 security.auth.didimConfig 저장 → 재로드 시 복원
      // Phase 4 E2E-04 시나리오의 기반
    });
  });
  ```

- [ ] **[RED-5]** Didim 설정 "일시적 무시" 테스트 (2팀 Issue #3 + 2팀 Issue #7
      대응)

  > **⚠️ 2팀 Issue #7 대응**: 현재 `settingsSchema.ts`에 `systemRole`,
  > `useThinking`, `useVisionMode` 필드는 **존재하지 않는다**. 이 필드명들은
  > 설계서에서 가정한 플레이스홀더이며, 실제 settingsSchema를 분석하여 Didim
  > 비호환 필드를 식별해야 한다.
  >
  > **PRE-WORK**: GREEN 구현 전에 `settingsSchema.ts`를 전수 분석하여 아래를
  > 확인:
  >
  > 1. Didim 프로바이더에서 무의미한 설정 필드 목록 (예: Gemini 전용 모델 설정
  >    등)
  > 2. 해당 필드들이 실제 어떤 이름과 경로로 존재하는지
  > 3. 런타임 오버라이드가 필요한 필드와 UI 비활성화만 필요한 필드 구분
  >
  > **현 시점에서 확실한 Didim 제약**:
  >
  > - 모델 선택 불가 (`modelSelectionDisabled: true` — 기존 구현)
  > - 도구 호출 미지원 (`supportsToolCalls: false`)
  > - 이미지 입력 미지원 (`supportsImageInput: false`)

  ```typescript
  describe('Didim settings constraint overlay (temporary ignore pattern)', () => {
    // ⚠️ 아래 테스트의 필드명(systemRole 등)은 플레이스홀더.
    // GREEN 구현 시 실제 settingsSchema 필드명으로 교체 필요.

    it('should NOT permanently modify user settings when switching to didim', () => {
      // 사용자가 Gemini 전용 설정을 가진 상태에서
      // 프로바이더를 didim으로 변경
      // → settings.json 원본은 변경되지 않아야 함
      // → 런타임에서만 해당 설정 무시
    });

    it('should restore all original settings when switching back from didim', () => {
      // didim → gemini 전환 시 원래 설정 자동 복원
      // (settings.json이 변경되지 않았으므로 별도 복원 로직 불필요)
    });

    it('should return Didim-constrained effective settings via getEffectiveSettings', () => {
      // getEffectiveSettings('didim') 호출 시
      // Didim 비호환 필드들이 오버라이드된 값 반환
      // settings.json 원본은 그대로 유지
    });
  });
  ```

  > **구현 방향**: 프로바이더가 didim일 때 `getEffectiveSettings(provider)` 같은
  > 래퍼 함수에서 런타임 오버라이드를 적용. `settings.json` 파일은 절대 변경하지
  > 않음. 이로써 다른 프로바이더로 전환 시 사용자의 원래 설정이 자동 복원됨.
  >
  > **1팀 권장사항 대응**: `getEffectiveSettings` 래퍼의 일관된 적용을 보장하기
  > 위해, Didim 모드에서 설정을 읽는 모든 지점이 이 래퍼를 경유하도록 강제한다.
  > 직접 `settings.json`을 읽어 사용하는 코드가 있다면 래퍼 경유로 전환해야
  > 한다.

- [ ] **[RED-VERIFY-B]** Part B 테스트 실패 확인

---

## 3.5 GREEN Phase (Part B): Settings 구현

- [ ] **[TASK-006]** 설정 스키마에 `didimConfig` 객체 추가 (1팀 Issue #3 + 2팀
      Issue #4 대응)
  - 파일: `packages/cli/src/config/settingsSchema.ts`
  - **패턴**: `slmConfig` (line 1372-1421), `vertexConfig` (line 1423-1449)와
    동일
  - **위치**: `security.auth.didimConfig` (최상위가 아닌 `security.auth` 하위)
  - 추가 필드 (didimConfig 내부):
    - `streamMode: 'sse' | 'improved'` (기본값: `'sse'`)
    - `serverAddress: string` (기본값: `''`)
  - 전체 `didimConfig` 는 optional — 기존 settings 파싱에 영향 없음

- [ ] **[TASK-007]** Didim 설정 "일시적 무시" 로직 구현 (2팀 Issue #3 + 2팀
      Issue #7 대응)
  - **핵심 원칙**: settings.json을 직접 덮어쓰지 않음 → 사용자 설정 영구 손실
    방지
  - **⚠️ 2팀 Issue #7 대응**: `systemRole`, `useThinking`, `useVisionMode`는
    현재 settingsSchema에 존재하지 않는 플레이스홀더 필드명이다. GREEN 구현 전에
    실제 settingsSchema를 분석하여 Didim 비호환 필드를 식별해야 한다.
  - 구현:
    - `getEffectiveSettings(provider: ProviderType)` 또는 유사 래퍼 함수
    - PRE-WORK에서 식별된 실제 Didim 비호환 필드들에 대해:
      - 런타임에서만 오버라이드 (파일 미변경)
    - 다른 프로바이더로 전환 시 → 원래 설정 자동 복원 (파일이 변경되지
      않았으므로)
  - **1팀 권장사항**: `getEffectiveSettings` 래퍼의 일관적 적용 보장 — 설정
    접근점이 래퍼를 경유하도록 강제
  - `didimConfig.serverAddress` → `normalizeDidimDomain()` 적용 (저장 시점)

- [ ] **[TASK-008]** Auth 다이얼로그 → 설정 저장 연결
  - `onComplete` 콜백에서:
    - `DIDIM_API_KEY` env 설정
    - `didimConfig.serverAddress`, `didimConfig.streamMode` settings 저장
  - 저장 경로: 기존 settings 저장 패턴과 동일하게 `didimConfig` 객체로 저장

- [ ] **[GREEN-VERIFY-B]** Part B 테스트 통과 확인

---

## 3.6 REFACTOR Phase: 코드 개선

- [ ] **[REFACTOR-STRUCTURE]** 코드 구조 개선
  - DidimStudioComingSoonDialog 파일 삭제 (사용처 0건 확인 후)
  - Auth 다이얼로그 컴포넌트 분리 (입력 필드별 sub-component)
  - 설정 "일시적 무시" 로직 → 재사용 가능한 유틸 함수로 추출
  - providerMetadata 주석 정리 (모순 해소)

- [ ] **[REFACTOR-VERIFY]** 리팩터링 후 테스트 재확인
  ```bash
  npm test -w @didim365/agent-cli -- --run src/ui/auth/
  ```

---

## 3.7 사후 작업 (Post-Work)

- [ ] **[TEST]** 전체 CLI 테스트 실행

  ```bash
  npm test -w @didim365/agent-cli -- --run
  ```

- [ ] **[TYPECHECK]** 타입 검사

  ```bash
  npm run typecheck -w @didim365/agent-cli
  ```

- [ ] **[LINT]** 린터 검사

  ```bash
  npm run lint -w @didim365/agent-cli
  ```

- [ ] **[BUILD]** 전체 빌드 확인

  ```bash
  npm run build
  ```

- [ ] **[REGRESSION]** Phase 1~2 회귀 테스트

  ```bash
  npm test -w @didim365/agent-cli-core -- --run src/providers/didim/
  ```

- [ ] **[VERIFY]** 기능 검증
  - 확인 항목 1: `/auth login` → DidimAIStudio 선택 시 실제 Auth 다이얼로그 표시
    (Coming Soon 아님)
  - 확인 항목 2: JWT 토큰 + 도메인 저장 → `DIDIM_API_KEY` env 설정 +
    `didimConfig` 영속화
  - 확인 항목 3: Didim 모드에서 비활성 설정 항목이 **런타임에서만** 무시됨
    (settings.json 원본 유지 확인)
  - 확인 항목 4: 프로바이더 전환 (Didim → Gemini) 시 원래 설정 자동 복원
  - 확인 항목 5: 재시작 후 `didimConfig` 설정 영속화 확인

- [ ] **[DOC]** 작업 결과서 작성
  - 파일: `./working_history/Phase3_cli_auth_and_settings_{작업일자}.md`

- [ ] **[COMMIT]** 변경사항 커밋 (Tidy First)
  ```bash
  # 구조적 변경
  git commit -m "feat(cli): add DidimStudioAuthDialog — JWT + domain input UI"
  # 동작 변경
  git commit -m "feat(cli): replace ComingSoon with actual Didim auth flow + settings"
  ```

---

## ⚠️ 주의사항

### Auth 상태머신 변경 범위 (1팀 Issue #2 대응)

> **핵심**: Phase 3에서는 providerMetadata와 다이얼로그 파일만 수정하는 것으로는
> 부족하다. **Auth 상태머신 전체**를 변경해야 한다.

변경 필요 파일 전수 목록 (2팀 Issue #2, #3 대응으로 확장):

| #   | 파일                                                       | 변경 내용                                                            |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | `packages/cli/src/ui/types.ts:43`                          | AuthState enum — PreviewingDidimStudio → AuthenticatingDidim         |
| 2   | `packages/cli/src/ui/contexts/UIStateContext.tsx:68`       | UIState 인터페이스 — isPreviewingDidimStudio → isAuthenticatingDidim |
| 3   | `packages/cli/src/ui/contexts/UIActionsContext.tsx`        | UIActions 인터페이스 — handleDidimConfigComplete 추가                |
| 4   | `packages/cli/src/ui/AppContainer.tsx` (7곳)               | isPreviewingDidimStudio 리네임 + handleDidimConfigComplete 구현      |
| 5   | `packages/cli/src/ui/components/DialogManager.tsx:275`     | ComingSoon → AuthDialog + onComplete + defaultConfig                 |
| 6   | `packages/cli/src/ui/auth/useAuth.ts`                      | Didim 인증 완료 처리 + env 설정                                      |
| 7   | `packages/cli/src/ui/auth/providerMetadata.ts`             | envVarName + 주석 수정                                               |
| 8   | `packages/cli/src/ui/auth/DidimStudioAuthDialog.tsx`       | 신규 Auth 다이얼로그 (defaultConfig prop 포함)                       |
| 9   | `packages/cli/src/ui/auth/DidimStudioComingSoonDialog.tsx` | 삭제                                                                 |
| 10  | `packages/cli/src/test-utils/render.tsx`                   | mock UIActions에 handleDidimConfigComplete 추가                      |
| 11  | `packages/cli/src/ui/AppContainer.test.tsx`                | handleDidimConfigComplete 테스트 추가                                |

### JWT 토큰 입력 보안 (1팀 Issue #5 대응)

> 현재 `TextInput` 컴포넌트(`TextInput.tsx:17`)에는 `masked`/`password` 옵션이
> **없다**. 기존 모든 프로바이더(Gemini, Claude, OpenAI)도 API key를 평문
> 입력한다.
>
> **선택지**:
>
> 1. Didim만 커스텀 `MaskedTextInput` 구현 (입력 표시 시 `•` 문자 대체)
> 2. 전체 TextInput에 `masked` prop 추가 (범위 확장)
> 3. JWT 입력 후 truncated 표시 (`eyJh...xyz0`)
> 4. 보안 경고만 표시 (최소 조치)
>
> 구현 시점에서 복잡도와 영향 범위를 고려하여 결정한다.

### Settings 설계 원칙 (1팀 Issue #3 + 2팀 Issue #3 대응)

> **⚠️ 가장 중요한 원칙: 사용자 설정을 영구적으로 삭제하지 않는다.**

1. **didimConfig 객체 패턴**: `slmConfig`, `vertexConfig`와 동일한 구조로
   `security.auth.didimConfig` 설정 객체를 추가한다 (settingsSchema 기존 패턴
   준수)
2. **일시적 무시 패턴**: Didim 프로바이더 활성 시 비호환 설정을 **런타임에서만**
   무시한다. `settings.json`을 직접 수정하여 비우면 다른 프로바이더로 전환 시
   복구 불가능.
   - ⚠️ `systemRole`, `useThinking`, `useVisionMode`는 현재 settingsSchema에
     미존재. GREEN 구현 시 실제 Didim 비호환 필드를 settingsSchema 분석으로 식별
     필요.
3. **optional 필드**: 기존 settings 파싱에 영향 주지 않도록 모두 optional +
   기본값
4. **프로바이더 격리**: Didim 설정은 `security.auth.didimConfig` 네임스페이스
   안에 격리
5. **영속화**: `didimConfig`는 settings.json에 저장되어 재시작 후에도 유지
   (Phase 4 E2E-04 시나리오 전제 조건)
6. **defaultConfig prefill** (2팀 Issue #5): Auth 다이얼로그 재진입 시 기존
   `didimConfig` 값으로 폼 필드를 사전 채움 (SlmConfigDialog/VertexConfigDialog
   패턴 동일)

### Didim 모드 제한 사항

1. 모델 선택 불가 → `modelSelectionDisabled: true` 유지
2. Didim 비호환 설정 → `getEffectiveSettings` 래퍼를 통해 런타임에서만 무시
   (파일 미변경)
   - ⚠️ 대상 필드는 GREEN 구현 전 settingsSchema 분석으로 확정
3. 도구 호출 미지원 → UI에서 도구 관련 설정 숨김 (해당 시)

---

**상태**: ⬜ Phase 2 완료 후 시작
