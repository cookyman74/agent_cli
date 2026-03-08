# Phase A: OpenAI 모델 레지스트리 갱신

- 작업일: 2026-03-08
- 상태: ✅ 완료

## 변경 요약

OpenAI 기본 추천 모델을 `gpt-5.3-codex`에서 `gpt-5.4`로 변경하고,
`gpt-5.4-pro`를 신규 추가.

## 변경 파일

### 소스 코드

| 파일                                         | 변경 내용                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/config/providerModels.ts` | OpenAI preset → `gpt-5.4`, models에 `gpt-5.4` (isDefault), `gpt-5.4-pro` 추가, `gpt-5.3-codex`의 isDefault 제거 (호환성용 유지) |

### 테스트

| 파일                                                   | 변경 내용                                                                                                             |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/config/providerModels.test.ts`      | default 기대값 `gpt-5.4`로 갱신, `gpt-5.4`/`gpt-5.4-pro` 등록 확인 테스트 추가, `isModelValidForProvider` 테스트 추가 |
| `packages/core/src/providers/providerSelector.test.ts` | openai default 기대값 `gpt-5.4`로 갱신, cross-provider fallback 기대값 3건 갱신                                       |

## 설계 결정

- `gpt-5.3-codex`는 호환성 보존을 위해 manual 목록에 잔류 (isDefault 제거)
- `gpt-5.4`가 범용 주력 모델로 기본값 적합 (도구 사용 시나리오 최적)
- `gpt-5.4-pro`는 고성능 추론 계열로 `category: 'reasoning'` 부여

## 검증 결과

- 단위 테스트: providerModels 36/36, providerSelector 71/71 passed
- typecheck: pass
- lint: pass

## 완료 조건 충족

- [x] `/model` OpenAI 화면에 `gpt-5.4` 계열이 표시
- [x] `getDefaultModelFromRegistry('openai')`가 `gpt-5.4` 반환
- [x] OpenAI 모델 배열 내 `isDefault: true`가 하나만 존재
