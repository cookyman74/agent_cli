# Phase 1 M1.3 Provider 선택/Config 설계 작업 결과

> 📅 **작업일**: 2026-02-06 🎯 **목표**: Provider 선택 경로와 Config 타입 설계

---

## 📊 진행 현황

| 구성요소                 |  상태   | 테스트 | 비고                                |
| ------------------------ | :-----: | :----: | ----------------------------------- |
| 1.3.1 ProviderType       | ✅ 완료 |   19   | enum + 매핑 함수                    |
| 1.3.2 ProviderConfig     | ✅ 완료 |   16   | 5개 프로바이더 Config + 타입 팩토리 |
| 1.3.3 ProviderSelector   | ✅ 완료 |   17   | 선택 우선순위 로직 + LlmError       |
| 1.3.4 Configuration 통합 | ✅ 완료 |   26   | getProviderFromConfig + 검증        |

**총 테스트**: 78개 (M1.3 신규)

---

## 🏗️ 1.3.1 ProviderType 정의

### 구현 파일

- [providerTypes.ts](file:///Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/providers/providerTypes.ts)
- [providerTypes.test.ts](file:///Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/providers/providerTypes.test.ts)

### 주요 내용

```typescript
enum ProviderType {
  Gemini = 'gemini',
  Claude = 'claude',
  OpenAI = 'openai',
  OpenAICompatible = 'openai-compatible',
  Didim = 'didim',
}

enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  LEGACY_CLOUD_SHELL = 'cloud-shell',
  COMPUTE_ADC = 'compute-default-credentials',
}
```

### 핵심 함수

- `getAuthTypesForProvider()`: 프로바이더별 지원 인증 타입 반환
- `getProviderForAuthType()`: AuthType에서 Provider 역추적
- `isGeminiAuthType()`: Gemini 전용 인증인지 확인

---

## 🏗️ 1.3.2 ProviderConfig 타입

### 구현 파일

- [providerConfig.ts](file:///Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/providers/providerConfig.ts)
- [providerConfig.test.ts](file:///Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/providers/providerConfig.test.ts)

### 프로바이더별 Config

| Interface                | 필수 필드 | 선택 필드                         |
| ------------------------ | --------- | --------------------------------- |
| `GeminiProviderConfig`   | -         | `authType`, `project`, `location` |
| `ClaudeProviderConfig`   | `apiKey`  | `anthropicVersion`                |
| `OpenAIProviderConfig`   | `apiKey`  | `organization`                    |
| `OpenAICompatibleConfig` | `baseUrl` | `apiKey`                          |
| `DidimProviderConfig`    | `apiKey`  | `endpoint`                        |

### Type Guards

- `isGeminiConfig()`, `isClaudeConfig()`, `isOpenAIConfig()`,
  `isOpenAICompatibleConfig()`, `isDidimConfig()`

---

## 🏗️ 1.3.3 ProviderSelector

### 구현 파일

- [providerSelector.ts](file:///Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/providers/providerSelector.ts)
- [providerSelector.test.ts](file:///Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/providers/providerSelector.test.ts)

### 선택 우선순위

```
1. LLM_PROVIDER 환경변수
2. authType 설정값 (Gemini 전용)
3. GEMINI_API_KEY / GOOGLE_API_KEY (폴백)
```

### 프로바이더별 환경변수

| Provider          | 필수 환경변수                               |
| ----------------- | ------------------------------------------- |
| Gemini            | `GEMINI_API_KEY` 또는 `GOOGLE_API_KEY`      |
| Claude            | `ANTHROPIC_API_KEY`                         |
| OpenAI            | `OPENAI_API_KEY`                            |
| Didim             | `DIDIM_API_KEY`                             |
| OpenAI-Compatible | `LLM_BASE_URL` (필수), `LLM_API_KEY` (선택) |

### 핵심 함수

- `selectProvider()`: 우선순위 기반 프로바이더 선택
- `getRequiredEnvVars()`: 필수 환경변수 목록 반환
- `validateProviderEnv()`: 환경변수 검증

---

## ✅ 테스트 결과

```
 ✓ src/providers/providerTypes.test.ts (19 tests)
 ✓ src/providers/providerConfig.test.ts (16 tests)
 ✓ src/providers/providerSelector.test.ts (17 tests)
 ✓ src/providers/providerConfigIntegration.test.ts (26 tests)

 Test Files  4 passed (4)
      Tests  78 passed (78)
```

### 전체 providers 테스트: **212 passed**

---

## 🔧 기타 변경사항

### 이름 충돌 해결

- `configAdapter.ts`의 `ProviderConfig` → `GenerationConfig`로 변경
- 생성 파라미터 설정과 프로바이더 구성 설정 구분

### Export 추가 (index.ts)

- `providerTypes.js`
- `providerConfig.js`
- `providerSelector.js`
- `providerConfigIntegration.js`

---

## 🏗️ 1.3.4 Configuration 통합

### 구현 파일

- [providerConfigIntegration.ts](file:///Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/providers/providerConfigIntegration.ts)
- [providerConfigIntegration.test.ts](file:///Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/providers/providerConfigIntegration.test.ts)

### 핵심 함수

| 함수                       | 설명                                               |
| -------------------------- | -------------------------------------------------- |
| `getProviderFromConfig()`  | 명시적 옵션 또는 환경변수에서 프로바이더 구성 해결 |
| `validateProviderConfig()` | 프로바이더별 필수 필드 (apiKey, baseUrl) 검증      |
| `resolveProviderEnvVars()` | 프로바이더별 환경변수 해결                         |

### 선택 우선순위

```
1. 명시적 provider 옵션
2. 명시적 authType 옵션 (Gemini 암시)
3. LLM_PROVIDER 환경변수
4. Gemini 기본값
```

---

## ✅ 검증 기준 체크리스트

- [x] 기존 인증 흐름(ADC/OAuth/Vertex) 유지
- [x] 신규 provider 선택 경로 동작
- [x] 우선순위 충돌 시 동작 예측 가능
- [x] 프로바이더별 환경변수 검증 동작

---

## � M1.3.4 리뷰 피드백 반영 (2026-02-06)

### Issue 1: validateProviderConfig()가 환경변수 기반 구성과 충돌 ✅

**문제**: 옵션만 검증하여 환경변수로 제공된 값이 누락됨

**수정**:

- `validateResolvedConfig()` 함수 추가 - 해결된 구성 검증용
- `validateProviderConfig()`에 `@deprecated` 주석 추가
- 테스트 추가: `validateResolvedConfig` 테스트 그룹 (6개)

### Issue 2: timeout 필드가 유실됨 ✅

**문제**: `ResolvedProviderConfig`에 `timeout` 필드 없음

**수정**:

- `ResolvedProviderConfig` 인터페이스에 `timeout?: number` 추가
- `getProviderFromConfig()`에서 `timeout` 전달/보존
- 테스트 추가: `should preserve timeout in resolved config`

### 테스트 갭 해결 ✅

| 추가된 테스트                                           | 설명                       |
| ------------------------------------------------------- | -------------------------- |
| `should throw for Didim without API key`                | Didim 실패 케이스          |
| `should resolve baseUrl from env for OpenAI-compatible` | OpenAI-compatible 환경변수 |
| `validateResolvedConfig` 그룹                           | 6개 테스트 추가            |

**테스트 증가**: 17개 → 26개 (+9개)

---

## �🚀 다음 작업

- **M1.4 유틸리티/테스트 마이그레이션 계획**: 유틸리티 레이어 분석 및
  마이그레이션 계획 수립

---

## 📝 리뷰 피드백 반영 (2026-02-06)

### Issue 1: ProviderSelector가 OpenAICompatible의 baseUrl 미반환 ✅

**문제**: `ProviderSelection` 인터페이스에 `baseUrl` 필드 없음

**수정**:

- `ProviderSelection` 인터페이스에 `baseUrl?: string` 추가
- `selectProvider()` 함수에서 `OpenAICompatible` 선택 시 `LLM_BASE_URL` 반환
- 테스트 추가: `should include baseUrl for OpenAI-compatible`

### Issue 2: 일반 Error 대신 LlmError 사용 ✅

**문제**: `parseProviderEnv()`, `validateProviderEnv()`에서 일반 `Error` 사용

**수정**:

- `LlmError`, `LlmErrorType` import 추가
- `throw new Error()` → `throw new LlmError(LlmErrorType.INVALID_REQUEST, ...)`
  변경
- 테스트 추가: `should throw LlmError for configuration issues`

### Issue 3: AuthType 중복 정의로 인한 혼선 ✅

**문제**: `providerTypes.ts`와 `core/contentGenerator.ts`에 동일 enum 존재

**수정**:

- JSDoc 주석 개선: 순환 의존성 방지를 위한 로컬 복사본임을 명시
- `@see core/contentGenerator.ts AuthType` 참조 추가

### Issue 4: createProviderConfig 타입 추론 모호성 ✅

**문제**: 제네릭 호출 시 필수 필드(apiKey, baseUrl) 강제 불가

**수정**:

- 프로바이더별 타입 안전 팩토리 함수 추가:
  - `createGeminiConfig()`
  - `createClaudeConfig()` - apiKey 필수
  - `createOpenAIConfig()` - apiKey 필수
  - `createOpenAICompatibleConfig()` - baseUrl 필수
  - `createDidimConfig()` - apiKey 필수
- 테스트 추가: `Typed factory functions` 테스트 그룹

### 문서-코드 차이 수정 ✅

- `isOpenAICompatibleConfig` 타입 가드가 코드에 존재함을 문서에 반영 (위 Type
  Guards 섹션 확인)
