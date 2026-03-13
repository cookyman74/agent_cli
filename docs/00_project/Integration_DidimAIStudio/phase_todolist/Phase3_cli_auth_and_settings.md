# Phase 3: CLI — Auth UI + Settings 확장

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 테스트
> 먼저 작성 → 최소 코드 구현 → 리팩터링 **리팩터링 원칙**: "Make it work → Make
> it right → Make it fast" **참고 문서**:
>
> - [99_TDD_plan.md](../../multi_provider_model_select/template/99_TDD_plan.md)
>   — TDD 방법론
> - [Phase2 결과서](../working_history/) — 이전 Phase 결과 검토
> - [DidimAIStudio 연동 가이드](../../../../docs/temp_howto_develop_integration_didimaistudio.md)
>   — §3, §7, §8

---

## 작업 개요

| 항목        | 내용                                            |
| ----------- | ----------------------------------------------- |
| 프로젝트    | DidimAIStudio 연동 — Auth UI + Settings 확장    |
| 영향 범위   | Auth 다이얼로그, providerMetadata, 설정 스키마  |
| 위험 수준   | 🟡 Medium — UI 변경, ComingSoon 다이얼로그 대체 |
| 성능 민감도 | 🟢 Low — UI/설정 로직                           |
| 참고 설계   | 기존 Auth 다이얼로그 패턴 (Ink components)      |
| 작업 브랜치 | `DID/v0.3`                                      |

---

## 핵심 리스크 요약

| 리스크                                          | 영향      | 대응 방안                                    | 상태 |
| ----------------------------------------------- | --------- | -------------------------------------------- | ---- |
| ComingSoon 다이얼로그 대체 시 import 경로 깨짐  | 🟡 Medium | 기존 export 이름 유지하거나 사용처 전수 확인 | ⬜   |
| Didim 설정 항목 추가 시 기존 settings 파싱 오류 | 🟡 Medium | optional 필드, 하위 호환 테스트              | ⬜   |
| JWT 토큰 길이로 UI 입력 문제                    | 🟢 Low    | 보안 입력(masked) + 유효성 검증              | ⬜   |

---

## 3.1 사전 작업 (Pre-Work)

- [ ] **[REVIEW]** Phase 2 작업 결과서 검토
  - 파일: `../working_history/Phase2_core_didim_adapter_{작업일자}.md`
  - 확인: DidimAdapter 동작 확인, contentGenerator 등록 완료

- [ ] **[CONTEXT]** Phase 3 작업 목적 확인
  - ComingSoon → 실제 Auth 다이얼로그 전환
  - JWT 토큰 + 서버 도메인 + 스트림 모드 입력 UI
  - Didim 전용 설정 정규화

- [ ] **[ANALYSIS-1]** 기존 Auth 다이얼로그 패턴 분석
  - 파일: `packages/cli/src/ui/auth/` 디렉토리 전수
  - 확인: Ink TextInput 패턴, API 키 저장 흐름, useAuth hook 연동
  - 확인: DidimStudioComingSoonDialog.tsx 현재 구조 및 호출 위치

- [ ] **[ANALYSIS-2]** providerMetadata 현재 상태 분석
  - 파일: `packages/cli/src/ui/auth/providerMetadata.ts`
  - 확인: `didim-studio` 엔트리의 `envVarName`, `keychainEntry` 빈값 확인

- [ ] **[ANALYSIS-3]** 설정 스키마 분석
  - 파일: `packages/cli/src/config/settingsSchema.ts`
  - 확인: 기존 didim 관련 필드 존재 여부, 확장 포인트

- [ ] **[REGRESSION]** Phase 1~2 회귀 테스트 실행
  ```bash
  npm test -w @didim365/agent-cli-core -- --run src/providers/didim/
  ```

---

## 3.2 RED Phase (Part A): Auth 다이얼로그 테스트

> **목적**: Didim Auth 다이얼로그의 실패 테스트 작성

- [ ] **[RED-1]** DidimStudioAuthDialog 렌더링 테스트

  ```typescript
  // packages/cli/src/ui/auth/DidimStudioAuthDialog.test.tsx

  describe('DidimStudioAuthDialog', () => {
    it('should render domain input field', () => {
      const { lastFrame } = render(<DidimStudioAuthDialog onComplete={vi.fn()} />);
      expect(lastFrame()).toContain('Server Domain');
    });

    it('should render JWT token input field', () => {
      const { lastFrame } = render(<DidimStudioAuthDialog onComplete={vi.fn()} />);
      expect(lastFrame()).toContain('JWT Token');
    });

    it('should render stream mode selector', () => {
      const { lastFrame } = render(<DidimStudioAuthDialog onComplete={vi.fn()} />);
      expect(lastFrame()).toContain('Stream Mode');
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

- [ ] **[RED-VERIFY-A]** Part A 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli -- --run src/ui/auth/DidimStudioAuthDialog.test.tsx
  ```

---

## 3.3 GREEN Phase (Part A): Auth 다이얼로그 구현

- [ ] **[TASK-001]** DidimStudioAuthDialog 컴포넌트 생성
  - 파일: `packages/cli/src/ui/auth/DidimStudioAuthDialog.tsx`
  - 입력 필드:
    - Server Domain (TextInput) — placeholder: `aistudio.didim365.com`
    - JWT Token (TextInput, masked) — placeholder: `eyJhbGciOi...`
    - Stream Mode (Select) — `sse` | `improved`
  - 저장 버튼 → `onComplete(settings)` 호출
  - ESC → `onCancel()` 호출

- [ ] **[TASK-002]** providerMetadata 업데이트
  - 파일: `packages/cli/src/ui/auth/providerMetadata.ts`
  - 변경: `envVarName: 'DIDIM_API_KEY'` 설정
  - 필요 시 추가 메타데이터 업데이트

- [ ] **[TASK-003]** ComingSoon → Auth 다이얼로그 전환
  - 파일: DidimStudioComingSoonDialog 사용처 확인
  - 방법: import 경로를 DidimStudioAuthDialog로 교체
  - 또는: ComingSoonDialog 내부에서 Auth 다이얼로그를 호출하도록 변경

- [ ] **[GREEN-VERIFY-A]** Part A 테스트 통과 확인
  ```bash
  npm test -w @didim365/agent-cli -- --run src/ui/auth/DidimStudioAuthDialog.test.tsx
  ```

---

## 3.4 RED Phase (Part B): Settings 확장 테스트

- [ ] **[RED-3]** Didim 전용 설정 스키마 테스트

  ```typescript
  describe('Didim settings schema', () => {
    it('should accept didimStreamMode field', () => {
      const settings = loadSettings({ didimStreamMode: 'improved' });
      expect(settings.didimStreamMode).toBe('improved');
    });

    it('should accept didimServerAddress field', () => {
      const settings = loadSettings({
        didimServerAddress: 'aistudio.didim365.com',
      });
      expect(settings.didimServerAddress).toBe('aistudio.didim365.com');
    });

    it('should default didimStreamMode to "sse"', () => {
      const settings = loadSettings({});
      expect(settings.didimStreamMode).toBe('sse');
    });
  });
  ```

- [ ] **[RED-4]** Didim 설정 정규화 테스트

  ```typescript
  describe('normalizeDidimSettings', () => {
    it('should clear systemRole when provider is didim', () => {
      // Didim 모드에서는 서버 시나리오가 제어하므로 로컬 프롬프트 비활성화
    });

    it('should clear useThinking when provider is didim', () => {
      // Didim은 thinking 미지원
    });

    it('should clear useVisionMode when provider is didim', () => {
      // Didim은 이미지 업로드 미지원
    });
  });
  ```

- [ ] **[RED-VERIFY-B]** Part B 테스트 실패 확인

---

## 3.5 GREEN Phase (Part B): Settings 구현

- [ ] **[TASK-004]** 설정 스키마에 Didim 전용 필드 추가
  - 파일: `packages/cli/src/config/settingsSchema.ts`
  - 추가 필드:
    - `didimStreamMode: 'sse' | 'improved'` (기본값: `'sse'`)
    - `didimServerAddress: string` (기본값: `''`)

- [ ] **[TASK-005]** Didim 설정 정규화 로직 구현
  - 프로바이더가 didim일 때:
    - `systemRole = ''`
    - `useThinking = false`
    - `useVisionMode = false`
  - `didimServerAddress` → `normalizeDidimDomain()` 적용

- [ ] **[TASK-006]** Auth 다이얼로그 → 설정 저장 연결
  - `onComplete` 콜백에서 `DIDIM_API_KEY` env + settings 동시 저장
  - `didimServerAddress`, `didimStreamMode` 설정 파일 저장

- [ ] **[GREEN-VERIFY-B]** Part B 테스트 통과 확인

---

## 3.6 REFACTOR Phase: 코드 개선

- [ ] **[REFACTOR-STRUCTURE]** 코드 구조 개선
  - ComingSoon 다이얼로그 관련 불필요 코드 정리
  - Auth 다이얼로그 컴포넌트 분리 (입력 필드별 sub-component)
  - 설정 정규화 로직 → 재사용 가능한 유틸 함수로 추출

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
  - 확인 항목 2: JWT 토큰 + 도메인 저장 → `DIDIM_API_KEY` env 설정
  - 확인 항목 3: Didim 모드에서 비활성 설정 항목 자동 초기화
  - 확인 항목 4: 프로바이더 전환 시 Didim 설정 독립 유지

- [ ] **[DOC]** 작업 결과서 작성
  - 파일: `../working_history/Phase3_cli_auth_and_settings_{작업일자}.md`

- [ ] **[COMMIT]** 변경사항 커밋 (Tidy First)
  ```bash
  # 구조적 변경
  git commit -m "feat(cli): add DidimStudioAuthDialog — JWT + domain input UI"
  # 동작 변경
  git commit -m "feat(cli): replace ComingSoon with actual Didim auth flow + settings"
  ```

---

## ⚠️ 주의사항

### Auth 다이얼로그 설계 원칙

1. **기존 패턴 재사용**: Ink TextInput/Select 컴포넌트 사용
2. **JWT 보안**: 토큰 입력은 masked, 저장은 기존 API key 저장 경로 사용
3. **도메인 정규화**: 저장 시점에 `normalizeDidimDomain()` 적용
4. **하위 호환**: 기존 ComingSoon import 경로에서 새 다이얼로그로 redirect

### Settings 확장 원칙

1. **optional 필드**: 기존 settings 파싱에 영향 주지 않도록 모두 optional +
   기본값
2. **프로바이더 격리**: Didim 설정은 다른 프로바이더에 영향 없음
3. **정규화 시점**: 설정 로드 시 + 저장 시 이중 정규화

### Didim 모드 제한 사항

1. 모델 선택 불가 → `modelSelectionDisabled: true` 유지
2. `systemRole`, `useThinking`, `useVisionMode` 비활성
3. 도구 호출 미지원 → UI에서 도구 관련 설정 숨김 (해당 시)

---

**상태**: ⬜ Phase 2 완료 후 시작
