# 05. 구현 계획

## 5.1 마일스톤 개요

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            전체 일정: 6-8주                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Phase 1: 기반 작업 및 마이그레이션 전략 (2주)                            │
│  ├── M1.0: 코드 인벤토리/영향도 분석 (2일)                                │
│  ├── M1.1: 타입/에러/호환 레이어 설계 (3일)                               │
│  ├── M1.2: Adapter 인프라 구축 (Registry/Factory/Assembler) (3-4일)       │
│  └── M1.3: Provider 선택 경로/Config 설계 (2일)                           │
│                                                                          │
│  Phase 2: 코어 리팩토링 및 Gemini 분리 (2-3주)                             │
│  ├── M2.1: ContentGenerator/StreamEvent/Retry/Hook 타입 전환 (5-7일)      │
│  ├── M2.2: GeminiChat 스트리밍 분해 및 합성기 적용 (5-7일)                │
│  └── M2.3: GeminiAdapter 구현 및 동등성 검증 (3-5일)                      │
│                                                                          │
│  Phase 3: 프로바이더 확장 및 통합 (2-3주)                                 │
│  ├── M3.1: Claude 어댑터/변환기 구현 (4-5일)                               │
│  ├── M3.2: OpenAI 어댑터/변환기 구현 (3-4일)                               │
│  ├── M3.3: OpenAI-Compatible(vLLM/sLM) 어댑터 템플릿 (3일)                 │
│  └── M3.4: 통합 테스트/문서/안정화 (5-7일)                                │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## 5.2 Phase 1: 기반 작업 및 마이그레이션 전략

### M1.0: 코드 인벤토리 및 영향도 분석 (2일)

**목표**: 소스코드 기반 의존성/변경 범위 확정

**작업 항목**:
- [ ] `@google/genai` 직접 의존 지점 전체 인벤토리 (100+ 파일 기준)
- [ ] `ContentGenerator`/`StreamEvent`/Hook/Telemetry/Retry 의존 관계 맵핑
- [ ] `packages/core/src/providers/` 신규 디렉토리 생성 범위 확정
- [ ] 단계적 마이그레이션 전략 수립 (alias → 병행 → 제거)

**산출물**:
```
/docs/ai_adapter/
└── migration-plan.md  # 단계별 타입 전환 및 영향도
```

**검증 기준**:
- 의존성 목록과 변경 대상 파일 리스트가 문서화됨
- 1차 전환 대상(핵심 경로)이 명확히 정의됨

---

### M1.1: 타입/에러/호환 레이어 설계 (3일)

**목표**: 프로바이더 독립 타입과 호환 레이어 정의

**작업 항목**:
- [ ] `packages/core/src/providers/types.ts` 생성
- [ ] `LlmMessage`, `LlmContent`, `LlmGenerateRequest/Response` 정의
- [ ] `LlmStreamEvent`, `LlmStream` 정의 (기존 StreamEvent 대체 계획 포함)
- [ ] `LlmError`/`LlmErrorType` 정의 및 `ApiError` 대체 경로 마련
- [ ] Legacy alias 설계 (`type LegacyGenerateContentResponse = ...`)로 점진적 이행

**산출물**:
```
packages/core/src/providers/
├── types.ts
├── errors.ts
└── legacyAliases.ts
```

**검증 기준**:
- 신규 타입이 SDK 비의존
- 레거시 타입과 병행 컴파일 가능

---

### M1.2: Adapter 인프라 구축 (3-4일)

**목표**: 어댑터 확장성을 위한 공통 인프라 구성

**작업 항목**:
- [ ] `BaseAdapter`, `ProviderRegistry`, `ProviderFactory` 설계/구현
- [ ] StreamAssembler 도입 (툴 델타/usage 합성 공통화)
- [ ] ContentResolver 도입 (이미지 URL → base64 등 변환)
- [ ] ModelSpec 도입 (모델별 context/token/capability 관리)

**산출물**:
```
packages/core/src/providers/
├── baseAdapter.ts
├── registry.ts
├── factory.ts
├── streamAssembler.ts
├── contentResolver.ts
└── modelSpec.ts
```

**검증 기준**:
- 신규 어댑터가 인프라만으로 통합 가능
- StreamAssembler로 Claude/OpenAI 스트림 합성 시나리오 만족

---

### M1.3: Provider 선택 경로/Config 설계 (2일)

**목표**: 기존 `authType` 기반 흐름과 새 provider 선택 경로의 공존

**작업 항목**:
- [ ] `ContentGenerator` 생성 경로를 `authType` + `provider`로 분리 설계
- [ ] Code Assist(OAuth) 경로를 Adapter로 변환하거나 별도 유지 결정
- [ ] 환경 변수(`LLM_PROVIDER`) 및 설정 파일 통합 경로 정의

**인증/프로바이더 우선순위 규칙** (리뷰 피드백 B 반영):

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     프로바이더 선택 우선순위                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. LLM_PROVIDER 환경변수가 설정된 경우:                                   │
│     → LLM_PROVIDER가 명시적 프로바이더 선택을 우선                         │
│     → authType은 해당 프로바이더의 인증 방식으로 사용                       │
│                                                                          │
│  2. LLM_PROVIDER 미설정 + 기존 authType 설정된 경우:                       │
│     → 기존 Google 인증 경로 유지 (ADC, OAuth, API Key)                    │
│     → Gemini/Vertex AI를 기본 프로바이더로 사용                            │
│                                                                          │
│  3. 둘 다 미설정:                                                          │
│     → GEMINI_API_KEY 확인 → Gemini API Key 모드                          │
│     → 실패 시 오류 및 설정 안내                                            │
│                                                                          │
│  우선순위: LLM_PROVIDER > authType > GEMINI_API_KEY                       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**예시 시나리오**:
| 설정 | 결과 |
|------|------|
| `LLM_PROVIDER=claude` + `ANTHROPIC_API_KEY=xxx` | Claude 사용 |
| `LLM_PROVIDER=didim` + `DIDIM_API_KEY=xxx` | DidimAIStudio 사용 |
| `LLM_PROVIDER` 없음 + `authType=USE_GEMINI` | 기존 Gemini API Key 모드 |
| `LLM_PROVIDER` 없음 + `authType=LOGIN_WITH_GOOGLE` | 기존 OAuth 모드 |
| 모두 없음 + `GEMINI_API_KEY=xxx` | Gemini API Key 모드 (자동 감지) |

**검증 기준**:
- 기존 인증 흐름(ADC/OAuth/Vertex) 유지
- 신규 provider 선택 경로가 명확히 문서화됨
- 우선순위 충돌 시 동작이 예측 가능함

## 5.3 Phase 2: 코어 리팩토링 및 Gemini 분리

### M2.1: ContentGenerator/StreamEvent/Retry/Hook 타입 전환 (5-7일)

**목표**: 핵심 경로에서 `@google/genai` 타입 분리

**작업 항목**:
- [ ] `ContentGenerator` 시그니처 정합화 (`userPromptId` required 유지)
- [ ] `createContentGenerator`를 provider-aware 팩토리로 이관
- [ ] `BaseLlmClient`의 요청/응답 타입을 신규 타입으로 전환
- [ ] `utils/retry.ts`를 `LlmError` 기반으로 리팩토링
- [ ] Hook 시스템(`hooks/types.ts`)의 타입 전환

**검증 기준**:
- `ContentGenerator` 호출 경로가 신규 타입으로 동작
- Retry/Hook이 프로바이더 독립 에러로 동작

---

### M2.2: GeminiChat 스트리밍 분해 및 합성기 적용 (5-7일)

**목표**: 스트리밍 로직의 Gemini 결합 해소

**작업 항목**:
- [ ] `StreamEvent`를 `LlmStreamEvent`로 교체
- [ ] 스트림 합성 로직(StreamAssembler) 적용
- [ ] Gemini 특화 에러(`InvalidStreamError` 등) 공통 에러로 맵핑
- [ ] Telemetry semantic 분석을 provider-agnostic 포맷으로 변경

**검증 기준**:
- GeminiChat이 신규 StreamEvent로 동작
- Telemetry가 provider 공통 스키마로 기록

---

### M2.3: GeminiAdapter 구현 및 동등성 검증 (3-5일)

**목표**: 기존 Gemini 경로를 어댑터로 캡슐화

**작업 항목**:
- [ ] `GeminiAdapter` 구현 (기존 GoogleGenAI 래핑)
- [ ] Gemini 타입 변환기 구현
- [ ] 기존 테스트/기능 1:1 동작 검증

**검증 기준**:
- 기존 Gemini 기능 100% 동작
- 기능 플래그로 신규 경로 전환 가능

## 5.4 Phase 3: 프로바이더 확장 및 통합

### M3.1: Claude 어댑터/변환기 구현 (4-5일)

**작업 항목**:
- [ ] Claude 메시지/툴/스트림 변환기 구현
- [ ] 스트리밍 tool delta 합성 로직 추가
- [ ] 이미지 URL 처리 및 base64 변환 정책 정의
- [ ] 단위/통합 테스트 작성

---

### M3.2: OpenAI 어댑터/변환기 구현 (3-4일)

**작업 항목**:
- [ ] OpenAI 메시지/툴/스트림 변환기 구현
- [ ] JSON mode/response_format 매핑
- [ ] 단위/통합 테스트 작성

---

### M3.3: OpenAI-Compatible(vLLM/sLM) 어댑터 템플릿 (3일)

**작업 항목**:
- [ ] `baseUrl`, `headers`, `apiKeyHeaderName` 지원
- [ ] 모델별 PromptBuilder/ChatTemplate 훅 포인트 제공
- [ ] vLLM/TGI/LM Studio 등과의 호환성 시나리오 정의

---

### M3.4: 통합 테스트/문서/안정화 (5-7일)

**작업 항목**:
- [ ] 멀티 프로바이더 통합 테스트 시나리오 확장
- [ ] E2E 테스트 (Gemini/Claude/OpenAI/vLLM)
- [ ] 성능 회귀 테스트 및 지표 수집
- [ ] 사용자/개발자 문서 업데이트

## 5.5 테스트 및 검증

**테스트 시나리오**:

| 시나리오 | Gemini | Claude | OpenAI | vLLM/OpenAI-Compat |
|----------|--------|--------|--------|--------------------|
| 기본 대화 | ✅ | ✅ | ✅ | ✅ |
| 스트리밍 대화 | ✅ | ✅ | ✅ | ✅ |
| 도구 호출 | ✅ | ✅ | ✅ | ✅ |
| 이미지 입력 | ✅ | ✅ | ✅ | ⚠️(모델별) |
| 긴 컨텍스트 | ✅ | ✅ | ✅ | ⚠️(모델별) |
| 에러 처리 | ✅ | ✅ | ✅ | ✅ |
| Rate limit | ✅ | ✅ | ✅ | ✅ |

**검증 기준**:
- 기존 Gemini 기능 100% 유지
- 신규 프로바이더 전환 시 기능 회귀 없음
- 성능 저하 < 50ms 목표 유지

## 5.6 리스크 관리

### 식별된 리스크

| ID | 리스크 | 확률 | 영향 | 대응 전략 |
|----|--------|------|------|-----------|
| R1 | 프로바이더별 기능 차이 | 높음 | 중간 | ModelSpec 기반 기능 가용성 체크 |
| R2 | 타입 변환 복잡도 | 높음 | 높음 | StreamAssembler/Converter 테스트 강화 |
| R3 | 대규모 의존성 교체(100+ 파일) | 높음 | 높음 | 단계적 마이그레이션(별칭 → 병행 → 제거) |
| R4 | 인증/라우팅 경로 충돌(authType vs provider) | 중간 | 높음 | 명시적 우선순위 규칙 정의 |
| R5 | 하위 호환성 | 중간 | 높음 | 기능 플래그 + 기존 경로 유지 |
| R6 | SDK/API 변경 | 중간 | 중간 | SDK 버전 고정 및 정기 검증 |

### 대응 계획

**R2/R3: 타입/스트리밍 전환 리스크**
- 신규 타입 도입과 동시에 레거시 별칭 유지
- StreamAssembler 공통 테스트 케이스 구축

**R4: 인증/라우팅 경로 충돌**
- `authType` 기반 경로는 유지, provider 선택은 별도 플래그로 격리
- 문서/CLI 도움말에 우선순위 규칙 명시

## 5.7 의존성 및 번들 크기 관리

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "openai": "^4.70.0"
  }
}
```

**리스크 평가**:
- CLI 특성상 번들 크기 증가 가능 → Dynamic Import 적용
- OpenAI-Compatible 어댑터는 `openai` SDK 재사용 (추가 의존성 없음)

## 5.8 출시 계획

| 버전 | 포함 내용 | 출시 시점 |
|------|-----------|-----------|
| 0.28.0-alpha | GeminiAdapter + 타입 전환(기능 플래그) | Phase 2 완료 후 |
| 0.28.0-beta | Claude/OpenAI + OpenAI-Compatible | Phase 3 일부 완료 후 |
| 0.28.0 | 안정화/문서/테스트 | Phase 3 종료 후 |

### 기능 플래그

```typescript
if (process.env.ENABLE_MULTI_PROVIDER === 'true') {
  // 새 아키텍처 사용
} else {
  // 기존 Gemini 전용 코드 사용
}
```
