# Phase B: OpenAI 가격/통계 보정

- 작업일: 2026-03-08
- 상태: ✅ 완료

## 변경 요약

OpenAI 공식 가격 페이지(2026-03-08) 기준으로 `gpt-5.4`, `gpt-5.4-pro` 가격 추가
및 `gpt-5-mini` 단가 보정.

## 변경 파일

### 소스 코드

| 파일                                         | 변경 내용                                                             |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `packages/core/src/config/costEstimation.ts` | `gpt-5.4` 추가 (input $2.50, cached $0.625, output $20.00)            |
| `packages/core/src/config/costEstimation.ts` | `gpt-5.4-pro` 추가 (input $30.00, output $180.00, cached 미공개→생략) |
| `packages/core/src/config/costEstimation.ts` | `gpt-5-mini` 보정 (input 0.4→0.25, cached 0.1→0.025, output 1.6→2.00) |

### 테스트

| 파일                                              | 변경 내용                                             |
| ------------------------------------------------- | ----------------------------------------------------- |
| `packages/core/src/config/costEstimation.test.ts` | `gpt-5.4`, `gpt-5.4-pro` 존재 확인 테스트 추가        |
| `packages/core/src/config/costEstimation.test.ts` | 3개 모델 단가 정확도 검증 테스트 추가                 |
| `packages/core/src/config/costEstimation.test.ts` | `gpt-5.4` 비용 계산 통합 테스트 추가 (4.125 USD 검증) |

## 공식 가격 기준 (2026-03-08)

| 모델        | Input/MTok | Cached/MTok | Output/MTok |
| ----------- | ---------- | ----------- | ----------- |
| gpt-5.4     | $2.50      | $0.625      | $20.00      |
| gpt-5.4-pro | $30.00     | (미공개)    | $180.00     |
| gpt-5-mini  | $0.25      | $0.025      | $2.00       |

## 검증 결과

- 단위 테스트: 16/16 passed
- typecheck: pass
- lint: pass

## 완료 조건 충족

- [x] 새 OpenAI 모델 사용량이 비용 계산에서 누락되지 않음
- [x] `/stats` 비용 추정이 새 모델 ID를 인식
