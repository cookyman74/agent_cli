# Phase 1 작업 결과서: Core DidimConverter (순수 변환 함수)

> **작업일**: 2026-03-13 ~ 2026-03-14 **작업자**: Claude Opus 4.6 **브랜치**:
> DID/v0.3 **상태**: ✅ Complete (R2 리뷰 반영 완료)

---

## 작업 요약

DidimAIStudio API와의 요청/응답 변환을 위한 순수 함수 모듈을 TDD 방식으로
구현했다. SSE 두 모드(sse/improved) 파싱 및 LlmEvent 변환까지 포함하여 Phase 2
어댑터 구현의 기반을 마련했다.

## 변경 파일

| 파일                                                  | 변경 | 설명                            |
| ----------------------------------------------------- | ---- | ------------------------------- |
| `packages/core/src/providers/didim/converter.ts`      | 신규 | 순수 변환 함수 10개 + 타입 정의 |
| `packages/core/src/providers/didim/converter.test.ts` | 신규 | 76개 테스트 (12 describe 블록)  |

## 구현된 함수

| 함수                           | 역할                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `normalizeDidimDomain()`       | 프로토콜/경로/query string 제거, 도메인 정규화 (빈 문자열 방어, port 보존)               |
| `detectScheme()`               | 입력 URL에서 프로토콜 감지 (http:// → 'http', 그 외 → 'https' 기본값)                    |
| `getDidimEndpoint()`           | 엔드포인트 URL 생성 (invoke/sse/improved), http:// 프로토콜 보존, 빈 도메인 에러         |
| `buildDidimHeaders()`          | Authorization + x-thread-id 헤더 생성 (threadId trim 적용)                               |
| `buildDidimRequestBody()`      | `{ chat, thread_id? }` 바디 생성 (threadId trim 적용)                                    |
| `parseDidimResponse()`         | 일반 응답 파싱 (response → content, thread_id → threadId)                                |
| `parseDidimSseEvent()`         | SSE 이벤트 파싱 (sse/improved 두 모드, 8개 이벤트 타입, 공백 keep-alive, malformed 방어) |
| `extractTextField()`           | SSE 데이터 필드 추출 — chunk/content/message fallback 체인 (문서 간 불일치 대응)         |
| `generateDidimResponseId()`    | 고유 응답 ID 생성 (`didim-` + UUID)                                                      |
| `convertDidimResponseToLlm()`  | 파싱 결과 → `LlmGenerateResponse` 변환 (id, model, content, stopReason)                  |
| `convertDidimSseToLlmEvents()` | DidimSseEvent → LlmEvent[] 변환 (TextDelta, Finished+MessageEnd, Error, metadata)        |

## 테스트 결과

```
Test Files  1 passed (1)
     Tests  76 passed (76)
```

- 전체 Core 테스트: 295 files, 6049 passed, 0 failed
- typecheck: PASS
- lint: PASS

## 주요 설계 결정

1. **함수 기반 (클래스 아님)**: Phase 1은 순수 함수만 → 클래스 래핑은 Phase
   2에서 판단
2. **malformed 입력 처리**: invalid JSON → `type: 'error'` +
   `'Invalid JSON: {원본}'` 메시지, unknown event → null, empty/whitespace data
   → null (keep-alive)
3. **이벤트 순서 보장**: done → [Finished, MessageEnd] 순서로 배열 반환
4. **빈 에러 메시지 방어**: `event.message || 'Unknown DidimAIStudio error'`
   기본 문구
5. **LlmGenerateResponse 전체 계약 준수**: `id` (didim- prefix + UUID), `model`
   (파라미터 전달), `content`, `stopReason` 모두 포함
6. **경계값 방어**: 빈 문자열/공백 도메인 → 에러 throw, 공백 threadId → 무시,
   port 보존, query string 제거
7. **http:// 프로토콜 보존**: 로컬 개발 환경(http://localhost:8008) 지원.
   프로토콜 미지정 시 https:// 기본값
8. **improved 모드 8개 이벤트 타입 처리**: message_partial/message_complete →
   delta, message → final_message(중복 위험 분리), message_metadata/process →
   metadata(비콘텐츠), complete/done → done, error → error
9. **필드명 fallback 체인**: 문서 간 불일치 대응 — chunk(06-plan) →
   content(master plan) → message(OpenAPI) 순서로 시도
10. **threadId trim**: 헤더/바디에 공백 포함 식별자 전송 방지

## 알려진 리스크 및 Phase 2 인수 사항

### 문서 간 계약 불일치 (Phase 2 진입 전 실서버 확인 필요)

| 항목                 | 마스터 플랜                   | 06-plan          | OpenAPI          | 현재 구현                                                   |
| -------------------- | ----------------------------- | ---------------- | ---------------- | ----------------------------------------------------------- |
| message_partial 필드 | `content`                     | `chunk`          | `message`        | chunk→content→message fallback                              |
| 완료 이벤트명        | `complete`                    | `done`           | `complete`       | 양쪽 모두 처리                                              |
| 엔드포인트 경로      | `/scenario-gateway/v1/invoke` | `/api/v1/invoke` | `/api/v1/invoke` | master plan 기준 유지 (Phase 2에서 구성 가능하게 변경 가능) |

### improved `message` 이벤트 중복 위험

OpenAPI는 `message`를 "최종 완성된 응답"으로 기술. `message_partial`로 이미
스트리밍된 내용과 중복 가능성 있음.

- **현재 설계**: `final_message` 타입으로 분리하여 파서에서 식별 가능.
  converter는 TextDelta로 변환.
- **Phase 2 조치**: adapter에서 `message_partial` 수신 후 `final_message` 필터링
  여부 결정.

### 디버그 로깅

- Phase 1은 순수 함수 레이어 → side effect(로깅) 없음.
- unknown SSE 이벤트 무시 시 로깅은 Phase 2 adapter 책임.

### converter 모듈 사용법

- `converter.ts`의 모든 함수는 외부 의존 없는 순수 함수 → adapter에서 직접
  import
- `convertDidimResponseToLlm()`은 `LlmGenerateResponse` 반환 → adapter에서 추가
  변환 불필요
- `DidimSseEvent` 타입이 SSE 파서와 LlmEvent 변환의 계약 타입 (5개 variant:
  delta, final_message, done, error, metadata)
- `convertDidimSseToLlmEvents()`의 반환값은 `LlmEvent[]` → adapter의
  AsyncGenerator에서 spread하여 yield
- `generateDidimResponseId()`로 응답 ID 생성 (서버가 ID를 제공하지 않으므로)
- `detectScheme()`으로 원본 URL의 프로토콜 감지 가능

## R1 리뷰 반영 사항

| 이슈                                | 출처           | 조치                                                          |
| ----------------------------------- | -------------- | ------------------------------------------------------------- |
| 빈 문자열/공백 도메인 경계 조건     | 1팀 #1, 2팀 #5 | `normalizeDidimDomain` 빈/공백 방어, `getDidimEndpoint` throw |
| chunk/content 타입 오류             | 1팀 #2         | non-string 테스트 추가                                        |
| 대소문자 처리                       | 1팀 #3         | 기각 — SSE는 case-sensitive                                   |
| convertDidimResponseToLlm 전체 계약 | 2팀 #1 (High)  | `LlmGenerateResponse` 반환, id/model 필드 추가                |
| malformed 입력 테스트 느슨          | 2팀 #2         | `type: 'error'` + `'Invalid JSON'` 정확 검증                  |
| improved message 변환 누락          | 2팀 #3         | message→TextDelta 테스트 추가                                 |
| error fallback 기본 문구            | 2팀 #4         | `'Unknown DidimAIStudio error'` 정확 검증                     |
| 공백 threadId 경계값                | 2팀 #5         | headers/body 공백 threadId 무시                               |

## R2 리뷰 반영 사항

| 이슈                           | 출처            | 조치                                                                        |
| ------------------------------ | --------------- | --------------------------------------------------------------------------- |
| unknown SSE event 디버그 로그  | 1팀 #1          | 인지, Phase 2 adapter 책임 — 순수 함수에 side effect 불가                   |
| JSON 파싱 에러 메시지 컨텍스트 | 1팀 #2          | 이미 구현됨 (`Invalid JSON: {원본}`)                                        |
| 데이터 타입 검증               | 1팀 #3          | 이미 구현됨 (`typeof === 'string'` 체크)                                    |
| improved 모드 누락 이벤트 타입 | 2팀 #1 (High)   | message_complete/message_metadata/process 추가, 테스트 3개 추가             |
| improved message 중복 위험     | 2팀 #2 (High)   | `final_message` 타입 분리, Phase 2 필터링 위임, 리스크 문서화               |
| https:// 강제 → http:// 불가   | 2팀 #3 (Medium) | `detectScheme()` 추가, http:// 보존, 테스트 3개 추가                        |
| keep-alive 공백 처리           | 2팀 #4 (Medium) | `!data.trim()` 체크 추가, 테스트 2개 추가                                   |
| message_partial 필드명 불일치  | 2팀 #5 (Medium) | `extractTextField()` fallback 체인 (chunk→content→message), 테스트 4개 추가 |
| threadId 미트리밍              | 2팀 #6 (Low)    | trim 후 값 사용, 테스트 2개 추가                                            |
