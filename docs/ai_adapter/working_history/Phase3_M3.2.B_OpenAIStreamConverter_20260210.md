# M3.2.B 작업 결과서 — OpenAI 스트림 변환기 구현

- **작업일**: 2026-02-10
- **브랜치**: `DID/v0.1`
- **상태**: ✅ 완료

## 작업 목표

M3.2.A에서 스텁(`[]` 반환)으로 남겨둔 `convertStreamEvent()`를 TDD로 완전
구현하고, `supportsStreaming`을 `true`로 전환하여 OpenAI 스트리밍을 활성화한다.

1. `OpenAiStreamState` 확장 (`finishedEmitted` 플래그)
2. `convertStreamEvent()` 완전 구현 (text delta, tool call 축적/발행, finish
   reason, usage-only 청크)
3. `supportsStreaming: true` + capability 가드 제거
4. 테스트 25건 추가 + adapter 스트리밍 테스트 3건 추가

## 사전 분석

### OpenAI vs Claude 스트림 구조 차이

| 항목                | Claude                                                  | OpenAI                                                        |
| ------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| Tool call 시작/종료 | `content_block_start` / `content_block_stop`            | 없음 — `delta.tool_calls[].index`로 추적                      |
| Tool call 발행 시점 | `content_block_stop` 마다 개별 발행                     | `finish_reason='tool_calls'`에서 일괄 발행                    |
| Usage 위치          | `message_start` (input) + `message_delta` (output)      | 최종 청크의 `usage` 필드 (단일)                               |
| Finished/MessageEnd | `message_delta` → Finished, `message_stop` → MessageEnd | `finish_reason` 청크 → Finished, usage-only 청크 → MessageEnd |

### 핵심 설계 결정

1. **Tool call 발행**: `finish_reason='tool_calls'` 시 state에 축적된 모든 tool
   call 일괄 발행
2. **Finished 이벤트**: `finish_reason` 비null 시 즉시 발행 (usage 없이)
3. **MessageEnd 이벤트**: usage-only 최종 청크(빈 `choices[]` + `usage`)에서
   usage와 함께 발행
4. **`extractUsage` 재사용**: 기존 private 메서드가 `response['usage']` 드릴다운
   → 청크 전체를 `{ usage }` 형태로 전달하면 동일 동작
5. **`finishedEmitted` 플래그**: usage-only 청크에서 Finished 중복 발행 방지

## 작업 순서 및 결과

| 순서 | 작업                                        | 테스트 수        | 결과     |
| ---- | ------------------------------------------- | ---------------- | -------- |
| 1    | Tidy First: State 확장 (구조적 변경)        | 1 (기존 수정)    | 40 PASS  |
| 2    | RED: converter.test.ts 스트림 테스트 25건   | +25              | 19 FAIL  |
| 3    | GREEN: convertStreamEvent 구현              | 65               | 65 PASS  |
| 4    | Adapter: streaming 활성화 + 테스트 업데이트 | +3 (기존 2 삭제) | 30 PASS  |
| 5    | Quality Gate                                | 102 + 673        | ALL PASS |

## 변경 파일 상세

### 수정 파일

| 파일                                 | 변경 내용                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `providers/openai/converter.ts`      | `OpenAiStreamState.finishedEmitted` 추가, `convertStreamEvent()` 완전 구현, 3개 private helper 추가 |
| `providers/openai/converter.test.ts` | 스트림 변환 테스트 25건 추가, import 확장                                                           |
| `providers/openai/adapter.ts`        | `supportsStreaming: true`, capability 가드 제거, 미사용 import 정리                                 |
| `providers/openai/adapter.test.ts`   | capability 테스트 `true`로 변경, guard 테스트 → streaming 동작 테스트 3건 교체                      |

### 구현 상세 — converter.ts

**신규 필드**: `OpenAiStreamState.finishedEmitted: boolean`

**신규 메서드**:

- `convertStreamEvent()` — 메인 스트림 변환 로직
- `handleUsageOnlyChunk()` — 빈 choices + usage → Finished(조건부) + MessageEnd
- `accumulateToolCalls()` — index 기반 tool call delta 축적
- `emitToolCalls()` — state의 모든 tool call → ToolCallRequest 이벤트로 변환

**변환 로직 순서**:

1. `choices` 없음 → 빈 배열 (malformed 방어)
2. `choices[]` 비어있음 + `usage` 있음 → `handleUsageOnlyChunk`
3. `choices[]` 비어있음 + `usage` 없음 → 빈 배열
4. `delta.content` 비empty → TextDelta
5. `delta.tool_calls` 있음 → `accumulateToolCalls`
6. `finish_reason` 비null:
   - `'tool_calls'` / `'function_call'` → `emitToolCalls` + Finished
   - 기타 → Finished (기존 `mapFinishReason` 재사용)
7. `finishedEmitted = true` 설정

## 테스트 현황

### converter.test.ts — 65 tests (기존 40 + 신규 25)

| 카테고리                  | 테스트 수 | 검증 내용                                                         |
| ------------------------- | --------- | ----------------------------------------------------------------- |
| (기존) Request/Response   | 40        | M3.2.A에서 구현된 테스트 유지                                     |
| Text delta (T1-T5)        | 5         | non-null→TextDelta, null→빈, empty→빈, role-only→빈, content+role |
| Tool call 축적 (T6-T9)    | 4         | init state, arguments 축적, 연속 append, 병렬 index 추적          |
| Tool call 발행 (T10-T13)  | 4         | finish_reason=tool_calls, 병렬 일괄, invalid JSON→{}, empty→{}    |
| Finish reason (T14-T17)   | 4         | stop→end_turn, length→max_tokens, content_filter, flag 확인       |
| Usage-only 청크 (T18-T21) | 4         | MessageEnd+usage, Finished미발행→둘다, cached_tokens, usage없음   |
| 통합 시퀀스 (T22-T23)     | 2         | 텍스트 전체 스트림, tool call 전체 스트림                         |
| 엣지 케이스 (T24-T25)     | 2         | 빈 객체, choices undefined                                        |

### adapter.test.ts — 30 tests (기존 27 - 2 삭제 + 3 추가 + 2 수정)

| 변경 | 상세                                                                           |
| ---- | ------------------------------------------------------------------------------ |
| 수정 | capability `supportsStreaming` 기대값 `false` → `true`                         |
| 삭제 | UnsupportedFeatureError guard 테스트 2건 (더 이상 guard 없음)                  |
| 추가 | SDK stream 파라미터 검증 (stream=true, stream_options), 에러 yield, validation |

## Quality Gate

| 항목          | 결과                     |
| ------------- | ------------------------ |
| TypeCheck     | ✅ PASS                  |
| ESLint        | ✅ PASS                  |
| OpenAI 테스트 | ✅ 3 files / 102 passed  |
| Provider 회귀 | ✅ 33 files / 673 passed |

**변화**: 33 files / 647 → 33 files / 673 (+26 tests: 스트림 25 + adapter 1)

## 설계 결정

### Tool call 일괄 발행 (vs Claude 개별 발행)

- **결정**: `finish_reason='tool_calls'` 시점에 state 축적된 모든 tool call
  한번에 발행
- **근거**: OpenAI API는 Claude와 달리 `content_block_stop` 이벤트가 없음. Tool
  call 완성 시점을 알 수 있는 유일한 시그널이 `finish_reason`. index 정렬하여
  순서 보장.

### extractUsage 재사용

- **결정**: 비스트림 `fromOpenAiResponse`용으로 작성된 `extractUsage()`를
  스트림에서도 `{ usage }` 래핑하여 재사용
- **근거**: OpenAI usage 구조가 비스트림/스트림 동일 (`prompt_tokens`,
  `completion_tokens`, `prompt_tokens_details.cached_tokens`). DRY 원칙.

### finishedEmitted 플래그

- **결정**: state에 `finishedEmitted` 불린 추가
- **근거**: usage-only 최종 청크 도착 시 이미 `finish_reason` 청크에서
  Finished가 발행되었는지 확인 필요. 미발행 시 (비정상 스트림) Finished를 보충
  발행하여 이벤트 프로토콜 보장.

### capability 가드 제거

- **결정**: `supportsStreaming` 체크 가드를 `generateContentStream`에서 제거
- **근거**: M3.2.A에서 스텁 보호용으로 추가한 임시 가드. 이제
  `convertStreamEvent`가 완전 구현되었으므로 dead code.
  `supportsStreaming: true`이면 가드 절대 실행 안 됨.

## 커밋 이력

| 커밋        | 메시지                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------- |
| `1badf7030` | `refactor(providers): extend OpenAiStreamState for stream tracking`                       |
| `6dcd503a0` | `feat(providers): M3.2.B — OpenAI 스트림 변환기 구현 + streaming 활성화`                  |
| `b5d1246b2` | `fix(providers): M3.2.B 리뷰 반영 — accumulateToolCalls 방어 + choices 가드 + 테스트 3건` |
| `619d9df17` | `fix(providers): M3.2.B 2차 리뷰 반영 — choices[0] nullish 가드 + 테스트 R4`              |

## 리뷰 반영

### 제시된 이슈 및 검증 결과

| #   | 심각도 | 이슈                                                                                                                   | 검증 결과                                                                                 | 조치                                                      |
| --- | ------ | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | 중간   | `accumulateToolCalls`에서 동일 id 포함 delta가 다시 오면 `state.currentToolCalls[idx]`를 재초기화하여 기존 축적분 소실 | ✅ 확인 — 실제 API는 continuation에 id=null이므로 발생 가능성 매우 낮지만, 방어 코드 필요 | `if (tc['id'] && !existing)` 조건으로 기존 엔트리 보호    |
| 2   | 중간   | continuation chunk에 뒤늦게 name이 오는 경우 반영 안 됨                                                                | ✅ 확인 — 실제 API는 첫 chunk에만 name 전달하지만, 방어적으로 반영 필요                   | `else if (existing)` 분기에 `name` 업데이트 로직 추가     |
| 3   | 낮음   | `choices`가 배열이 아닌 객체일 경우 `choices.length` 접근 시 예외 발생 가능                                            | ✅ 확인 — `{ choices: { index: 0 } }` 같은 malformed chunk에서 예외 발생                  | `!Array.isArray(choices)` 가드 추가                       |
| 4   | 낮음   | `choices[0]`만 처리하여 multi-choice 무시                                                                              | ℹ️ 의도적 설계 — agent streaming은 n=1 전제                                               | 주석 명확화: "n=1 assumed for agent streaming"            |
| 5   | 참고   | CLI 런타임 경로가 Gemini 고정                                                                                          | ℹ️ 기 문서화 — M3.2.A 결과서에 이미 기록                                                  | 추가 조치 없음                                            |
| 6   | 낮음   | `choices: [undefined]` 형태의 malformed chunk에서 `choices[0]['delta']` 접근 시 예외 발생                              | ✅ 확인 — `choices[0]` 자체가 undefined일 때 crash                                        | `choices[0]` nullish 가드 추가 (`if (!choice) return []`) |

### 추가 테스트 (R1-R4)

| 테스트 | 검증 내용                                                                      |
| ------ | ------------------------------------------------------------------------------ |
| R1     | duplicate id가 있는 continuation delta가 기존 축적 arguments를 보존하는지 검증 |
| R2     | continuation chunk에 late name이 있을 때 state에 반영되는지 검증               |
| R3     | `choices`가 non-array 객체일 때 예외 없이 빈 배열 반환 검증                    |
| R4     | `choices: [undefined]`일 때 예외 없이 빈 배열 반환 검증                        |

### Quality Gate (리뷰 반영 후)

| 항목          | 결과                     |
| ------------- | ------------------------ |
| TypeCheck     | ✅ PASS                  |
| ESLint        | ✅ PASS                  |
| OpenAI 테스트 | ✅ 3 files / 106 passed  |
| Provider 회귀 | ✅ 33 files / 677 passed |

**변화**: 33 files / 673 → 33 files / 677 (+4 tests: R1, R2, R3, R4)

## 알려진 제한사항

### CLI 런타임 경로 Gemini 고정 (M3.2.A에서 이어짐)

M3.2.A 결과서에 기록된 제한사항 유지. CLI의 메인 채팅 루프가 legacy Gemini
메서드만 호출하므로, OpenAI 스트리밍이 adapter 레벨에서 완성되었더라도 CLI에서는
아직 사용 불가. M3.4+ CLI 통합 마일스톤에서 해결 예정.

## 향후 작업

- **M3.3**: OpenAI-Compatible(vLLM/sLM) 어댑터 템플릿 — OpenAI SDK 재사용,
  baseURL 동적 설정
- **M3.4+**: CLI 통합 — provider-independent ChatSession 인터페이스 + DI로
  non-Gemini 런타임 지원
