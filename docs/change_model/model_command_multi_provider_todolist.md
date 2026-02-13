# /model 멀티 프로바이더 확장 단계별 작업계획서

- 작성일: 2026-02-09
- 기준 설계서: `docs/change_model/model_command_multi_provider_plan.md`
- 범위: `/model` 명령의 Gemini 전용 UX를 Claude/OpenAI 포함 멀티 프로바이더 UX로
  확장

## 0. 작업 원칙

1. 기존 Gemini UX(자동/수동/프리뷰) 회귀 금지
2. Provider 판별 로직은 Core 정책(`selectProvider`) 재사용
3. 단계별 TDD: 테스트 선작성(RED) -> 구현(GREEN) -> 리팩터(REFACTOR)
4. 플래그 오프(`ENABLE_MULTI_PROVIDER=false`) 경로는 완전 호환 유지

## 1. 사전작업 (분석/고정)

### 1.1 현행 흐름 고정

- [ ] `/model` 호출 체인 재확인
  - `packages/cli/src/ui/commands/modelCommand.ts`
  - `packages/cli/src/ui/components/ModelDialog.tsx`
  - `packages/core/src/config/config.ts` (`setModel`)
- [ ] 멀티 프로바이더 활성 조건 고정
  - `ENABLE_MULTI_PROVIDER=true`
  - `LLM_PROVIDER=<provider>`

완료 기준:

- [ ] 현재 동작/제약사항이 문장으로 정리되어 리뷰 가능

### 1.2 Provider/모델 후보 초안 확정

- [ ] provider별 1차 모델 목록(정적 상수) 확정
  - Gemini: 기존 상수 재사용
  - Claude: 기본 Sonnet/Haiku 후보
  - OpenAI: 기본 GPT 후보
  - didim/openai-compatible: fallback(사용자 지정/기본값)
- [ ] 모델명 실패 허용 정책 문구 확정(배포/권한 차이)

완료 기준:

- [ ] 코드 상수로 옮길 수 있는 목록이 확정됨

## 2. 본작업 A - 도메인 로직 분리

### 2.1 `ModelOptionService` 신규 추가

대상(신규 제안):

- `packages/cli/src/ui/services/modelOptionService.ts`
- `packages/cli/src/ui/services/modelOptionService.test.ts`

작업 항목:

- [ ] `ModelDialogViewModel` 타입 정의
  - `providerName`
  - `selectedModel`
  - `options[]`
  - `mode` (gemini-main/manual or generic)
- [ ] provider 판별 함수 구현
  - `isMultiProviderEnabled()` + `selectProvider()` 기반
- [ ] provider별 옵션 빌더 구현

테스트(RED -> GREEN):

- [ ] flag off -> Gemini 옵션
- [ ] flag on + `LLM_PROVIDER=claude` -> Claude 옵션
- [ ] flag on + `LLM_PROVIDER=openai` -> OpenAI 옵션
- [ ] 비정상 상태 fallback 동작

완료 기준:

- [ ] 서비스 단독 테스트 통과
- [ ] UI에서 재사용 가능한 순수 데이터 모델 반환

## 3. 본작업 B - UI 확장

### 3.1 `ModelDialog` 리팩터

대상:

- `packages/cli/src/ui/components/ModelDialog.tsx`
- `packages/cli/src/ui/components/ModelDialog.test.tsx`

작업 항목:

- [ ] Gemini 경로: 기존 main/manual 2단 구조 유지
- [ ] Non-Gemini 경로: provider 단일 목록 뷰 렌더링
- [ ] 상단 provider 라벨 추가 (`Provider: Claude` 등)
- [ ] 기존 `Remember model`/`Tab` 토글 동작 유지
- [ ] 선택 시 `config.setModel(model, isTemporary)` 호출 유지

테스트:

- [ ] Gemini 기존 스냅샷 유지
- [ ] Claude/OpenAI 렌더링 스냅샷 추가
- [ ] 선택 이벤트 시 `setModel` 호출 인자 검증
- [ ] persistMode true/false 분기 검증

완료 기준:

- [ ] UI 테스트 통과
- [ ] Gemini 회귀 없음

## 4. 본작업 C - 명령/문구/에러 처리 정리

### 4.1 `/model` 명령 및 도움말 정리

대상:

- `packages/cli/src/ui/commands/modelCommand.ts`
- `packages/cli/src/ui/constants/tips.ts`
- 필요 시 `packages/cli/src/config/config.ts`의 안내 문구

작업 항목:

- [ ] Gemini 전용 표현을 provider-agnostic 문구로 변경
- [ ] provider 미설정/키 누락 시 안내 메시지 개선

테스트:

- [ ] command 결과(`dialog: model`) 회귀 없음
- [ ] 문구 스냅샷 업데이트

완료 기준:

- [ ] `/model` 관련 안내가 멀티 프로바이더 문맥과 일치

## 5. 본작업 D - 통합 검증

### 5.1 런타임 경로 검증

통합 테스트/수동 스모크:

- [ ] Gemini
  - `ENABLE_MULTI_PROVIDER=false`
  - `/model` 기존 동작 확인
- [ ] Claude
  - `ENABLE_MULTI_PROVIDER=true LLM_PROVIDER=claude ANTHROPIC_API_KEY=...`
  - `/model`에서 Claude 모델 선택 후 요청 반영 확인
- [ ] OpenAI
  - `ENABLE_MULTI_PROVIDER=true LLM_PROVIDER=openai OPENAI_API_KEY=...`
  - `/model`에서 OpenAI 모델 선택 후 요청 반영 확인

권장 자동 검증 명령:

- [ ] `npm test --workspace @didim/agent-cli -- ModelDialog 관련 테스트`
- [ ] `npm test --workspace @didim/agent-cli-core -- providerSelector 관련 테스트`
- [ ] `npm run typecheck --workspace @didim/agent-cli`
- [ ] `npm run typecheck --workspace @didim/agent-cli-core`

완료 기준:

- [ ] 3개 provider 경로에서 `/model` 변경 반영 확인

## 6. 사후작업 (문서/릴리즈 준비)

### 6.1 문서 업데이트

- [ ] 사용자 가이드에 `/model` 멀티 프로바이더 사용법 추가
  - 실행 예시(Claude/OpenAI)
  - 제한사항(모델 접근 권한/계정별 차이)
- [ ] 본 작업결과서(working_history) 작성

### 6.2 변경 요약/릴리즈 노트

- [ ] 변경 파일 목록 정리
- [ ] 마이그레이션 포인트 정리(없으면 명시)

완료 기준:

- [ ] 문서만 보고도 사용자가 `/model`로 provider별 모델 전환 가능

## 7. 이슈 대응 체크리스트

- [ ] `LLM_PROVIDER` 미설정인데 non-Gemini 기대하는 사용자 혼선
- [ ] 모델 목록에 있으나 실제 호출 실패(권한/리전/계약)
- [ ] Gemini preview 접근권한 로직과 non-Gemini 로직 충돌
- [ ] 회귀: Footer/Tip 문구에서 "Gemini model" 고정 표현 누락 여부

## 8. 단계 완료 게이트

### Gate A (도메인 분리 완료)

- [ ] `ModelOptionService` 테스트 통과

### Gate B (UI 확장 완료)

- [ ] `ModelDialog` 테스트 통과
- [ ] Gemini 회귀 없음

### Gate C (통합 완료)

- [ ] Claude/OpenAI 스모크 통과
- [ ] 타입체크/주요 테스트 통과

### Gate D (문서 완료)

- [ ] 사용 가이드/작업결과서 반영 완료

## 9. 권장 커밋 단위

1. `feat(cli): add model option service for multi-provider`
2. `feat(cli): extend /model dialog for claude/openai`
3. `test(cli): add provider-specific model dialog coverage`
4. `docs: add /model multi-provider usage guide`
