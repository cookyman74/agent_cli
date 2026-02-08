# Phase 2: M2.4 ModelConfigService 호환 레이어 작업 결과서

> 📅 **작업일**: 2026-02-08 📚 **Phase**: Phase 2 - M2.4 🎯 **목표**:
> ModelConfigService의 GenerateContentConfig 의존성 해결 — 양방향 변환기 +
> Bridge 래퍼 🔗 **이전 작업**:
> [Phase2_M2.3_GeminiAdapter구현\_20260208.md](./Phase2_M2.3_GeminiAdapter구현_20260208.md)
> 🔗 **관련 문서**:
> [phase2_core_refactoring_todolist.md](../todolist/phase2_core_refactoring_todolist.md) -
> M2.4

---

## 📋 작업 요약

### 2.4.1 호환 레이어 구현 ✅

#### 2.4.1.1 LlmModelConfig 인터페이스 정의 ✅

| 항목                                | 상태 | 비고                                               |
| ----------------------------------- | :--: | -------------------------------------------------- |
| `LlmModelConfig` 인터페이스         |  ✅  | model?, provider?, llmConfig?                      |
| `LlmModelConfigKey` 인터페이스      |  ✅  | model, provider?, overrideScope?, isRetry?         |
| `ResolvedLlmModelConfig` 인터페이스 |  ✅  | model, provider, llmConfig, generateContentConfig? |

#### 2.4.1.2 GenerateContentConfig 래퍼 구현 ✅ (ConfigConverter)

| 항목                                    | 상태 | 비고                                                                                         |
| --------------------------------------- | :--: | -------------------------------------------------------------------------------------------- |
| `fromGenerateContentConfig(gc, model)`  |  ✅  | GC → LlmGenerateConfig 변환                                                                  |
| `toGenerateContentConfig(lc)`           |  ✅  | LlmGenerateConfig → GC 역변환                                                                |
| COMMON_FIELDS 직접 매핑 (7개)           |  ✅  | temperature, topP, topK, maxOutputTokens, stopSequences, responseMimeType, systemInstruction |
| EXCLUDED_FIELDS 제외 (2개)              |  ✅  | httpOptions, abortSignal (인프라 전용)                                                       |
| Gemini-specific → providerOptions       |  ✅  | presencePenalty, seed, thinkingConfig, safetySettings 등                                     |
| responseMimeType ↔ responseFormat      |  ✅  | application/json ↔ json, text/plain ↔ text                                                 |
| systemInstruction ContentUnion → string |  ✅  | string, Content, Part[] 지원                                                                 |
| Round-trip 보존                         |  ✅  | from → to 라운드트립으로 필드 보존 검증                                                      |

**테스트**: 19개 (configConverter.test.ts)

#### 2.4.1.3 설정 머지 로직 확장 ✅

| 항목                                      | 상태 | 비고                                |
| ----------------------------------------- | :--: | ----------------------------------- |
| `ModelConfigBridge.mergeLlmModelConfig()` |  ✅  | static 메서드, base + override 병합 |
| model/provider 오버라이드                 |  ✅  | override 우선                       |
| llmConfig deep merge                      |  ✅  | undefined 필터링 포함               |
| 빈 base/override 처리                     |  ✅  | 양쪽 모두 빈 객체 지원              |

#### 2.4.1.4 프로바이더별 설정 분기 ✅

| 항목                                   | 상태 | 비고                                     |
| -------------------------------------- | :--: | ---------------------------------------- |
| Gemini: ModelConfigService 위임 + 변환 |  ✅  | resolveGemini() — 기존 서비스 활용       |
| Non-Gemini: 등록된 LlmModelConfig 해결 |  ✅  | resolveNonGemini() — registerLlmConfig() |
| 기본 프로바이더 gemini 폴백            |  ✅  | provider 미지정 시 gemini                |
| alias 체인 해결 (Gemini)               |  ✅  | chat-model → base → gemini-2.0-flash     |
| override 적용 (isRetry, overrideScope) |  ✅  | ModelConfigService 기존 로직 활용        |
| 레거시 passthrough                     |  ✅  | getResolvedConfig() → ModelConfigService |

**테스트**: 21개 (modelConfigBridge.test.ts)

### 2.4.2 ModelRouterService 연동 → M2.6 이월

| 항목                            | 상태 | 비고                                  |
| ------------------------------- | :--: | ------------------------------------- |
| 2.4.2.1 라우팅 컨텍스트 확장    |  ⏸️  | M2.6 라우팅 레이어 타입 독립화와 통합 |
| 2.4.2.2 프로바이더 인식 라우팅  |  ⏸️  | M2.6에서 처리                         |
| 2.4.2.3 기존 라우팅 전략 호환성 |  ⏸️  | M2.6에서 처리                         |

**이월 사유**: M2.6이 routingStrategy.ts의 `@google/genai` 타입 독립화를
다루므로, 라우팅 컨텍스트 확장과 프로바이더 인식 라우팅을 함께 처리하는 것이
효율적.

---

## 📊 검증 결과

| 검증 항목                     |       결과        | 비고                             |
| ----------------------------- | :---------------: | -------------------------------- |
| 전체 테스트                   | ✅ 4760/4760 pass | 기존 4720 + 신규 40              |
| TypeScript 컴파일             |      ✅ 클린      | tsc --noEmit 0 errors            |
| ESLint                        |      ✅ 통과      | pre-commit hook 통과             |
| 기존 기능 100% 동작           |        ✅         | 기존 테스트 전체 통과            |
| ConfigConverter 라운드트립    |        ✅         | 기본 필드 + providerOptions 보존 |
| ModelConfigBridge Gemini 해결 |        ✅         | ModelConfigService 위임 정상     |
| ModelConfigBridge Non-Gemini  |        ✅         | claude/openai 프로바이더 해결    |

---

## 📁 파일 목록

### 신규 생성

| 파일                                       | 용도                                                   | LOC  |
| ------------------------------------------ | ------------------------------------------------------ | ---- |
| `providers/gemini/configConverter.ts`      | GenerateContentConfig ↔ LlmGenerateConfig 양방향 변환 | ~200 |
| `providers/gemini/configConverter.test.ts` | ConfigConverter TDD 테스트 (19개)                      | ~260 |
| `services/modelConfigBridge.ts`            | ModelConfigService 래핑 — 프로바이더 독립 설정 해결    | ~185 |
| `services/modelConfigBridge.test.ts`       | ModelConfigBridge TDD 테스트 (21개)                    | ~397 |

### 수정

| 파일                        | 변경 내용                                                      |
| --------------------------- | -------------------------------------------------------------- |
| `providers/gemini/index.ts` | fromGenerateContentConfig, toGenerateContentConfig export 추가 |

---

## 🔑 핵심 설계 결정

### 1. Bridge 패턴 선택 (ModelConfigBridge)

**문제**: ModelConfigService는 `GenerateContentConfig` (Gemini SDK)에 깊이
결합되어 있음 (359라인, alias 체인, override 규칙 등).

**결정**: 기존 ModelConfigService를 수정하지 않고 Bridge 클래스로 래핑.

```
ModelConfigBridge
├── Gemini: ModelConfigService.getResolvedConfig() → fromGenerateContentConfig() → ResolvedLlmModelConfig
└── Non-Gemini: registerLlmConfig() → resolveNonGemini() → ResolvedLlmModelConfig
```

**장점**:

- 기존 ModelConfigService 코드 무변경 (회귀 위험 0)
- alias 체인, override 규칙 등 복잡한 로직 재활용
- Non-Gemini 프로바이더는 별도 경로로 독립 확장

### 2. ConfigConverter 양방향 설계

**문제**: GenerateContentConfig에는 ~50개 필드가 있으나 LlmGenerateConfig는 7개
공통 필드만 지원.

**결정**: 공통 필드는 직접 매핑, Gemini 전용 필드는 `providerOptions`에 보존.

```
Common (7): temperature, topP, topK, maxOutputTokens, stopSequences, responseMimeType, systemInstruction
Excluded (2): httpOptions, abortSignal (인프라 전용)
Provider-specific: providerOptions에 저장 (presencePenalty, seed, thinkingConfig, safetySettings 등)
```

**장점**: 라운드트립 보존 — `from → to`로 원본 복원 가능.

### 3. 2.4.2 M2.6 이월

**결정**: ModelRouterService 연동(2.4.2)을 M2.6으로 이월. **사유**: M2.6이
routingStrategy.ts의 `Content`, `PartListUnion` 타입 제거를 다루므로, 라우팅
컨텍스트 확장과 프로바이더 인식 라우팅을 함께 처리하는 것이 중복 방지 및 일관성
면에서 효율적.

---

## ⚠️ 다음 마일스톤 이월 사항

### M2.5로 이월

| 항목                                                  | 우선순위 | 비고          |
| ----------------------------------------------------- | -------- | ------------- |
| loggingContentGenerator ProviderApiResponseEvent 전환 | 중간     | M2.2에서 이월 |
| client.ts GeminiEventType 참조 정리                   | 중간     | M2.2에서 이월 |
| turn.ts 이벤트 생성점 전환                            | 중간     | M2.2에서 이월 |

### M2.6으로 이월

| 항목                          | 우선순위 | 비고                           |
| ----------------------------- | -------- | ------------------------------ |
| 2.4.2 ModelRouterService 연동 | 높음     | 라우팅 타입 독립화와 통합 처리 |

---

## 📌 커밋 정보

| 커밋 | 해시      | 설명                                                      |
| ---- | --------- | --------------------------------------------------------- |
| feat | 4fa19a255 | feat(providers): M2.4 ModelConfigService 호환 레이어 구현 |

---

## ✅ 체크리스트

- [x] 본작업 완료: 2.4.1 (configConverter + modelConfigBridge)
- [x] 2.4.2 스코프 평가 후 M2.6 이월 결정
- [x] 테스트: 40개 신규, 4760개 전체 통과
- [x] TypeScript 컴파일: 클린
- [x] ESLint: 통과 (pre-commit hook)
- [x] 커밋: 4fa19a255 (feat)
- [x] 작업 결과서 작성
