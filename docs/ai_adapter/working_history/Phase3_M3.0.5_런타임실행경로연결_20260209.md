# M3.0.5 작업 결과서 — 런타임 실행 경로 연결

- **작업일**: 2026-02-09
- **브랜치**: `DID/v0.1`
- **상태**: ✅ 완료

## 작업 목표

`createContentGenerator()`의 하드코딩된 `new GoogleGenAI()` 경로를
`ProviderFactory`/`ProviderRegistry`/`selectProvider()`와 연결하여,
`ENABLE_MULTI_PROVIDER=true` 시 비-Gemini 프로바이더가 런타임에서 도달
가능하도록 한다.

## 작업 순서 및 결과

| 순서 | Sub-task | 작업 내용                                                                              | 테스트 결과      |
| ---- | -------- | -------------------------------------------------------------------------------------- | ---------------- |
| 1    | 3.0.5.4  | `bootstrapGeminiProvider()` 함수 생성 + has() 가드 + 7개 테스트                        | 7/7 PASS         |
| 2    | 3.0.5.1  | `contentGenerator.ts` — 멀티 프로바이더 분기 추가                                      | TypeCheck PASS   |
| 3    | 3.0.5.3  | `ENABLE_MULTI_PROVIDER` 플래그 분기: off→레거시, on+Gemini→레거시, on+비Gemini→Factory | 10/10 PASS       |
| 4    | 3.0.5.2  | `ProviderFactory.create()` 런타임 경로 연결                                            | 통합 테스트 포함 |
| 5    | 3.0.5.5  | 7개 회귀 시나리오 + 3개 추가 테스트                                                    | 10/10 PASS       |

## 변경 파일 상세

### 3.0.5.4: bootstrapGeminiProvider

**신규 파일**: `providers/gemini/bootstrap.ts`

- `bootstrapGeminiProvider(registry?)`: ProviderRegistry에 Gemini 팩토리 등록
- `has()` 가드 패턴으로 중복 등록 안전성 확보
- 팩토리 내부: `new GoogleGenAI(config)` → `new GeminiAdapter(config, models)`
- `providers/gemini/index.ts`에 re-export 추가

**테스트 파일**: `providers/gemini/bootstrap.test.ts` (7개 테스트)

- 등록 확인, 중복 호출 안전성, 어댑터 생성, 싱글톤 사용, config 전달 (apiKey,
  vertexai, 빈 apiKey)

### 3.0.5.1+3: contentGenerator.ts 멀티 프로바이더 분기

**수정 파일**: `core/contentGenerator.ts`

**추가 import** (7개):

- `isMultiProviderEnabled` (featureFlag)
- `selectProvider` (providerSelector)
- `ProviderType` (providerTypes)
- `ProviderFactory` (factory)
- `bootstrapGeminiProvider` (bootstrap)
- `BaseAdapter` (baseAdapter, type-only)
- `AuthType as ProviderAuthType` (providerTypes, type-only)

**추가 함수**:
`wrapAdapterAsGenerator(adapter: BaseAdapter): GeminiContentGenerator`

- 비-Gemini 프로바이더의 BaseAdapter를 GeminiContentGenerator 인터페이스로 래핑
- 레거시 메서드 (generateContent 등): 에러 throw ("does not support legacy
  Gemini API")
- llm\* 메서드: adapter에 위임 (generateContent, generateContentStream,
  countTokens)
- `isProviderIndependentGenerator()` 타입 가드로 llm\* 가용성 검출 가능

**멀티 프로바이더 분기** (L269-L287):

```typescript
if (isMultiProviderEnabled()) {
  const selection = selectProvider({
    authType: config.authType as unknown as ProviderAuthType,
  });
  if (selection.type !== ProviderType.Gemini) {
    bootstrapGeminiProvider();
    const factory = new ProviderFactory();
    const adapter = factory.create(selection.type, {
      apiKey: selection.apiKey,
      baseUrl: selection.baseUrl,
    });
    return new LoggingContentGenerator(
      wrapAdapterAsGenerator(adapter),
      gcConfig,
    );
  }
  // Gemini: fall through to existing paths
}
```

### 3.0.5.5: 회귀 테스트

**신규 파일**: `core/contentGenerator.multiProvider.test.ts` (10개 테스트)

7개 회귀 시나리오:

| #   | ENABLE_MULTI_PROVIDER | LLM_PROVIDER | authType      | 기대 결과        | 결과 |
| --- | --------------------- | ------------ | ------------- | ---------------- | ---- |
| 1   | false                 | (미설정)     | USE_GEMINI    | Gemini (legacy)  | ✅   |
| 2   | false                 | claude       | USE_GEMINI    | Gemini (legacy)  | ✅   |
| 3   | true                  | (미설정)     | USE_GEMINI    | Gemini           | ✅   |
| 4   | true                  | claude       | (미설정)      | Claude           | ✅   |
| 5   | true                  | openai       | USE_VERTEX_AI | OpenAI           | ✅   |
| 6   | true                  | (미설정)     | USE_VERTEX_AI | Gemini           | ✅   |
| 7   | true                  | (미설정)     | (미설정)      | Gemini (default) | ✅   |

3개 추가 테스트:

- llmGenerateContent 위임 동작 확인
- 레거시 generateContent 에러 throw 확인 (비-Gemini)
- 부트스트랩 멱등성 (2회 연속 호출)

## Quality Gate

| 항목       | 결과                       |
| ---------- | -------------------------- |
| TypeCheck  | ✅ PASS                    |
| ESLint     | ✅ PASS                    |
| Core Tests | ✅ 262 files / 4876 passed |

**변화**: 기준선 260 files / 4859 → +2 files, +17 tests

## 설계 결정

### 부트스트랩 전략

- **결정**: `has()` 가드 패턴
- **근거**: `force: true`는 기존 등록 덮어쓰기 위험, 1회 초기화 플래그는 모듈
  레벨 상태 추가 필요. `has()` 가드가 가장 단순하고 안전.
- **위치**: `createContentGenerator()` 진입부 (비-Gemini 분기 내)
- 매 호출마다 실행되나 `has()` 체크가 O(1)이므로 성능 영향 무시 가능

### wrapAdapterAsGenerator 설계

- **결정**: 레거시 메서드 throw + llm\* 위임 패턴
- **근거**: 비-Gemini 프로바이더는 Gemini SDK 타입을 지원할 수 없으므로 레거시
  메서드는 명확한 에러 메시지와 함께 throw. CLI 코드가 llm\* 메서드로 전환되면
  (M3.1+) 완전 동작 가능.
- `isProviderIndependentGenerator()` 타입 가드로 호출 전 분기 가능

### 멀티 프로바이더 분기 위치

- **결정**: baseHeaders 설정 후, OAuth/API key 분기 전
- **근거**: 비-Gemini 프로바이더는 Gemini-specific 헤더(인증, User-Agent)가
  불필요하므로 조기 반환. Gemini 선택 시 기존 코드로 fall-through.

### AuthType 호환성

- **결정**: `config.authType as unknown as ProviderAuthType` 캐스팅
- **근거**: 두 AuthType enum이 동일한 문자열 값 보유 (core vs providers). 타입
  시스템에서 nominal typing이므로 `as unknown as` 필요. 값은 동일하여 런타임
  안전.

## 향후 작업

- M3.1~M3.3: 각 프로바이더 어댑터 구현 + `registry.register()` 호출 추가
  - Claude: `registry.register('claude', (config) => new ClaudeAdapter(config))`
  - OpenAI: `registry.register('openai', (config) => new OpenAIAdapter(config))`
- CLI 코드: `isProviderIndependentGenerator()` 분기 추가하여 llm\* 메서드 사용
- `wrapAdapterAsGenerator` 개선: 텔레메트리 통합, 에러 매핑 등

## 커밋

- `54cf15f0b` feat(providers): M3.0.5 — 런타임 실행 경로 연결 (multi-provider
  runtime wiring)
