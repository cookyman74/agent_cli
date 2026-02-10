# /model 멀티 프로바이더 확장 기능 변경 계획서

- 작성일: 2026-02-09
- 대상: `didim` CLI (`@google/gemini-cli`, `@google/gemini-cli-core`)
- 목적: `/model` 명령을 Gemini 전용에서 Claude/OpenAI 등 멀티 프로바이더
  환경에서도 실사용 가능하도록 확장

## 1. 배경

현재 `/model` 명령은 존재하지만, 모델 선택 UI가 Gemini 모델 목록 중심으로
구성되어 있어 Claude/OpenAI 사용 시 모델 전환 UX가 일관되지 않다.

현행 코드 기준:

- `/model` 명령 진입: `packages/cli/src/ui/commands/modelCommand.ts`
- 모델 다이얼로그 UI: `packages/cli/src/ui/components/ModelDialog.tsx`
- 프로바이더 선택: `LLM_PROVIDER` + `ENABLE_MULTI_PROVIDER`
  (`packages/core/src/providers/providerSelector.ts`,
  `packages/core/src/providers/gemini/featureFlag.ts`)
- 모델 반영: `config.setModel()` (`packages/core/src/config/config.ts`)

즉, 런타임 자체는 멀티 프로바이더 경로를 가지고 있으나, `/model`의 선택
UX/검증/안내가 Gemini 편향 상태다.

## 2. 목표

1. `/model` 명령으로 현재 활성 프로바이더에 맞는 모델 목록을 선택할 수 있다.
2. Claude/OpenAI 등 비-Gemini 프로바이더에서도 `/model` 변경이 즉시 반영된다.
3. 환경변수 기반 프로바이더 선택(`LLM_PROVIDER`)과 충돌 없이 동작한다.
4. 기존 Gemini UX(자동/수동/프리뷰) 회귀를 방지한다.

## 3. 비목표

1. 이번 범위에서 `--provider` CLI 옵션 신규 추가는 제외한다.
2. 원격 모델 카탈로그를 실시간 조회하는 기능은 제외한다.
3. Provider별 고급 파라미터(temperature preset, reasoning budget 등) 편집은
   제외한다.

## 4. 요구사항 정의

### 4.1 기능 요구사항

- `/model` 실행 시 현재 provider 컨텍스트를 인지한다.
- provider별 모델 목록을 UI에 표시한다.
- 모델 선택 시 `config.setModel()`을 통해 세션 모델을 갱신한다.
- `Remember model` 동작(영구 저장/임시 저장)을 provider 독립적으로 유지한다.

### 4.2 UX 요구사항

- 다이얼로그 상단에 현재 provider를 명시한다. (예: `Provider: Claude`)
- provider별 모델 목록 출처/제약을 안내한다. (예: "환경/배포에 따라 일부 모델은
  실패 가능")
- 모델이 비어있거나 설정이 불완전할 경우 명확한 에러 문구를 보여준다.

### 4.3 호환성 요구사항

- `ENABLE_MULTI_PROVIDER=false`에서는 기존 Gemini 중심 동작을 유지한다.
- `ENABLE_MULTI_PROVIDER=true` + `LLM_PROVIDER=claude/openai/...`에서 provider
  맞춤 목록으로 전환한다.

## 5. 설계 방향

## 5.1 핵심 설계 원칙

1. **Provider 결정은 Core 정책 재사용**: CLI에서 provider를 임의 판단하지 않고
   `selectProvider()` 결과를 우선 활용.
2. **ModelDialog는 표시/선택에 집중**: provider 판별, 후보 모델 조립은 별도
   유틸/서비스로 분리.
3. **Gemini 특화 UX 보존**: Gemini는 기존 자동/수동/프리뷰 플로우를 유지, 타
   provider는 단순 목록 선택 UX 우선.

## 5.2 제안 컴포넌트 구조

1. `ModelOptionService`(신규, CLI 레이어)

- 입력: `config`, env(`ENABLE_MULTI_PROVIDER`, `LLM_PROVIDER`)
- 출력: `ModelDialogViewModel`
  - `providerName`
  - `options[]`
  - `selectedModel`
  - `supportsAutoModel` 등

2. `ModelDialog`(기존 확장)

- `ModelOptionService` 결과를 렌더링
- provider가 Gemini일 때 기존 main/manual 뷰 유지
- provider가 비-Gemini일 때 provider 전용 단일 목록 뷰 표시

3. provider별 기본 모델 목록 소스

- 1차: 정적 카탈로그(코드 상수)로 시작
- 2차(후속): 설정 파일/원격 조회 확장 가능하도록 인터페이스 유지

## 5.3 모델 목록 소스(초기안)

- Gemini: 기존 상수 재사용
- Claude: Sonnet/Haiku 계열 기본값 제공
- OpenAI: GPT 계열 기본값 제공
- Didim/OpenAI-Compatible: 사용자가 설정 기반으로 커스텀 모델 입력 가능하도록
  fallback 항목 제공

## 6. 작업 절차

## 6.1 사전작업

1. 현행 `/model` 흐름 문서화

- `modelCommand.ts -> ModelDialog.tsx -> config.setModel()` 흐름 재확인

2. provider 선택 정책 고정

- `selectProvider()` 우선순위(`LLM_PROVIDER > authType > key`)를 테스트 케이스로
  명세

3. 모델 카탈로그 초안 확정

- provider별 기본 후보 모델 문자열 목록 확정

## 6.2 본작업

1. `ModelOptionService` 구현

- provider 판별
- provider별 옵션 구성
- 현재 선택 모델 인덱스 계산

2. `ModelDialog` 리팩터

- Gemini 경로: 기존 UI 유지
- Non-Gemini 경로: 공통 리스트 UI + provider 라벨
- 저장 모드(`persistMode`) 동작 유지

3. `/model` 설명/헬프 보강

- Gemini 전용 표현을 provider-agnostic 문구로 수정

4. 예외 처리 보강

- provider 미설정/키 미설정/목록 없음 상태 메시지 추가

## 6.3 사후작업

1. 테스트 추가/보강
2. 문서 반영 (`/model` 사용법, provider별 예시)
3. 회귀 점검 (Gemini 기존 동작)

## 7. 테스트 계획 (TDD)

## 7.1 단위 테스트

1. `ModelOptionService.test.ts`

- `ENABLE_MULTI_PROVIDER=false` -> Gemini 옵션 반환
- `ENABLE_MULTI_PROVIDER=true`, `LLM_PROVIDER=claude` -> Claude 옵션 반환
- `LLM_PROVIDER=openai` -> OpenAI 옵션 반환
- 미지원/비정상 상태 graceful fallback

2. `ModelDialog.test.tsx`

- provider별 렌더링 스냅샷
- 선택 시 `config.setModel()` 호출 검증
- `persistMode` 토글 시 `isTemporary` 인자 검증

3. `modelCommand.test.ts`

- `/model` 호출 시 dialog open 동작 유지

## 7.2 통합 테스트

- `useGeminiStream` 또는 AppContainer 경로에서 `/model` 선택 후 실제 요청 모델
  반영 여부 검증
- Claude/OpenAI provider mock으로 모델 전환 후 sendMessage 요청 모델값 확인

## 7.3 수동 스모크

1. Gemini 경로

- `ENABLE_MULTI_PROVIDER=false` 상태에서 기존 `/model` UX 동일성 확인

2. Claude 경로

- `ENABLE_MULTI_PROVIDER=true LLM_PROVIDER=claude ANTHROPIC_API_KEY=...`
- `/model`에서 Claude 모델 선택 후 프롬프트 요청 성공 확인

3. OpenAI 경로

- `ENABLE_MULTI_PROVIDER=true LLM_PROVIDER=openai OPENAI_API_KEY=...`
- `/model`에서 OpenAI 모델 선택 후 프롬프트 요청 성공 확인

## 8. 리스크 및 대응

1. **리스크: Gemini UX 회귀**

- 대응: Gemini 전용 뷰 경로를 유지하고 기존 테스트 스냅샷 보강

2. **리스크: provider별 모델명 유효성 차이**

- 대응: 실패 시 에러 메시지에 provider/model 명시, 추후 동적 카탈로그 확장 지점
  확보

3. **리스크: 설정 우선순위 혼선**

- 대응: 문서에 `LLM_PROVIDER` 우선 정책 명시, `/model`에서 현재 provider 표시

## 9. 완료 기준 (Definition of Done)

1. `/model`이 Gemini/Claude/OpenAI 컨텍스트에서 각각 적절한 모델 목록을
   표시한다.
2. 선택된 모델이 실제 요청 경로에 반영된다.
3. 기존 Gemini 모델 변경 흐름(자동/수동/프리뷰)이 회귀 없이 동작한다.
4. 관련 테스트(단위+통합)가 통과한다.
5. 사용자 문서에 provider별 `/model` 사용법이 추가된다.

## 10. 산출물

- 신규 문서: `docs/change_model/model_command_multi_provider_plan.md`
- 예상 코드 변경 영역:
  - `packages/cli/src/ui/components/ModelDialog.tsx`
  - `packages/cli/src/ui/commands/modelCommand.ts`
  - `packages/cli/src/ui/...` (신규 ModelOptionService 및 테스트)
  - 필요 시 `packages/core/src/providers/providerSelector.ts` 연계 로직 참조
