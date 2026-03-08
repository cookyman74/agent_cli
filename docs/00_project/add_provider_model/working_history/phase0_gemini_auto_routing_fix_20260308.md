# Phase 0: Gemini Auto (Gemini 3) 라우팅 정합성 수정

- 작업일: 2026-03-08
- 상태: ✅ 완료

## 변경 요약

`auto-gemini-3` 라우팅이 구형 `gemini-3-pro-preview` 대신 최신
`gemini-3.1-pro-preview`를 1순위로 사용하도록 수정.

## 변경 파일

### 소스 코드

| 파일                                              | 변경 내용                                                                     |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/core/src/config/models.ts`              | `resolveModel(PREVIEW_GEMINI_MODEL_AUTO)` → `PREVIEW_GEMINI_31_MODEL` 반환    |
| `packages/core/src/config/models.ts`              | `resolveClassifierModel()` preview auto 분기에 `PREVIEW_GEMINI_31_MODEL` 추가 |
| `packages/core/src/config/models.ts`              | `getDisplayString()` preview pro alias → `PREVIEW_GEMINI_31_MODEL` 반환       |
| `packages/core/src/config/models.ts`              | `resolveModel()` alias auto/pro preview 분기 → `PREVIEW_GEMINI_31_MODEL`      |
| `packages/core/src/availability/policyCatalog.ts` | `PREVIEW_CHAIN` 1순위를 `PREVIEW_GEMINI_31_MODEL`로 변경                      |
| `packages/core/src/config/providerModels.ts`      | `auto-gemini-3` preset description 갱신                                       |

### 테스트

| 파일                                                           | 변경 내용                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| `packages/core/src/config/models.test.ts`                      | `PREVIEW_GEMINI_31_MODEL` import 추가, 기대값 갱신 (4건)     |
| `packages/core/src/availability/policyCatalog.test.ts`         | preview chain 기대값 `PREVIEW_GEMINI_31_MODEL`로 갱신        |
| `packages/core/src/availability/fallbackIntegration.test.ts`   | fallback 시나리오 기대 모델 `PREVIEW_GEMINI_31_MODEL`로 갱신 |
| `packages/core/src/routing/strategies/defaultStrategy.test.ts` | preview auto 라우팅 기대값 `PREVIEW_GEMINI_31_MODEL`로 갱신  |

## 검증 결과

- 단위 테스트: 82/82 passed
- typecheck: pass
- lint: pass

## 완료 조건 충족

- [x] `auto-gemini-3`가 더 이상 `gemini-3-pro-preview`를 기본 대상으로 사용하지
      않음
- [x] auto 경로와 availability fallback 경로가 동일한 1순위
      모델(`gemini-3.1-pro-preview`)을 가리킴
