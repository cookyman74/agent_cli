# 02. 아키텍처 설계

## 2.1 현재 아키텍처

### 2.1.1 전체 구조

```
┌─────────────────────────────────────────────────────────────┐
│                       GeminiClient                           │
│                  (High-level orchestration)                  │
│                                                              │
│  - 세션 관리                                                  │
│  - 턴 처리                                                    │
│  - 컨텍스트 압축                                              │
│  - 훅 실행                                                    │
└────────────────────────────┬────────────────────────────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
    ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼────────┐
    │ GeminiChat  │  │BaseLlmClient│  │ ModelRouter   │
    │             │  │             │  │ Service       │
    │ - 채팅 히스토리│  │ - JSON 생성  │  │               │
    │ - 메시지 스트림│  │ - 임베딩     │  │ - 폴백 전략    │
    │ - 도구 처리   │  │ - 토큰 카운트 │  │ - 오버라이드   │
    └──────┬──────┘  └──────┬──────┘  └──────┬────────┘
           │                │                │
           └────────────────┼────────────────┘
                            │
           ┌────────────────▼────────────────┐
           │       ContentGenerator          │
           │         (Interface)             │
           │                                 │
           │  + generateContent()            │
           │  + generateContentStream()      │
           │  + countTokens()                │
           │  + embedContent()               │
           └────────────────┬────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌────▼────┐    ┌────────▼─────────┐   ┌────▼──────┐
   │GoogleGenAI│   │CodeAssistServer  │   │  Logging/ │
   │          │   │                  │   │  Fake/    │
   │@google/  │   │ OAuth 기반       │   │  Recording│
   │genai SDK │   │ 엔터프라이즈      │   │           │
   └────┬─────┘   └────────┬─────────┘   └───────────┘
        │                  │
        └────────┬─────────┘
                 │
        ┌────────▼────────┐
        │   Gemini API    │
        │   (Google)      │
        └─────────────────┘
```

### 2.1.2 데이터 흐름

```
User Input
    │
    ▼
┌─────────────┐
│  CLI Layer  │ ──────────────────┐
│ (packages/  │                   │
│  cli)       │                   │
└──────┬──────┘                   │
       │                          │
       ▼                          ▼
┌─────────────┐           ┌──────────────┐
│   Core      │           │   Config     │
│   Client    │◄─────────►│   (Settings, │
│             │           │    Models)   │
└──────┬──────┘           └──────────────┘
       │
       ▼
┌─────────────┐
│  Content    │
│  Generator  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Gemini     │
│  API        │
└─────────────┘
```

### 2.1.3 현재 ContentGenerator 인터페이스

```typescript
// packages/core/src/core/contentGenerator.ts

export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
    userPromptId?: string
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
    userPromptId?: string
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(
    request: CountTokensRequest
  ): Promise<CountTokensResponse>;

  embedContent(
    request: EmbedContentRequest
  ): Promise<EmbedContentResponse>;
}
```

**문제점**: 모든 타입이 `@google/genai`에서 직접 import됨

## 2.2 목표 아키텍처

### 2.2.1 어댑터 패턴 적용

```
┌─────────────────────────────────────────────────────────────┐
│                       GeminiClient                           │
│                  (High-level orchestration)                  │
└────────────────────────────┬────────────────────────────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
    ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼────────┐
    │  LlmChat    │  │BaseLlmClient│  │ ModelRouter   │
    │ (Generic)   │  │             │  │ Service       │
    └──────┬──────┘  └──────┬──────┘  └──────┬────────┘
           │                │                │
           └────────────────┼────────────────┘
                            │
           ┌────────────────▼────────────────┐
           │       ContentGenerator          │
           │    (Provider-Agnostic Types)    │
           └────────────────┬────────────────┘
                            │
           ┌────────────────▼────────────────┐
           │       ProviderRegistry          │
           │                                 │
           │  + register(name, adapter)      │
           │  + get(name): ContentGenerator  │
           │  + getDefault(): ContentGenerator│
           └────────────────┬────────────────┘
                            │
    ┌───────────────────────┼───────────────────────┐
    │                       │                       │
┌───▼────┐           ┌──────▼──────┐         ┌─────▼─────┐
│ Gemini │           │   Claude    │         │  OpenAI   │
│Adapter │           │   Adapter   │         │  Adapter  │
│        │           │             │         │           │
│@google/│           │ @anthropic/ │         │  openai   │
│genai   │           │ sdk         │         │  SDK      │
└───┬────┘           └──────┬──────┘         └─────┬─────┘
    │                       │                      │
    ▼                       ▼                      ▼
┌─────────┐          ┌────────────┐         ┌──────────┐
│ Gemini  │          │  Claude    │         │  OpenAI  │
│ API     │          │  API       │         │  API     │
└─────────┘          └────────────┘         └──────────┘
```

### 2.2.2 계층 구조

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  (GeminiClient, CLI, Tools)                                 │
├─────────────────────────────────────────────────────────────┤
│                    Abstraction Layer                         │
│  (ContentGenerator, LlmTypes, ProviderRegistry)             │
├─────────────────────────────────────────────────────────────┤
│                    Adapter Layer                             │
│  (GeminiAdapter, ClaudeAdapter, OpenAIAdapter)              │
├─────────────────────────────────────────────────────────────┤
│                    SDK Layer                                 │
│  (@google/genai, @anthropic/sdk, openai)                    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2.3 새 디렉토리 구조

```
packages/core/src/
├── core/
│   ├── client.ts              # 기존 (수정)
│   ├── baseLlmClient.ts       # 기존 (수정)
│   └── contentGenerator.ts    # 기존 → 인터페이스만 유지
│
├── providers/                  # 새로 추가
│   ├── types.ts               # 프로바이더 독립적 타입
│   ├── registry.ts            # 프로바이더 레지스트리
│   ├── factory.ts             # 프로바이더 팩토리
│   │
│   ├── gemini/                # Gemini 어댑터
│   │   ├── adapter.ts
│   │   ├── types.ts
│   │   ├── models.ts
│   │   └── features.ts
│   │
│   ├── claude/                # Claude 어댑터
│   │   ├── adapter.ts
│   │   ├── types.ts
│   │   ├── models.ts
│   │   └── features.ts
│   │
│   └── openai/                # OpenAI 어댑터
│       ├── adapter.ts
│       ├── types.ts
│       ├── models.ts
│       └── features.ts
│
└── config/
    ├── models.ts              # 기존 → 리팩토링
    └── providerConfig.ts      # 새로 추가
```

## 2.3 핵심 설계 원칙

### 2.3.1 의존성 역전 원칙 (DIP)

```typescript
// Before: 고수준 모듈이 저수준 모듈에 직접 의존
import { GoogleGenAI } from '@google/genai';

class GeminiClient {
  private generator = new GoogleGenAI(apiKey);  // 직접 의존
}

// After: 추상화에 의존
import { ContentGenerator } from './providers/types';
import { ProviderRegistry } from './providers/registry';

class GeminiClient {
  constructor(private generator: ContentGenerator) {}  // 인터페이스에 의존
}
```

### 2.3.2 개방-폐쇄 원칙 (OCP)

```typescript
// 새 프로바이더 추가 시 기존 코드 수정 없이 확장
// 1. 새 어댑터 구현
class LlamaAdapter implements ContentGenerator { ... }

// 2. 레지스트리에 등록
registry.register('llama', new LlamaAdapter());

// 기존 코드는 변경 없음!
```

### 2.3.3 단일 책임 원칙 (SRP)

| 컴포넌트 | 책임 |
|----------|------|
| `ContentGenerator` | 콘텐츠 생성 인터페이스 정의 |
| `GeminiAdapter` | Gemini API 호출 및 응답 변환 |
| `ClaudeAdapter` | Claude API 호출 및 응답 변환 |
| `ProviderRegistry` | 프로바이더 관리 및 조회 |
| `ProviderFactory` | 설정 기반 프로바이더 생성 |

## 2.4 프로바이더 선택 흐름

### 2.4.1 초기화 시퀀스

```
┌──────────────────────────────────────────────────────────┐
│                     Application Start                     │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                   Load Configuration                      │
│                                                          │
│  1. 환경 변수 확인 (LLM_PROVIDER, API keys)               │
│  2. 설정 파일 로드 (~/.gemini/settings.json)              │
│  3. 프로젝트 설정 확인 (.gemini/settings.json)            │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│              Determine Active Provider                    │
│                                                          │
│  Priority:                                               │
│  1. CLI 인자 (--provider claude)                         │
│  2. 환경 변수 (LLM_PROVIDER=claude)                      │
│  3. 프로젝트 설정                                         │
│  4. 글로벌 설정                                           │
│  5. 기본값 (gemini)                                       │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                Create Provider Adapter                    │
│                                                          │
│  ProviderFactory.create(providerName, config)            │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│              Register with ProviderRegistry               │
│                                                          │
│  registry.setActive(adapter)                             │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                   Ready for Requests                      │
└──────────────────────────────────────────────────────────┘
```

### 2.4.2 요청 처리 흐름

```
User Prompt
    │
    ▼
┌─────────────┐
│ GeminiClient│
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│         ProviderRegistry            │
│                                     │
│  getActive() → ContentGenerator     │
└──────────────────┬──────────────────┘
                   │
       ┌───────────┴───────────┐
       │                       │
       ▼                       ▼
┌──────────────┐       ┌──────────────┐
│ if Gemini    │       │ if Claude    │
│              │       │              │
│ GeminiAdapter│       │ClaudeAdapter │
│     ↓        │       │     ↓        │
│ Gemini API   │       │ Claude API   │
└──────────────┘       └──────────────┘
```

## 2.5 설정 구조

### 2.5.1 환경 변수

```bash
# 프로바이더 선택
LLM_PROVIDER=gemini|claude|openai

# Gemini
GEMINI_API_KEY=your-key

# Claude
ANTHROPIC_API_KEY=your-key

# OpenAI
OPENAI_API_KEY=your-key
```

### 2.5.2 설정 파일 (settings.json)

```json
{
  "provider": {
    "default": "gemini",
    "gemini": {
      "model": "gemini-2.5-pro",
      "apiKey": "${GEMINI_API_KEY}"
    },
    "claude": {
      "model": "claude-sonnet-4-20250514",
      "apiKey": "${ANTHROPIC_API_KEY}"
    },
    "openai": {
      "model": "gpt-4o",
      "apiKey": "${OPENAI_API_KEY}"
    }
  }
}
```

## 2.6 에러 처리 전략

### 2.6.1 프로바이더별 에러 매핑

```typescript
// 공통 에러 타입
enum LlmErrorType {
  RATE_LIMIT = 'rate_limit',
  AUTHENTICATION = 'authentication',
  INVALID_REQUEST = 'invalid_request',
  MODEL_OVERLOADED = 'model_overloaded',
  CONTEXT_LENGTH_EXCEEDED = 'context_length_exceeded',
  NETWORK = 'network',
  UNKNOWN = 'unknown'
}

// 각 어댑터에서 프로바이더별 에러를 공통 타입으로 변환
class GeminiAdapter {
  private mapError(error: GoogleError): LlmError {
    if (error.code === 429) return new LlmError(LlmErrorType.RATE_LIMIT);
    // ...
  }
}
```

### 2.6.2 폴백 전략

```typescript
// 프로바이더 장애 시 대체 프로바이더로 자동 전환 (선택적)
const fallbackConfig = {
  primary: 'claude',
  fallback: ['gemini', 'openai'],
  maxRetries: 2
};
```

## 2.7 호환성 고려사항

### 2.7.1 기능 매핑

| 기능 | Gemini | Claude | OpenAI |
|------|--------|--------|--------|
| 텍스트 생성 | ✅ | ✅ | ✅ |
| 스트리밍 | ✅ | ✅ | ✅ |
| 도구 호출 | ✅ | ✅ | ✅ |
| 이미지 입력 | ✅ | ✅ | ✅ |
| 이미지 생성 | ✅ | ❌ | ✅ (DALL-E) |
| 임베딩 | ✅ | ❌ | ✅ |
| 토큰 카운트 | ✅ | ⚠️ (추정) | ✅ |
| 코드 실행 | ✅ | ❌ | ❌ |

### 2.7.2 기능 가용성 확인

```typescript
interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsToolCalls: boolean;
  supportsImageInput: boolean;
  supportsImageGeneration: boolean;
  supportsEmbedding: boolean;
  supportsTokenCount: boolean;
  maxContextLength: number;
}

// 사용 예
if (!provider.capabilities.supportsEmbedding) {
  throw new UnsupportedFeatureError('Embedding not supported by this provider');
}
```
