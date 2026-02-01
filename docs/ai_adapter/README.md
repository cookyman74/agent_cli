# Multi-LLM Provider Adapter PRD

이 문서는 Gemini CLI를 다중 LLM 프로바이더(Gemini, Claude, OpenAI 및 OpenAI-compatible sLM)를 지원하도록 확장하기 위한 제품 요구사항 문서(PRD)입니다.

## 문서 구성

| 문서 | 설명 |
|------|------|
| [01-overview.md](./01-overview.md) | 프로젝트 개요, 배경, 현재 상태 분석 |
| [02-architecture.md](./02-architecture.md) | 현재 및 목표 아키텍처 설계 |
| [03-technical-design.md](./03-technical-design.md) | 상세 기술 설계 및 인터페이스 정의 |
| [04-integration-design.md](./04-integration-design.md) | DidimAIStudio 연동 설계 |
| [05-implementation-plan.md](./05-implementation-plan.md) | 구현 계획, 마일스톤, 리스크 관리 |

## 요약

### 목표
Gemini CLI를 어댑터 패턴으로 리팩토링하여 Gemini 외에 Claude, OpenAI, 그리고 vLLM 등 로컬 sLM을 포함한 다양한 LLM 프로바이더를 지원합니다. 특히 **프로바이더 간 상이한 메시지 포맷(System role, Image URL 등)과 스트리밍 프로토콜 차이를 정규화**하여 일관된 사용자 경험을 제공하는 것이 핵심입니다.

### 현재 상태
- Gemini API 전용 구조이며, `@google/genai` SDK 타입에 강하게 결합됨
- 확장성 있는 `ContentGenerator` 인터페이스 존재하나, 내부 구현이 특정 벤더에 종속적

### 주요 설계 포인트 & 확장성 전략
1. **프로바이더 독립적 타입 시스템 (`LlmMessage`, `LlmStreamEvent`)**: 벤더 종속성을 제거한 중립적 데이터 모델
2. **고도화된 변환기 (Type Converter) & 스트림 어셈블러**: 
    - Claude의 복잡한 메시지 규격(System 분리, Base64 이미지) 및 스트리밍 파편화 대응
    - OpenAI 및 호환 모델(vLLM)을 위한 유연한 매핑 구조
3. **OpenAI-Compatible 확장성**: `OpenAICompatibleAdapter`를 통해 vLLM, LM Studio 등 OpenAI API 규격을 따르는 다양한 로컬/소형 모델(sLM)을 '설정 추가'만으로 연동 가능
4. **유연한 설정 관리**: `ModelSpec`을 도입하여 모델별 제약사항(Context Window, Tool 지원 여부)을 런타임에 제어

### 예상 일정 및 리스크
- **총 예상 기간**: 6-8주
    - *주의*: `@google/genai` 의존 100+ 파일 마이그레이션, GeminiChat 988라인 리팩토링 필요
- **Phase 1 (기반 작업)**: 타입 분리, Adapter 인프라 구축, Provider 선택 경로 설계
- **Phase 2 (코어 리팩토링)**: Gemini 분리, StreamAssembler 적용, GeminiAdapter 구현
- **Phase 3 (프로바이더 확장)**: Claude, OpenAI, vLLM 호환성 검증 및 DidimAIStudio 연동

## 관련 파일

### Gemini CLI 핵심 분석 대상
- `packages/core/src/providers/*` - **[NEW - 신규 생성 예정]** 어댑터, 레지스트리, 타입 정의
- `packages/core/src/providers/<provider>/converter.ts` - **[NEW - 신규 생성 예정]** 핵심 변환 로직 (메시지/스트림)
- `packages/core/src/core/contentGenerator.ts` - 인터페이스 재정의 (기존 파일)
- `packages/core/src/core/client.ts` - 오케스트레이터 (의존성 주입 구조로 변경, 기존 파일)

### DidimAIStudio 연동 대상
- `/DidimAIStudio/services/scenario-gateway` - API 게이트웨이 (Port 8008)
  - `/app/api/v1/endpoints/scenario_api.py` - 시나리오 API 엔드포인트
  - `/app/dto/agents_dto.py` - DTO 정의
- `/DidimAIStudio/services/agents` - LLM 실행 엔진 (Port 8003)
  - `/app/api/v1/router.py` - API 라우터
  - `/v1/invoke`, `/v1/invoke/sse` - 핵심 실행 엔드포인트

## 버전 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| 0.1 | 2025-01-27 | - | 초안 작성 |
| 0.2 | 2026-01-29 | - | Claude/OpenAI 상세 설계(Converter), vLLM 확장성 전략(OpenAICompatible) 추가, Didim 연동 고도화 |
| 0.3 | 2026-01-30 | - | 문서 순서 재정렬 (04↔05), 소스코드 기반 리뷰 반영, 일정 현실화 (6-8주) |
| 0.4 | 2026-01-30 | - | DidimAIStudio 실제 소스코드 기반 연동 설계 업데이트 (scenario-gateway, agents 서비스 구조 반영) |
| 0.5 | 2026-01-30 | - | 리뷰 반영: LlmStreamEvent 타입 확장, capabilities 현실화, SSE 파서 개선, endpoint/mode 명확화 |
| 0.6 | 2026-01-30 | - | 리뷰 반영: LlmThoughtContent 타입 추가, 인증 우선순위 규칙, 서버 측 문맥 관리 UX 설계 |

