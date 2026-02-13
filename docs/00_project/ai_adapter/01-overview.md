# 01. 프로젝트 개요

## 1.1 배경

Gemini CLI는 Google의 Gemini 모델을 터미널에서 직접 사용할 수 있는 오픈소스 AI
에이전트입니다. 현재는 Gemini API만 지원하지만, 다양한 LLM 프로바이더(Claude,
OpenAI GPT, Llama 등)를 지원하면 사용자에게 더 많은 선택권을 제공할 수 있습니다.

### 1.1.1 현재 지원 인증 방식

- Google OAuth (개인 계정)
- Gemini API Key
- Vertex AI (엔터프라이즈)
- Google Cloud ADC

### 1.1.2 확장 필요성

- 사용자마다 선호하는 LLM 프로바이더가 다름
- 특정 작업에 최적화된 모델 선택 필요
- 프로바이더 장애 시 대체 옵션 필요
- 비용 최적화를 위한 모델 선택 유연성

## 1.2 목표

### 주요 목표

1. **다중 프로바이더 지원**: Gemini, Claude, OpenAI GPT 등 주요 LLM 프로바이더
   지원
2. **어댑터 패턴 도입**: 새로운 프로바이더 추가가 용이한 확장 가능한 구조
3. **하위 호환성 유지**: 기존 Gemini 사용자에게 영향 없음
4. **설정 기반 전환**: 환경 변수 또는 설정 파일로 프로바이더 선택

### 비목표 (Scope 외)

- 프로바이더별 고유 기능 완전 지원 (1차 버전에서는 공통 기능만)
- 프로바이더 간 실시간 전환 (세션 시작 시 선택)
- 비용 추적 및 최적화 기능

## 1.3 현재 상태 분석

### 1.3.1 코드베이스 구조

```
packages/
├── cli/                 # 터미널 UI (React/Ink)
│   └── src/
│       ├── core/        # 인증, 초기화
│       └── config/      # 사용자 설정
│
└── core/                # 백엔드 로직
    └── src/
        ├── core/        # LLM 클라이언트, 콘텐츠 생성
        ├── tools/       # 파일, 셸, 웹 도구
        ├── config/      # 모델 설정
        └── routing/     # 모델 라우팅
```

### 1.3.2 핵심 컴포넌트 분석

| 컴포넌트           | 파일                            | 역할                         | 라인 수 |
| ------------------ | ------------------------------- | ---------------------------- | ------- |
| GeminiClient       | `core/client.ts`                | 세션 관리, 턴 처리, 압축, 훅 | ~1,048  |
| BaseLlmClient      | `core/baseLlmClient.ts`         | 상태 없는 API 호출 래퍼      | ~339    |
| ContentGenerator   | `core/contentGenerator.ts`      | 콘텐츠 생성 인터페이스       | ~200    |
| GeminiChat         | `core/geminiChat.ts`            | 채팅 상태 관리               | ~1000   |
| ModelRouterService | `routing/modelRouterService.ts` | 모델 라우팅 전략             | ~120    |

**참고**: `GeminiChat`은 Gemini 전용 응답 처리, 스트리밍, 도구 사용 로직을
포함하고 있어 리팩토링 복잡도가 높습니다.

### 1.3.3 기존 추상화 수준

**장점 (Well-designed)**

- `ContentGenerator` 인터페이스가 핵심 추상화 포인트로 존재
- 팩토리 패턴으로 구현체 생성
- 데코레이터 패턴으로 로깅, 레코딩 등 기능 추가 가능
- 모델 라우팅 서비스가 전략 패턴으로 구현됨

**단점 (Coupling issues)**

- `@google/genai` SDK 타입에 직접 의존
- Gemini 전용 로직이 여러 파일에 분산
- 모델 기능 플래그가 Gemini 기준으로 하드코딩

### 1.3.4 의존성 현황

```json
{
  "@google/genai": "1.30.0",
  "@modelcontextprotocol/sdk": "^1.23.0",
  "google-auth-library": "^9.11.0"
}
```

## 1.4 기존 ContentGenerator 구현체

현재 `ContentGenerator` 인터페이스를 구현한 클래스들:

| 구현체                      | 용도       | 설명                            |
| --------------------------- | ---------- | ------------------------------- |
| `GoogleGenAI`               | 프로덕션   | Gemini API 직접 호출            |
| `CodeAssistServer`          | 프로덕션   | Google Cloud CodeAssist (OAuth) |
| `LoggingContentGenerator`   | 데코레이터 | 텔레메트리 추가                 |
| `FakeContentGenerator`      | 테스트     | 미리 정의된 응답 반환           |
| `RecordingContentGenerator` | 테스트     | 응답 녹화/재생                  |

## 1.5 식별된 문제점

### P1: 타입 결합도

```typescript
// 현재: @google/genai 타입에 직접 의존
import { GenerateContentResponse } from '@google/genai';

// 문제: 다른 프로바이더는 다른 응답 구조를 가짐
```

### P2: Gemini 전용 로직 산재

```typescript
// packages/core/src/config/models.ts
export function isGemini2Model(model: string): boolean { ... }
export function supportsMultimodalFunctionResponse(model: string): boolean { ... }

// 문제: 다른 프로바이더의 모델 특성 처리 불가
```

### P3: 하드코딩된 토큰 제한

```typescript
// geminiChat.ts
const THINKING_TOKEN_CAP = 8192;

// 문제: 프로바이더/모델별로 다른 제한 필요
```

### P4: 인증 방식 제한

```typescript
// AuthType이 Google 서비스에 특화됨
enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  LEGACY_CLOUD_SHELL = 'cloud-shell',
  COMPUTE_ADC = 'compute-default-credentials',
  // Claude, OpenAI 등 없음
}
```

## 1.6 성공 기준

### 기능적 요구사항

- [ ] Claude API를 통한 대화 가능
- [ ] OpenAI GPT API를 통한 대화 가능
- [ ] 기존 Gemini 기능 100% 동작
- [ ] 설정 파일로 기본 프로바이더 지정 가능
- [ ] 환경 변수로 프로바이더 전환 가능

### 비기능적 요구사항

- [ ] 새 프로바이더 추가 시 기존 코드 수정 최소화
- [ ] 기존 테스트 100% 통과
- [ ] 성능 저하 없음 (응답 지연 < 50ms 증가)

### 품질 요구사항

- [ ] 프로바이더별 단위 테스트 커버리지 > 80%
- [ ] 통합 테스트 시나리오 정의 및 통과
- [ ] 문서화 완료 (사용자 가이드, 개발자 가이드)
