# Hotfix: non-Gemini 프로바이더 레거시 API 호출 전면 수정

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 테스트
> 먼저 작성 → 최소 코드 구현 → 리팩터링 **리팩터링 원칙**: "Make it work → Make
> it right → Make it fast" **참고 문서**:
>
> - [plan_20260218.md](./plan_20260218.md) — 설계 문서 (v4)
> - [상세 작업계획서 디렉토리](./phase_todolist/) — Phase별 상세 계획

---

## 작업 개요

| 항목        | 내용                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 프로젝트    | non-Gemini 프로바이더(Claude, OpenAI) 레거시 Gemini API 호출 전면 수정                                                                      |
| 영향 범위   | `llmMessageUtils.ts` (신규), `llmAgentChatSession.ts` (신규), `local-invocation.ts`, `baseLlmClient.ts`, `client.ts`, `tokenCalculation.ts` |
| 위험 수준   | 🟠 Medium — 내부 LLM 호출 경로 다수 변경, 기존 Gemini 경로 보존 필수                                                                        |
| 성능 민감도 | 🟢 Low — 분기 추가만, 기존 Gemini 경로 성능 영향 없음                                                                                       |
| 참고 설계   | [plan_20260218.md §5](./plan_20260218.md) (v4)                                                                                              |
| 작업 브랜치 | `v0.2.0/se_manager_agent`                                                                                                                   |

---

## 핵심 리스크 요약

| 리스크                                                                                                                                       | 영향      | 대응 방안                                                                                                                | 상태 |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------ | ---- |
| Category A: `GenerateContentResponse` 부분 구성 — local-executor 호환                                                                        | 🟡 Medium | local-executor가 접근하는 필드만 채움 + `as` 캐스팅 + 단위 테스트 검증                                                   | ⬜   |
| Category A: tool_result role 교정 누락 시 서브에이전트 다중 턴 tool 결과 유실                                                                | 🟡 Medium | `buildLlmRequestFromGeminiState()` 후 `fixToolResultRoles()` 적용 + 통합 테스트                                          | ⬜   |
| **[3차 #1]** multi-tool_result OpenAI 유실: `convertToolMessage()` `find()` → 첫 1개만 처리                                                  | 🔴 High   | `fixToolResultRoles()`에서 multi-tool_result 메시지를 개별 메시지로 **분할**                                             | ⬜   |
| **[3차 #2→4차 #1]** config alias 모델 해석: `'web-fetch'` 등이 `resolveProviderModel()` 통과 → API 에러                                      | 🔴 High   | `getResolvedConfig(modelConfigKey).model` → `resolveProviderModel()` (전 Phase 공통) [4차 #1]                            | ⬜   |
| **[4차 #2]** Category C: non-Gemini web-fetch/web-search 환각 위험 — Gemini 전용 `urlContext`/`googleSearch` 도구 없이 응답 생성 → 성공 판정 | 🔴 High   | web-fetch: non-Gemini → throw 에러 → `executeFallback()` 경로 유도 [5차 #3], web-search: 미지원 에러 반환                | ⬜   |
| **[5차 #2]** Category C: web-search 툴 무조건 등록 — non-Gemini에서도 model에 노출 → 에러 후 반복 호출 가능                                  | 🟡 Medium | web-search 에러 메시지를 명확히 하여 model 학습 유도 + 반복 호출 제한은 기존 대화 턴 제한에 의존                         | ⬜   |
| **[5차 #3]** Category C: web-fetch fallback 유도 — "빈 응답 반환" 방식은 계약적 불안정                                                       | 🟡 Medium | throw 에러 → catch → error result (fallback 미발동). 대안: web-fetch.ts 최소 수정 (2줄) 또는 error result 허용 [5차 #3]  | ⬜   |
| **[5차 #4]** alias 기반 인프라 호출 시 사용자 모델 우회 — `resolveProviderModel()`이 provider default 강제                                   | 🟢 Low    | **설계 의도**: 인프라 호출(loop-detection 등)은 provider default 사용이 올바름. `LLM_MODEL` env var로 전역 override 가능 | ⬜   |
| Category B: Content[] ↔ LlmMessage[] 왕복 변환 정합성                                                                                       | 🟡 Medium | 기존 검증된 `convertContentsToLlmMessages()` 사용 + 변환 결과 단위 테스트                                                | ⬜   |
| Category B: LlmResponse → GenerateContentResponse 변환 누락 필드                                                                             | 🟡 Medium | `getResponseText()` 호환성 테스트 필수, Gemini 전용 필드는 미지원 허용                                                   | ⬜   |
| Category B: fixToolResultRoles 빈 toolCallId                                                                                                 | 🟡 Medium | `functionResponse.id` 없는 레거시 케이스 → 빈 id면 role 변경 안 함                                                       | ⬜   |
| Category C: retry 누락 시 일시적 에러에 web-fetch/search 실패                                                                                | 🟡 Medium | non-Gemini도 `retryWithBackoff()` 적용 (Gemini 전용 콜백만 미설정)                                                       | ⬜   |
| Category C: systemInstruction 누락 시 web-fetch/search 결과 품질 저하                                                                        | 🟡 Medium | `getCoreSystemPrompt()` 명시적 호출 + 테스트 검증                                                                        | ⬜   |
| Category D: non-Gemini llmCountTokens 미지원 프로바이더                                                                                      | 🟢 Low    | 기존 catch 블록 → 로컬 추정치 폴백 유지                                                                                  | ⬜   |

---

## 작업 일관성 메커니즘

> **원칙**: 각 Phase 완료 시 작업 결과서를 작성하고, 다음 Phase 착수 시 이전
> 결과서를 확인하여 작업 일관성을 유지한다.

```
Phase 1 완료 → [DOC-A] 결과서 작성 → Phase 2 [PREV-REVIEW] 결과서 확인 → Phase 2 착수
Phase 2 완료 → [DOC-B] 결과서 작성 → Phase 3 [PREV-REVIEW] 결과서 확인 → Phase 3 착수
Phase 3 완료 → [DOC-C] 결과서 작성 → Phase 4 [PREV-REVIEW] 결과서 확인 → Phase 4 착수
Phase 4 완료 → [DOC-D] 결과서 작성 → Phase 5 [PREV-REVIEW-ALL] 전체 결과서 확인 → Phase 5 착수
Phase 5 완료 → [DOC-E] 최종 결과서 작성 → 전체 완료
```

| Phase | 작업 결과서 파일명                                                 |
| ----- | ------------------------------------------------------------------ |
| 1     | `working_history/subagent_phase1_subagent_streaming_{작업일자}.md` |
| 2     | `working_history/subagent_phase2_basellmclient_{작업일자}.md`      |
| 3     | `working_history/subagent_phase3_geminiclient_{작업일자}.md`       |
| 4     | `working_history/subagent_phase4_token_calculation_{작업일자}.md`  |
| 5     | `working_history/subagent_phase5_integration_{작업일자}.md`        |

**작업 결과서 공통 포함 항목**:

- Phase 작업 요약 (변경 파일, 핵심 구현 사항)
- 테스트/린트/타입체크 실행 결과
- 커밋 해시
- 완료 조건 달성 여부 (테이블 + 체크 상태)
- **다음 Phase 전달사항** (주의점, 미해결 이슈)

---

## Phase 요약 및 진행 상황

### Phase 1: Category A — 서브에이전트 스트리밍 경로

> **상세 계획**:
> [phase_todolist/phase1_subagent_streaming.md](./phase_todolist/phase1_subagent_streaming.md)

| 항목      | 내용                                                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 목적      | non-Gemini 서브에이전트(Codebase Investigator, CLI Help, Generalist) 실행 가능하도록 수정                                                             |
| 핵심 변경 | `fixToolResultRoles()` 선행 구현 (role 변환 + multi-tool_result 분할 [3차 #1]) → `LlmAgentChatSession` 신규 생성 → `local-invocation.ts` factory 주입 |
| 변경 파일 | 신규 4 + 수정 2 = **6 파일**, ~740줄                                                                                                                  |
| 커밋      | 3건 (llmMessageUtils → llmAgentChatSession → local-invocation)                                                                                        |
| 상태      | ⬜ 작업 대기                                                                                                                                          |

### Phase 2: Category B — BaseLlmClient 유틸리티 호출 경로

> **상세 계획**:
> [phase_todolist/phase2_basellmclient.md](./phase_todolist/phase2_basellmclient.md)

| 항목      | 내용                                                                                  |
| --------- | ------------------------------------------------------------------------------------- |
| 목적      | `BaseLlmClient._generateWithRetry()` 레거시 호출을 `llmGenerateContent()` 경로로 분기 |
| 파급력    | 이 수정 하나로 11개 호출자 자동 수정 (호출자 코드 변경 0건)                           |
| 변경 파일 | 수정 2 = **2 파일**, ~200줄                                                           |
| 커밋      | 1건                                                                                   |
| 상태      | ⬜ 작업 대기                                                                          |

### Phase 3: Category C — GeminiClient.generateContent() 도구 호출 경로

> **상세 계획**:
> [phase_todolist/phase3_geminiclient.md](./phase_todolist/phase3_geminiclient.md)

| 항목      | 내용                                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 목적      | `web-fetch.ts`, `web-search.ts`가 호출하는 `GeminiClient.generateContent()`를 non-Gemini에서도 동작하도록 수정                                                            |
| 전략      | `generateContent()` 메서드에 llm\* 분기 + `retryWithBackoff()` + `getResolvedConfig()` 적용 + web-fetch/web-search non-Gemini 가드 (throw 에러 방식) [4차 #2 + 5차 #2~#3] |
| 변경 파일 | 수정 2 = **2 파일**, ~100줄                                                                                                                                               |
| 커밋      | 1건                                                                                                                                                                       |
| 상태      | ⬜ 작업 대기                                                                                                                                                              |

### Phase 4: Category D — 토큰 계산 경로

> **상세 계획**:
> [phase_todolist/phase4_token_calculation.md](./phase_todolist/phase4_token_calculation.md)

| 항목      | 내용                                                                                      |
| --------- | ----------------------------------------------------------------------------------------- |
| 목적      | `tokenCalculation.ts`의 미디어 파일 토큰 계산에서 non-Gemini `llmCountTokens()` 경로 추가 |
| 영향      | 미디어(이미지) 포함 입력의 토큰 계산. 텍스트만인 경우 영향 없음                           |
| 변경 파일 | 수정 2 = **2 파일**, ~45줄                                                                |
| 커밋      | 1건                                                                                       |
| 상태      | ⬜ 작업 대기                                                                              |

### Phase 5: 통합 검증

> **상세 계획**:
> [phase_todolist/phase5_integration.md](./phase_todolist/phase5_integration.md)

| 항목 | 내용                                                            |
| ---- | --------------------------------------------------------------- |
| 목적 | 전체 카테고리(A~D) 수정 후 회귀 테스트 및 E2E 검증              |
| 검증 | 단위 테스트 → 빌드 → 린트 → E2E (Claude + OpenAI + Gemini 회귀) |
| 문서 | 작업 결과서 작성                                                |
| 상태 | ⬜ 작업 대기                                                    |

---

## 전체 완료 조건

| 검증 항목                                                                                                                                 | Phase | 상태 |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---- |
| fixToolResultRoles TDD (role 변환 + multi-tool_result 분할 + 빈 toolCallId 가드) [3차 #1]                                                 | 1     | ⬜   |
| LlmAgentChatSession TDD (변환 + 세션 관리 + Error throw + resolvedConfig.model 기반) [4차 #1]                                             | 1     | ⬜   |
| local-invocation factory 주입 + 테스트                                                                                                    | 1     | ⬜   |
| REFACTOR: Phase 1 구조 개선                                                                                                               | 1     | ⬜   |
| Phase 1 커밋 완료 (3건) + **작업 결과서 작성**                                                                                            | 1     | ⬜   |
| **Phase 1 결과서 확인** → Phase 2 착수                                                                                                    | 2     | ⬜   |
| BaseLlmClient llm\* 분기 TDD + responseFormat + fixToolResultRoles + resolvedConfig.model [4차 #1]                                        | 2     | ⬜   |
| REFACTOR: Phase 2 구조 개선                                                                                                               | 2     | ⬜   |
| Phase 2 커밋 완료 + **작업 결과서 작성**                                                                                                  | 2     | ⬜   |
| **Phase 2 결과서 확인** → Phase 3 착수                                                                                                    | 3     | ⬜   |
| GeminiClient.generateContent llm\* 분기 TDD + retry + config + resolvedConfig.model + web-fetch/search throw 가드 [4차 #1+#2 + 5차 #2~#3] | 3     | ⬜   |
| REFACTOR: Phase 3 구조 개선 (DRY 검토)                                                                                                    | 3     | ⬜   |
| Phase 3 커밋 완료 + **작업 결과서 작성**                                                                                                  | 3     | ⬜   |
| **Phase 3 결과서 확인** → Phase 4 착수                                                                                                    | 4     | ⬜   |
| tokenCalculation llmCountTokens 분기 TDD                                                                                                  | 4     | ⬜   |
| REFACTOR: Phase 4 구조 개선                                                                                                               | 4     | ⬜   |
| Phase 4 커밋 완료 + **작업 결과서 작성**                                                                                                  | 4     | ⬜   |
| **Phase 1~4 결과서 전체 확인** → Phase 5 착수                                                                                             | 5     | ⬜   |
| Core 전체 단위 테스트 PASS                                                                                                                | 5     | ⬜   |
| 빌드 성공                                                                                                                                 | 5     | ⬜   |
| Lint + Typecheck 통과                                                                                                                     | 5     | ⬜   |
| 수동 E2E (Claude 프로바이더)                                                                                                              | 5     | ⬜   |
| 수동 E2E (OpenAI 프로바이더)                                                                                                              | 5     | ⬜   |
| 수동 E2E (Gemini 프로바이더 회귀)                                                                                                         | 5     | ⬜   |
| **최종 작업 결과서 작성** + 메인 계획서 상태 업데이트                                                                                     | 5     | ⬜   |

---

## 변경 파일 요약

| 파일                                 | Phase | 액션            | 예상 규모 |
| ------------------------------------ | ----- | --------------- | --------- |
| `core/llmMessageUtils.ts`            | 1     | **신규**        | ~50줄     |
| `core/llmMessageUtils.test.ts`       | 1     | **신규**        | ~120줄    |
| `agents/llmAgentChatSession.ts`      | 1     | **신규**        | ~200줄    |
| `agents/llmAgentChatSession.test.ts` | 1     | **신규**        | ~300줄    |
| `agents/local-invocation.ts`         | 1     | **수정**        | +20줄     |
| `agents/local-invocation.test.ts`    | 1     | **수정**        | +50줄     |
| `core/baseLlmClient.ts`              | 2     | **수정**        | +80줄     |
| `core/baseLlmClient.test.ts`         | 2     | **수정**        | +120줄    |
| `core/client.ts`                     | 3     | **수정**        | +25줄     |
| `core/client.test.ts`                | 3     | **수정**        | +50줄     |
| `utils/tokenCalculation.ts`          | 4     | **수정**        | +15줄     |
| `utils/tokenCalculation.test.ts`     | 4     | **수정**        | +30줄     |
| **합계**                             |       | 신규 4 + 수정 8 | ~1060줄   |

---

## 3차 리뷰 반영 이력

| #   | 심각도     | 이슈                                                            | 판정           | 반영 내용                                                              |
| --- | ---------- | --------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------- |
| 1   | HIGH       | multi-tool_result OpenAI 유실 — `convertToolMessage()` `find()` | CONFIRMED      | Phase 1: `fixToolResultRoles()`에 분할 로직 추가, RED-B0-3 테스트 신규 |
| 2   | HIGH       | config alias 모델 해석 — `'web-fetch'`가 API로 전달             | CONFIRMED      | Phase 1~3: `this.config.getModel()` 사용으로 변경, RED 테스트 신규     |
| 3   | MEDIUM→LOW | orphan tool message (대응 assistant 없는 tool 메시지)           | LOW 재분류     | LlmResponseAccumulator 페어링으로 정상 플로우 보장, 경고 주석 추가     |
| 4   | MEDIUM     | 설계 문서 링크 경로 불일치                                      | CONFIRMED      | `../detail_plan/hotfix_...` → `./plan_20260218.md` 전체 수정           |
| 5   | LOW        | Phase 2 변경 파일 수 집계 불일치                                | FALSE POSITIVE | 요약(수정 2=2파일, ~200줄)과 하단 테이블(80+120=200줄) 정합 확인       |

## 4차 리뷰 반영 이력

| #   | 심각도 | 이슈                                                                                                                            | 판정      | 반영 내용                                                                                         |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| 1   | HIGH   | `config.getModel()` 전면 적용 → 모델 선택/오버라이드 회귀                                                                       | CONFIRMED | Phase 1~3: `getResolvedConfig(modelConfigKey).model` → `resolveProviderModel()` 패턴으로 변경     |
| 2   | HIGH   | Category C non-Gemini web-fetch/web-search 환각 위험 — Gemini 전용 도구(`urlContext`/`googleSearch`) 없이 응답 생성 → 성공 판정 | CONFIRMED | Phase 3: web-fetch → `executeFallback()` 경로, web-search → 미지원 에러. 가드 테스트(RED-C8) 신규 |
| 3   | MEDIUM | orphan tool message 구조적 미해소                                                                                               | LOW 유지  | 3차와 동일 — hotfix 범위 밖, 경고 주석 유지                                                       |
| 4   | MEDIUM | 메인 계획-상세 설계 불일치                                                                                                      | CONFIRMED | #1, #2 수정 시 자동 해소                                                                          |

## 5차 리뷰 반영 이력

| #   | 심각도     | 이슈                                                                                            | 판정          | 반영 내용                                                                                                                                        |
| --- | ---------- | ----------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | HIGH       | plan_20260218.md:610 구 패턴 불일치 — `modelConfigKey.model ?? this.config.getModel()`          | CONFIRMED     | plan_20260218.md 직접 수정: `desiredModelConfig.model` (line 606에서 이미 해석됨) 사용                                                           |
| 2   | MEDIUM     | web-search 툴 무조건 등록 (`registerCoreTool`) — non-Gemini에서도 model에 노출 → 반복 호출 가능 | CONFIRMED     | Phase 3: 에러 메시지 명확화로 model 학습 유도. 리스크 테이블 추가. 구조적 해소(tool 미등록)는 hotfix 범위 밖                                     |
| 3   | MEDIUM     | web-fetch fallback 유도 — "빈 응답 반환" 방식은 계약적 불안정 (line 311 의존)                   | CONFIRMED     | Phase 3: throw 에러 방식으로 변경. web-fetch.ts catch(382) → error result 반환. fallback 발동에는 web-fetch.ts 최소 수정(2줄) 필요 — 선택적 적용 |
| 4   | MEDIUM→LOW | alias 기반 인프라 호출 시 사용자 모델 우회 — `resolveProviderModel()`이 provider default 강제   | **설계 의도** | 인프라 호출(loop-detection 등)은 provider default 사용이 올바름. `LLM_MODEL` env var로 전역 override 가능. 리스크 LOW 재분류                     |
| 5   | LOW        | orphan tool message 구조적 미해결                                                               | LOW 유지      | 3차/4차와 동일 — hotfix 범위 밖                                                                                                                  |

---

**작성일**: 2026-02-18 **최종 수정**: 2026-02-18 (5차 리뷰 반영: plan SSOT 수정,
web-fetch/search throw 전략, tool 등록 리스크, alias 모델 우회 설계 의도 확인)
**상태**: ⬜ 작성 완료, 작업 대기
