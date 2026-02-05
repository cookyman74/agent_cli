# Phase 1 M1.2: Adapter 인프라 구축 작업 기록

**작업일**: 2026-02-03 **작업자**: AI Assistant **관련 문서**:

- [00_master_implementation_plan.md](../todolist/00_master_implementation_plan.md) -
  M1.2
- [phase1_foundation_todolist.md](../todolist/phase1_foundation_todolist.md) -
  M1.2

---

## 📋 개요

**목표**: 프로바이더 독립적인 어댑터 패턴의 핵심 인프라 구축 (BaseAdapter,
Registry, Factory 등)

**진행 방식**: 5단계로 나누어 순차적으로 진행하며, 각 단계 완료 시 피드백 반영.

| 단계  | 작업 항목             | 상태    | 비고                         |
| ----- | --------------------- | ------- | ---------------------------- |
| 1.2.1 | **BaseAdapter 구현**  | ✅ 완료 | 추상 클래스, 공통 인터페이스 |
| 1.2.2 | ProviderRegistry 구현 | ⬜ 대기 | 싱글톤 레지스트리            |
| 1.2.3 | ProviderFactory 구현  | ⬜ 대기 | 동적 생성 팩토리             |
| 1.2.4 | StreamAssembler 구현  | ⬜ 대기 | 스트림 조립기                |
| 1.2.5 | 지원 모듈 구현        | ⬜ 대기 | Resolver, Spec, Config       |

---

## 🏗️ 1.2.1 BaseAdapter 구현

### 📝 계획

- **목표**: 모든 프로바이더 어댑터의 기반이 되는 추상 클래스 `BaseAdapter` 정의
- **파일**:
  - `packages/core/src/providers/baseAdapter.ts` (신규)
  - `packages/core/src/providers/baseAdapter.test.ts` (신규)

### 🔴 Red Phase (테스트 작성)

- [x] `LlmAdapter` 인터페이스 정의 테스트
- [x] `BaseAdapter` 추상 메서드 (`generate`, `generateStream`,
      `mapToProviderConfig`) 검증 테스트
- [x] `validateConfig` 공통 메서드 테스트
- **결과**: 테스트 실패 확인 (`Failed to load url ./baseAdapter.js`)

**작성된 테스트 (TestAdapter)**:

```typescript
class TestAdapter extends BaseAdapter {
  // ... abstract methods implemented as mocks ...
}

describe('BaseAdapter', () => {
  it('should require mapToProviderConfig implementation', () => {
    const adapter = new TestAdapter(mockConfig);
    const mappedConfig = adapter.mapToProviderConfig(mockConfig);
    expect(mappedConfig).toEqual({ ... });
  });
});
```

### 🟢 Green Phase (구현)

- [x] `LlmAdapter` 인터페이스
- [x] `BaseAdapter` 추상 클래스
- [x] 공통 유틸리티 메서드 구현
- **결과**: 테스트 통과 (4 passed)

**구현된 BaseAdapter**:

```typescript
export abstract class BaseAdapter implements LlmAdapter {
  protected config: LlmGenerateConfig;

  constructor(config: LlmGenerateConfig) {
    this.config = config;
  }

  getCapabilities(): LlmProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsTools: false,
      supportsImages: false,
    };
  }

  // Abstract methods to be implemented by providers
  abstract mapToProviderConfig(
    config: LlmGenerateConfig,
  ): Record<string, unknown>;
  abstract generate(request: LlmGenerateRequest): Promise<LlmGenerateResponse>;
  abstract generateStream(request: LlmGenerateRequest): LlmStream;
}
```

### 🔄 Refactor Phase

- [x] 타입 안전성 강화
- [x] 에러 처리 표준화 (`LlmError` 활용)

**변경 내역 (LlmError)**:

```typescript
validateConfig(): void {
  if (!this.config) {
    throw new LlmError(LlmErrorType.VALIDATION, 'Configuration is required');
  }
}
```

- **결과**: 테스트 통과 (4 passed)

**구현된 BaseAdapter Capabilities (Updated)**:

```typescript
getCapabilities(): LlmProviderCapabilities {
  return {
    supportsStreaming: true,
    supportsToolCalls: false,
    supportsImageInput: false,
    supportsImageGeneration: false,
    supportsEmbedding: false,
    supportsTokenCount: false,
    supportsSystemMessage: true,
    supportsThought: false,
    maxContextLength: 8192,
    maxOutputTokens: 4096,
  };
}
```

### � Refactor & Fix Phase (피드백 반영)

- [x] 타입 안전성 강화
- [x] 에러 처리 표준화 (`LlmError` 활용)
- [x] **[Round 1 Issue Fix]**
  - `LlmGenerateConfig` 타입 정의 추가
  - `LlmProviderCapabilities` 정합화
  - `index.ts` export 추가
- [x] **[Round 2 Issue Fix]**
  - 스트림 타입 통일: `LlmStream` (types.ts) -> `LlmEventStream` (events.ts)로
    교체
  - 문서-코드 불일치 해소
  - 테스트 코드 개선 (미사용 변수 제거, `LlmEvent` 사용)

### 🚀 Critical Refactor (3차 리뷰 반영)

**주요 변경 사항 (Design Alignment)**:

- **인터페이스 변경**: `LlmAdapter` → `ContentGenerator` (설계 문서 §3.2.1 준수)
- **메서드 서명 수정**:
  - `generateContent(request, userPromptId, options)`: 필수 인자(`userPromptId`)
    및 옵션(`signal`, `timeout`) 추가
  - `generateContentStream(...)`: 동일하게 서명 일치
- **설정 분리**:
  - `AdapterConfig`: 인스턴스 초기화용 (API Key 등)
  - `LlmGenerateConfig`: 생성 요청 기본값용
- **누락 기능 추가**:
  - `countTokens(request)`: 추상 메서드 추가
  - `validateRequest(request)`: 공통 검증 로직 구현
  - `embedContent(request)`: 기본 구현 (Unsupported Error) 추가
- **테스트 커버리지 확대**:
  - `generateContentStream` 및 `countTokens` 테스트 케이스 추가 (총 6개 테스트
    통과)

### 🔧 4차 리뷰 반영 (report.md 이슈 해결)

**검증 및 수정 완료된 이슈 목록**:

|  우선순위  | 이슈                                        | 조치 내용                                            |
| :--------: | ------------------------------------------- | ---------------------------------------------------- |
|  **High**  | `LlmErrorType.UNSUPPORTED` 컴파일 오류      | `UNSUPPORTED_FEATURE`로 수정 (baseAdapter.ts)        |
| **Medium** | `embedContent` 인터페이스 미노출            | `ContentGenerator`에 optional 메서드 추가 (types.ts) |
| **Medium** | `LlmStream`/`LlmStreamEvent` 타입 혼선      | `@deprecated` 주석 추가, `LlmEventStream` 사용 권장  |
| **Medium** | `capabilities` 기본값 문서 불일치           | 코드(abstract property)가 정확함, 문서 해석 오류     |
|  **Low**   | `validateRequest()` 호출 경로 부재          | JSDoc에 서브클래스 호출 가이드 추가                  |
|  **Low**   | `LlmTokenCount` 중복 정의                   | 중복 정의 제거 (Line 404-411)                        |
|  **Low**   | `GenerateOptions`/`LlmGenerateOptions` 중복 | `LlmGenerateOptions`에 `@deprecated` 추가            |

### 🔧 5차 리뷰 반영 (추가 이슈 해결)

|  우선순위  | 이슈                              | 조치 내용                                                     |
| :--------: | --------------------------------- | ------------------------------------------------------------- |
| **Medium** | `ContentGenerator` 이중 정의 혼선 | JSDoc에 `core/contentGenerator.ts`와의 구분 설명 추가         |
|  **Low**   | `embedContent` 에러 타입 불일치   | `UnsupportedFeatureError` 클래스 사용으로 통일                |
|  **Low**   | `countTokens` 기본 동작 미정의    | 기본 구현 추가 (capability 체크 후 `UnsupportedFeatureError`) |
|  **Low**   | `embedContent` 타입 미정의        | TODO 주석 추가 (M1.3 예정)                                    |

---
