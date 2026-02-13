# Phase 3 핸드오프 문서

> 📅 **작성일**: 2026-02-08 📚 **작성 근거**: Phase 2 ETC 클로저 마일스톤 🔗
> **참조**:
> [phase2_core_refactoring_todolist.md](./phase2_core_refactoring_todolist.md)

---

## 1. Phase 2 완료 요약

Phase 2 (M2.0~M2.6)에서 달성한 핵심 성과:

- **M2.0**: 디렉토리 재구성 (Tidy First) — providers/gemini/ 구조 생성
- **M2.1**: ContentGenerator/StreamEvent/Retry/Hook 타입 전환
- **M2.2**: GeminiChat 스트리밍 분해 — 18개 이벤트 매핑, StreamAssembler
- **M2.3**: GeminiAdapter 구현 및 동등성 검증 — adapterBridge 패턴
- **M2.4**: ModelConfigService 호환 레이어
- **M2.5**: 유틸리티 레이어 리팩토링 — llmUtils, partUtils, tokenCalculation
- **M2.6**: 라우팅 레이어 타입 독립화 — RoutingContext LlmMessage 기반 전환

**Quality Gate 최종 결과**: Test 4829 passed | TypeCheck passed | Lint 0 errors

---

## 2. 연기 항목 카탈로그

### Priority: Critical

| #   | 항목                                        | 위치                               | 사유                                               | 의존성                         | 예상 규모 |
| --- | ------------------------------------------- | ---------------------------------- | -------------------------------------------------- | ------------------------------ | --------- |
| 1   | `client.ts` GeminiEventType 참조 정리       | `src/core/client.ts` (17곳)        | 대규모 동작 변경, UI 이벤트 흐름 전체 영향         | EventMapper 완료 (M2.2)        | 대        |
| 2   | `turn.ts` 이벤트 생성점 전환                | `src/core/turn.ts` (14곳)          | GeminiEventType → LlmStreamEventType 전환          | client.ts 전환과 병행          | 대        |
| 3   | `chat.ts` → `providers/gemini/chat.ts` 이동 | `src/core/geminiChat.ts` (999라인) | 병행 경로 전략, 물리적 이동은 스트리밍 리팩토링 후 | client.ts/turn.ts 전환 완료 후 | 대        |
| 4   | `turn.ts` → `providers/gemini/turn.ts` 이동 | `src/core/turn.ts`                 | 병행 경로 전략, 물리적 이동은 스트리밍 리팩토링 후 | chat.ts 이동과 병행            | 중        |

### Priority: High

| #   | 항목                                      | 위치                                  | 사유                                                                    | 의존성                                 | 예상 규모 |
| --- | ----------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------- | --------- |
| 5   | `messageInspectors` 마이그레이션 (4파일)  | 아래 상세 참조                        | 사용처가 `Content` 타입 기반, `LlmMessage` 전환 필요                    | 각 파일의 Content→LlmMessage 전환 선행 | 중        |
| 6   | `loggingContentGenerator` 텔레메트리 변환 | `src/core/loggingContentGenerator.ts` | 11개 @google/genai 타입 import (L7-18), 텔레메트리 파이프라인 전체 변경 | telemetry 타입 전환                    | 중        |
| 7   | `telemetry/semantic.ts` Gemini 결합 해소  | `src/telemetry/semantic.ts`           | Part/Content/Candidate 타입 직접 사용                                   | loggingContentGenerator 전환과 연계    | 중        |

### Priority: Medium

| #   | 항목                                  | 위치                                | 사유                                             | 의존성                         | 예상 규모 |
| --- | ------------------------------------- | ----------------------------------- | ------------------------------------------------ | ------------------------------ | --------- |
| 8   | AuthType 처리 통합 (2.3.1.8)          | `src/providers/gemini/adapter.ts`   | 비-Gemini 프로바이더 추가 시에만 필요            | 신규 프로바이더 구현 시점      | 소        |
| 9   | 성능 검증 (응답 지연/메모리/스트리밍) | 런타임 환경                         | 벤치마크 인프라 필요                             | E2E 테스트 환경                | 소        |
| 10  | E2E 테스트 통과 검증                  | 통합 테스트 환경                    | 번들 빌드 후 E2E 검증                            | 번들 빌드 환경                 | 소        |
| 11  | `geminiTypeConversion.ts` 브릿지 제거 | `src/utils/geminiTypeConversion.ts` | 호출 지점이 LlmMessage 기반으로 전환되면 불필요  | client.ts/turn.ts 전환 완료 후 | 소        |
| 12  | `telemetry/sdk.ts` 시그널 핸들러 누수 | `src/telemetry/sdk.ts` L317,321     | SIGTERM/SIGINT 핸들러 미제거, 장시간 세션 리스크 | 없음                           | 소        |

---

## 3. messageInspectors 마이그레이션 상세

`isFunctionCall`/`isFunctionResponse` →
`isToolCallMessage`/`isToolResultMessage` 전환 대상:

| 파일                                   | 사용 함수            | 사용 위치        | 마이그레이션 난이도                    |
| -------------------------------------- | -------------------- | ---------------- | -------------------------------------- |
| `src/services/loopDetectionService.ts` | 둘 다                | L408, L416, L437 | 중 — `Content[]` 기반 로직 전환 필요   |
| `src/core/geminiChat.ts`               | `isFunctionResponse` | L316             | 대 — 999라인 파일, chat.ts 이동과 연계 |
| `src/utils/editCorrector.ts`           | 둘 다                | L116, L125       | 소 — 독립적 유틸리티                   |
| `src/utils/nextSpeakerChecker.ts`      | `isFunctionResponse` | L74              | 소 — 독립적 유틸리티                   |

**대체 함수** (M2.6에서 구현 완료):

- `isToolCallMessage(message: LlmMessage)` — `src/utils/llmUtils.ts:80`
- `isToolResultMessage(message: LlmMessage)` — `src/utils/llmUtils.ts:92`

**주의**: 단순 함수 교체가 아님. 기존 함수는 `Content` 타입을 받고, 대체 함수는
`LlmMessage` 타입을 받음. 각 사용처에서 `Content` → `LlmMessage` 타입 전환이
선행되어야 함.

---

## 4. 잔여 @google/genai 의존성 현황

Phase 2 완료 후 `packages/core/src/`에서 `@google/genai`를 import하는 파일: **약
116개**

**분류**:

- **providers/gemini/** (12개): Gemini 프로바이더 전용 — 유지
  (provider-specific)
- **core/ 핵심 파일** (5개): client.ts, turn.ts 등 — Phase 3 Critical 항목
- **utils/services** (20+개): 유틸리티, 텔레메트리, 훅 등 — 점진적 마이그레이션
  대상
- **test 파일** (70+개): 구현 파일 전환 후 자동 정리

**Phase 3 목표**: core/ 핵심 파일의 @google/genai 의존성 제거. providers/gemini/
내부의 import는 의도된 것이므로 유지.

---

## 5. 미완 검증기준

| 출처 | 검증기준                             | 사유                          | Phase 3 대응                   |
| ---- | ------------------------------------ | ----------------------------- | ------------------------------ |
| M2.2 | GeminiChat이 신규 StreamEvent로 동작 | GeminiChat 내부 리팩토링 필요 | client.ts/turn.ts 전환 시 함께 |
| M2.2 | 기존 스트리밍 기능 100% 동작         | E2E 런타임 검증 필요          | E2E 테스트 환경에서            |
| M2.3 | 성능 저하 < 50ms                     | 런타임 벤치마크 필요          | 벤치마크 인프라 구축           |
| 전체 | E2E 테스트 통과                      | 번들 빌드 후 검증             | Phase 3 통합 단계              |
| 전체 | 성능 검증 3항목                      | 런타임 프로파일링             | Phase 3 통합 단계              |

---

## 6. Phase 2에서 축적된 레슨

### 패턴

| 패턴                        | 설명                                        | 적용 사례                                      |
| --------------------------- | ------------------------------------------- | ---------------------------------------------- |
| **re-export + @deprecated** | 기존 API 유지하면서 새 구현으로 전환        | partUtils, tokenCalculation, messageInspectors |
| **adapterBridge**           | ProviderFactory와 레거시 경로의 런타임 분기 | M2.3 GeminiAdapter 연결                        |
| **변환 브릿지**             | 호출 지점에서 SDK 타입 → 공통 타입 변환     | geminiTypeConversion.ts (M2.6)                 |
| **인라인 전환**             | 내부 인터페이스는 병행 추가 없이 직접 변경  | RoutingContext (M2.6)                          |

### 주의사항

1. **SDK 타입 불일치**: `@google/genai` d.ts 파일을 항상 직접 확인. 설계서와
   실제 SDK 구조가 다를 수 있음
2. **ContentListUnion**: SDK contents 필드는 union type — `[0]` 인덱스 접근
   불가, `Array<>` 캐스팅 필요
3. **ESLint no-this-alias**: `const self = this` 대신 `bind(this)` 패턴
4. **vacuous truth**: `[].every(fn)` = `true` — 빈 배열 가드 필수
5. **thought 필드**: `thought?: boolean` — truthiness 체크 사용
   (`thought: false`는 일반 텍스트)
6. **Type enum 문자열**: `@google/genai`의 `Type.OBJECT` = `'OBJECT'` 등 단순
   문자열 리터럴로 대체 가능

### 작업 효율 패턴

- **Tidy First**: 구조적 변경과 동작 변경은 반드시 별도 커밋
- **TDD Red→Green→Refactor**: 회귀 테스트를 먼저 작성하여 수정 범위 명확화
- **점진적 마이그레이션**: 한 번에 전체 전환하지 않고, 레이어별로 독립 전환

---

## 7. Phase 3 권장 작업 순서

> ⚠️ **주의**: 아래 번호는 핸드오프 작성 시점(Phase 2 완료 직후)의 권장
> 순서입니다. 최신
> 작업계획서(`phase3_provider_extension_todolist.md v0.5`)에서는 마일스톤 번호가
> 재배정되었으므로, **반드시 최신 계획서를 기준으로 참조**하시기 바랍니다.
>
> **매핑**: 아래 H-1~H-4 → 최신 M3.0 (3.0.1~3.0.5), H-5 → M3.1~M3.3

```
Phase 3 Suggested Order (핸드오프 시점 권장 — 최신 계획서와 번호 상이):
│
├─ [H-1] client.ts/turn.ts GeminiEventType → LlmStreamEventType 전환
│   ├─ client.ts 24개 참조 정리   → ✅ M2.연기에서 해소됨
│   └─ turn.ts 12개 이벤트 생성점 전환 → ✅ M2.연기에서 해소됨
│
├─ [H-2] geminiChat.ts → providers/gemini/chat.ts 이동
│   ├─ 988라인 파일 물리적 이동   → 최신 M3.0.1
│   └─ messageInspectors 마이그레이션 (4파일) → 최신 M3.0.2
│
├─ [H-3] 텔레메트리 레이어 독립화
│   ├─ telemetry/semantic.ts Gemini 결합 해소 → 최신 M3.0.3
│   └─ loggingContentGenerator 전환 → 최신 M3.0.3
│
├─ [H-4] 정리 및 통합 검증
│   ├─ geminiTypeConversion.ts 브릿지 제거 → 최신 M3.0.4
│   ├─ E2E 테스트 검증 → 최신 M3.4
│   └─ 성능 벤치마크 → 최신 M3.4
│
└─ [H-5] 신규 프로바이더 추가
    └─ AuthType 통합 (2.3.1.8) → 최신 M3.1+ (프로바이더 구현 시)
```

---

## 8. M3.0 알려진 제한사항

M3.0 (Gemini 내부 리팩토링) 완료 후 리뷰에서 확인된 의도된 제한사항입니다. M3.1+
진행 시 해소 계획이 수립되어 있습니다.

### 제한 1: 비-Gemini 프로바이더 런타임 미등록 (중간)

- **현상**: `createContentGenerator()` 내 `ProviderFactory.create()` 경로가
  코드에 연결되었으나, 실제 등록된 팩토리는 `bootstrapGeminiProvider()`
  하나뿐입니다.
- **영향**: `LLM_PROVIDER=claude/openai/didim` 설정 시 `Provider not registered`
  에러로 런타임 실패합니다.
- **근거**: 테스트에서는 수동 `registry.register()`로 검증하지만, 프로덕션
  코드에는 해당 등록이 없습니다.
- **해소 계획**: M3.1 (Claude), M3.2 (OpenAI), M3.3 (Didim) 마일스톤에서 각
  프로바이더의 어댑터 구현 + `bootstrapXxxProvider()` 함수를 추가하여
  해소합니다.

### 제한 2: Agent 실행 경로 Gemini 고정 (낮음)

- **현상**: `local-executor.ts`의 `defaultChatSessionFactory`가
  `new GeminiChat()` 을 직접 생성하며, 호출부(`local-invocation.ts`)에서 커스텀
  factory를 주입하지 않습니다.
- **영향**: 메인 생성기 경로(`createContentGenerator`)가 멀티 프로바이더를
  지원하더라도, subagent/agent 루프는 Gemini 고정입니다.
- **해소 계획**: Agent 경로의 provider 독립화는 M3.0 범위 외이며, CLI 계층의
  멀티 프로바이더 통합 단계에서 `ChatSessionFactory` DI를 통해 전환 예정입니다.
