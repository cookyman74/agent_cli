# Master Implementation Plan Review Report

## 1. 개요
본 리포트는 `docs/ai_adapter/todolist/00_master_implementation_plan.md`에 기술된 Gemini CLI Multi-LLM Provider Adapter 구현 계획을 소스코드 분석을 통해 검증한 결과입니다.

**검토 대상**:
- `packages/core` 내 주요 소스코드 및 의존성
- `Turn`, `ContentGenerator`, `ModelConfigService` 등 핵심 클래스
- `@google/genai` 라이브러리 사용 현황

## 2. 코드 분석 결과 및 검증

### 2.1 `@google/genai` 의존성 (Critical Issue #1 확인)
**분석 결과**: `packages/core` 내 114개 파일에서 `@google/genai`를 임포트하고 있음이 확인되었습니다.
- **주요 결합 지점**:
  - `src/core/turn.ts`: `PartListUnion`, `GenerateContentResponse` 등 핵심 타입 사용
  - `src/core/contentGenerator.ts`: 인터페이스 자체가 SDK 타입에 의존
  - `src/utils/tokenCalculation.ts`: `Part` 구조(inlineData, fileData)에 의존한 휴리스틱 구현
  - `src/services/modelConfigService.ts`: `GenerateContentConfig`를 설정 모델로 직접 사용

**평가**: 계획서에 언급된 "100+ 파일 영향"은 정확하며, 단순 텍스트 치환이 아닌 **구조적 타입 분리**가 필수적입니다. Phase 1의 `types.ts` 정의 및 `legacyAliases.ts` 전략이 매우 중요합니다.

### 2.2 `GeminiEventType` 매핑 전략 (Critical Issue #2 확인)
**분석 결과**: `src/core/turn.ts`의 `GeminiEventType`은 18개 이벤트를 포함하며, 단순 콘텐츠 델타 외에 `Thought`, `Citation`, `LoopDetected`, `ChatCompressed` 등 고유한 로직이 포함되어 있습니다.

**평가**:
- 계획서의 **옵션 B (어댑터 매핑 + 기존 이벤트 유지)** 전략이 타당합니다.
- `Turn` 클래스가 이 이벤트들을 소비하는 주체이므로, `LlmStreamEvent`로 전면 교체 시 `Turn` 클래스의 로직을 완전히 재작성해야 하는 위험이 있습니다.
- **제언**: `GeminiEventType`을 `LlmStreamEvent`의 확장(metadata)으로 처리하거나, Adapter 내부에서 `LlmStreamEvent`를 `GeminiEventType`으로 변환하여 `Turn`에 전달하는 역방향 호환성 레이어가 필요할 수 있습니다.

### 2.3 설정 서비스 호환성 (High Priority #4 확인)
**분석 결과**: `ModelConfigService`는 `GenerateContentConfig` 객체를 병합(merge)하는 로직을 포함하고 있습니다.

**평가**:
- `LlmGenerateConfig` 도입 시 `ModelConfigService.merge` 로직도 수정되어야 합니다.
- 기존 사용자의 `config.yaml`이나 환경변수 설정이 깨지지 않도록 **호환 레이어(Config Adapter)** 구현이 시급합니다.

### 2.4 토큰 계산 로직
**분석 결과**: `src/utils/tokenCalculation.ts`는 `Part` 객체의 속성(`inlineData`, `fileData`)을 직접 검사하여 토큰을 추정합니다.

**평가**:
- 프로바이더별 토큰 계산 방식이 다르므로(Claude는 문자 수 기반 추정 등), `ContentGenerator` 인터페이스에 `countTokens`가 포함된 것은 적절하나, `utils` 내의 동기식 추정 로직(`estimateTokenCountSync`)은 `LlmContent` 타입을 처리하도록 리팩토링되어야 합니다.

## 3. 잠재적 리스크 및 제언

### 3.1 리스크: `Turn` 클래스의 복잡성
`Turn` 클래스는 Gemini의 스트리밍 응답(`GenerateContentResponse`)을 직접 처리하며, `debugResponses`에 원본 응답을 저장하고 있습니다. 어댑터 도입 시 이 "원본 응답"을 어떻게 유지할지(`rawResponse` 필드 활용 등)에 대한 구체적인 설계가 구현 단계에서 필요합니다.

### 3.2 리스크: 테스트 마이그레이션 부하
`geminiChat.test.ts` 등 핵심 테스트가 SDK의 모의 객체(Mock)에 의존하고 있습니다. 어댑터 패턴 도입 시 이 모의 객체들을 모두 `ContentGenerator` 인터페이스 기반의 Mock으로 교체해야 하므로 테스트 수정 비용이 예상보다 클 수 있습니다.

### 3.3 제언: 단계적 적용 순서
계획서의 순서는 타당하나, 다음 순서를 강력히 권장합니다:
1. **타입 정의 (`Llm*`) 및 Alias 적용**: 기존 코드 변경 없이 타입만 별칭으로 연결
2. **Utility 리팩토링**: `tokenCalculation`, `partUtils` 등을 범용 타입(`LlmContent`)을 받도록 수정 (Overloading 활용)
3. **Adapter 구현**: 실제 로직 분리

## 4. 결론
작성된 `00_master_implementation_plan.md`는 현재 코드베이스의 구조적 한계와 의존성을 정확히 파악하고 있으며, 제시된 해결책(TDD, 어댑터 패턴, 호환 레이어)은 적절합니다. 특히 **Phase 1의 타입 분리 작업**이 프로젝트의 성공을 좌우할 핵심 마일스톤이 될 것입니다.

승인합니다. Phase 1 작업을 시작하십시오.
