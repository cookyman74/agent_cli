# M3.1.4 작업 결과서 — Claude 에러 매핑

- **작업일**: 2026-02-09
- **브랜치**: `DID/v0.1`
- **상태**: ✅ 완료 (M3.1.3에서 선행 구현됨)

## 작업 목표

Anthropic SDK 에러를 `LlmError` 계층으로 분류/매핑하는 유틸리티 구현:

1. Anthropic SDK 에러 분석
2. HTTP status code 기반 에러 매핑 (429, 401/403, 529 등)
3. 에러 변환 유틸 함수

## 사전 분석

### todolist 대비 현황

| todolist ID | 항목                    | 구현 여부                                        |
| ----------- | ----------------------- | ------------------------------------------------ |
| 3.1.4.1     | Anthropic SDK 에러 분석 | ✅ M3.1.3 — classifyError duck typing            |
| 3.1.4.2     | Rate limit 에러 매핑    | ✅ M3.1.3 — 429→RateLimitError                   |
| 3.1.4.3     | Auth 에러 매핑          | ✅ M3.1.3 — 401/403→AuthenticationError          |
| 3.1.4.4     | Overloaded 에러 매핑    | ✅ M3.1.3 — 529→MODEL_OVERLOADED                 |
| 3.1.4.5     | 에러 변환 유틸 함수     | ✅ M3.1.3 — classifyError + LlmError passthrough |

**결론**: M3.1.3 (스트림 에러 처리 고도화)에서 에러 매핑 전체 범위가 구현
완료됨. M3.1.4는 별도 코드 변경 없이 todolist 상태 업데이트만 수행.

### 설계서 §3.3.6 대비 구현 범위

| 설계서 요구 사항         | 구현 상태                     | 비고                   |
| ------------------------ | ----------------------------- | ---------------------- |
| 429 → RATE_LIMIT         | ✅ RateLimitError             | retryable              |
| 401/403 → AUTHENTICATION | ✅ AuthenticationError        | non-retryable          |
| 400 → INVALID_REQUEST    | ✅ LlmError(INVALID_REQUEST)  | 리뷰 #1 반영으로 추가  |
| 529 → MODEL_OVERLOADED   | ✅ LlmError(MODEL_OVERLOADED) | retryable              |
| default → UNKNOWN        | ⬆️ NETWORK/TIMEOUT으로 개선   | 설계서보다 세밀한 분류 |

### 설계서 대비 추가 구현

| 추가 항목                     | 구현 위치          | 근거                           |
| ----------------------------- | ------------------ | ------------------------------ |
| 400/422 → INVALID_REQUEST     | adapter.ts:202-206 | Gemini 어댑터 패리티 (리뷰 #1) |
| 404 → ModelNotFoundError      | adapter.ts:211-212 | Gemini 어댑터 패리티 (리뷰 #1) |
| 500+ → SERVER_ERROR           | adapter.ts:223-227 | 범용 서버 에러 포착            |
| Timeout 휴리스틱              | adapter.ts:232-233 | status 없는 timeout 에러 분류  |
| Network 폴백                  | adapter.ts:236     | 최종 폴백 (UNKNOWN 대체)       |
| LlmError passthrough          | adapter.ts:186-188 | 재분류 방지 (리뷰 #5)          |
| Stream error yield            | adapter.ts:146-151 | throw 대신 LlmErrorEvent yield |
| generateContent classifyError | adapter.ts:112     | 스트림과 대칭 (리뷰 #2)        |

## 테스트 현황

adapter.test.ts 에러 관련 테스트: **12건** (전체 37건 중)

| 카테고리              | 테스트 수 | 검증 내용                                             |
| --------------------- | --------- | ----------------------------------------------------- |
| status code 분류      | 7         | 400, 401, 404, 429, 500+, 529 + INVALID_REQUEST       |
| message 휴리스틱      | 2         | timeout keyword, network fallback                     |
| subclass instanceof   | 5         | Auth, RateLimit, ModelNotFound, Network, Timeout      |
| LlmError passthrough  | 2         | stream (ValidationError), non-stream (RateLimitError) |
| stream error yield    | 2         | creation error, iteration error → LlmErrorEvent       |
| generateContent error | 1         | 429 → RateLimitError throw                            |

## 변경 파일

### 코드 변경: 없음

M3.1.4 범위는 M3.1.3에서 전수 구현됨. 별도 코드 수정 불필요.

### 문서 변경

- `phase3_provider_extension_todolist.md`: M3.1.0~M3.1.4 전체 ⬜→✅ 상태
  업데이트

## Quality Gate

기존 M3.1.3 Quality Gate 결과 유지:

| 항목          | 결과                     |
| ------------- | ------------------------ |
| TypeCheck     | ✅ PASS                  |
| ESLint        | ✅ PASS                  |
| Claude 테스트 | ✅ 4 files / 114 passed  |
| Provider 회귀 | ✅ 29 files / 557 passed |

## M3.1 마일스톤 완료 요약

| Sub-milestone | 작업                       | 상태 | 커밋                                  |
| ------------- | -------------------------- | ---- | ------------------------------------- |
| M3.1.0        | SDK 설치 + 부트스트랩 등록 | ✅   | M3.1.1 커밋에 포함                    |
| M3.1.1        | ClaudeAdapter 구현         | ✅   | 별도 작업 결과서 참조                 |
| M3.1.2        | Claude 메시지 변환기       | ✅   | 별도 작업 결과서 참조                 |
| M3.1.3        | Claude 스트림/에러 고도화  | ✅   | `5c5601c7d`, `f47d5dc03`, `7c371dd77` |
| M3.1.4        | Claude 에러 매핑           | ✅   | M3.1.3에서 선행 구현 — 코드 변경 없음 |

**M3.1 전체 완료**. 다음 마일스톤: M3.2 (OpenAI 어댑터/변환기 구현).
