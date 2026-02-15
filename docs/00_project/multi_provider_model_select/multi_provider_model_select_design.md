# Multi-Provider `/model` Command 메인 설계 문서

> 작성일: 2026-02-14  
> 최종수정: 2026-02-15  
> 범위: 멀티 프로바이더 환경에서 `/model` UX/동작/영속화 일관성 확보

## 1) 배경 요약 (왜 필요한가)

기존 구조에서는 `/model` 다이얼로그가 Gemini 중심으로 고정되어 있어 다음 문제가
있었다.

- Claude/OpenAI/sLM 사용자도 Gemini 모델 목록을 먼저 보게 됨
- 프로바이더 변경 후 이전 프로바이더 모델 ID가 그대로 전달될
  가능성(cross-provider passthrough)
- `LLM_MODEL` 우선순위와 settings 저장 경로가 달라 재시작 시 모델 불일치 가능
- env 자동감지 경로에서 `selectedProvider` 상태가 비어 있어 UI 분기 오류 가능
- 전역 `model.name` 단일 저장으로 프로바이더별 모델 기억 UX 부재

핵심 목표는 **“현재 활성 프로바이더 기준으로 올바른 모델 선택 UI를 제공하고,
선택 결과를 세션/재시작/전환 시점까지 일관되게 유지”** 하는 것이다.

## 2) 목표 상태 (한눈에)

- Gemini/Claude/OpenAI: 프리셋 + Manual 2단계 선택 UI
- sLM(openai-compatible): 텍스트 입력 기반 자유 모델명 선택
- Vertex AI: Gemini 모델 UX 재사용
- DidimAIStudio: 모델 선택 비활성 안내 화면
- 프로바이더 전환 시 잘못된 모델 소속은 자동 교정
- 재시작 후에도 마지막 선택 모델이 의도대로 복원

## 3) 핵심 설계 결정

1. **Provider Model Registry 도입**

- 프로바이더별 모델 목록/프리셋/기본값/정책을 SSOT로 관리

2. **기본 모델 일원화**

- `DEFAULT_PROVIDER_MODELS`를 레지스트리 기반 파생값으로 구성

3. **활성 프로바이더 감지 강화**

- `selectedProvider -> LLM_PROVIDER -> API KEY 감지 -> fallback` 순서
- `slm -> openai-compatible`, `didim-studio -> didim`, `vertex-ai -> gemini`
  정규화

4. **Cross-provider 모델 오염 차단**

- 다른 프로바이더 소속 prefix(`claude-*`, `gpt-*`, `gemini-*`)는 차단
- 커스텀 모델은 허용(allowCustomModels), 단 명확한 타 프로바이더 소속은 거부

5. **영속화 이중 동기화**

- `/model` 선택 시 런타임 모델(`config.setModel`) + env(`LLM_MODEL`) 동기화
- sLM은 `settings.security.auth.slmConfig.model`까지 같이 업데이트

6. **프로바이더별 모델 기억**

- `model.byProvider`를 도입해 provider 단위 최근 선택 모델 복원
- 기존 `model.name`은 하위 호환 유지

## 4) 변경 범위 요약

Core:

- `packages/core/src/config/providerModels.ts` (신규)
- `packages/core/src/providers/providerSelector.ts`
- `packages/core/src/index.ts`

CLI:

- `packages/cli/src/ui/utils/resolveActiveProvider.ts` (신규)
- `packages/cli/src/ui/components/ModelDialog.tsx`
- `packages/cli/src/ui/components/FreeformModelInput.tsx` (신규)
- `packages/cli/src/ui/components/DialogManager.tsx`
- `packages/cli/src/config/settingsSchema.ts`
- `packages/cli/src/config/settings.ts`
- `packages/cli/src/config/config.ts` (startup model resolution에 `byProvider`
  반영)

## 5) 구현/검증 핵심 포인트

구현 순서 요약:

1. Core 레지스트리 + provider selector 정합성
2. CLI provider 감지 유틸 도입
3. settings 스키마(`model.byProvider`) 및 저장 헬퍼 확장
4. ModelDialog 멀티 프로바이더 분기 + 영속화 동기화
5. Freeform 입력(sLM) + DialogManager 연결
6. 회귀 테스트 및 E2E 시나리오 검증

검증 우선 시나리오:

- env 자동감지(`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DIDIM_API_KEY`)에서
  `/model` 분기 정확성
- Claude -> OpenAI 전환 시 `claude-*` 모델 차단/교정
- sLM에서 `/model` 변경 후 재시작 복원
- provider 재전환 시 `model.byProvider` 하이라이트 복원

## 6) 리뷰 반영 상태 요약

v2/v3/v4 리뷰에서 제기된 이슈(#1~#14)는 설계에 반영되었고, 현재 문서는 다음을
명시한다.

- 커스텀 모델 허용 정책 + 타 프로바이더 소속 차단
- sLM 재시작 복원 누락 방지
- Gemini 기본값/preview 분기 분리
- Didim env-only 감지 경로 포함
- `model.byProvider` 도입과 startup 반영
- 설정 스코프 오염 방지 원칙(user scope 기준 병합)

## 7) 상세 문서 인덱스

- [`./detail_plan/01_context_as_is.md`](./detail_plan/01_context_as_is.md)
  - 현재 문제, 코드 경로, 원인 분석
- [`./detail_plan/02_target_ux_to_be.md`](./detail_plan/02_target_ux_to_be.md)
  - 프로바이더별 목표 UX
- [`./detail_plan/03_architecture_design.md`](./detail_plan/03_architecture_design.md)
  - 상세 설계(데이터 구조, 알고리즘, 샘플 코드)
- [`./detail_plan/04_change_scope_and_steps.md`](./detail_plan/04_change_scope_and_steps.md)
  - 수정 파일 범위, 단계별 구현 순서
- [`./detail_plan/05_validation_plan.md`](./detail_plan/05_validation_plan.md)
  - 자동/수동 테스트 계획
- [`./detail_plan/06_review_log.md`](./detail_plan/06_review_log.md)
  - 리뷰 이슈와 반영 이력(v2/v3/v4)
- [`./detail_plan/07_model_catalog_202602.md`](./detail_plan/07_model_catalog_202602.md)
  - 모델 목록 스냅샷(참고)
- [`./detail_plan/08_future_roadmap.md`](./detail_plan/08_future_roadmap.md)
  - 후속 확장 항목

## 8) 문서 운영 규칙

- 설계 변경: `03_architecture_design.md` 우선 갱신 후 본 문서의 섹션 3/4 동기화
- 구현 범위/순서 변경: `04_change_scope_and_steps.md` 반영 후 본 문서 섹션 5
  동기화
- 테스트 변경: `05_validation_plan.md` 반영 후 본 문서 섹션 5 갱신
- 리뷰 피드백: `06_review_log.md`에 이슈 번호 유지 기록
- 본 문서의 역할: **요약 + 의사결정 + 추적 인덱스**
