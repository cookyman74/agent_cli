# Phase 5 작업 결과서: 통합 검증

**작업일**: 2026-02-19 **브랜치**: `hotfix/v0.2.5` **Phase**: Phase 5 — 통합
검증

---

## 1. 작업 요약

### 목적

Phase 1~4 전체 수정 후 회귀 테스트 및 품질 게이트 통과 확인.

### 검증 결과

- **전체 단위 테스트**: 284 files / 5520 passed / 24 skipped / 0 failures
- **빌드**: 성공
- **Typecheck**: 0 errors (4 packages)
- **Lint**: 0 warnings

---

## 2. Phase 1~4 작업 결과서 확인

| Phase | 결과서                                         | 완료 조건 | 리뷰 반영 | 커밋 |
| ----- | ---------------------------------------------- | --------- | --------- | ---- |
| 1     | subagent_phase1_subagent_streaming_20260218.md | ✅ 전체   | 5건 해소  | 4건  |
| 2     | subagent_phase2_basellmclient_20260219.md      | ✅ 전체   | 5건 해소  | 3건  |
| 3     | subagent_phase3_geminiclient_20260219.md       | ✅ 전체   | 3건 해소  | 4건  |
| 4     | subagent_phase4_token_calculation_20260219.md  | ✅ 전체   | 3건 해소  | 2건  |

**리뷰 총합**: 16건 발견 → 16건 해소 ✅

---

## 3. 커밋 히스토리 (hotfix/v0.2.5)

| Phase | 커밋 해시   | 메시지                                                       |
| ----- | ----------- | ------------------------------------------------------------ |
| 1     | `b634b846f` | feat(agents): LlmAgentChatSession 구현                       |
| 1     | `144f63ff3` | feat(agents): local-invocation에 non-Gemini chatFactory 주입 |
| 1     | `c63468808` | docs: 설계서 및 작업계획서                                   |
| 1-R   | `bc32531ab` | fix(agents): 리뷰 Finding #1~#5 반영                         |
| 1-R   | `b36a91c64` | docs(agents): Phase 1 리뷰 결과서                            |
| 2     | `13d808c71` | feat(core): BaseLlmClient llm\* 경로 추가                    |
| 2     | `0601d48c7` | docs(core): Phase 2 작업결과서                               |
| 2-R   | `08ff77788` | fix(core): 리뷰 반영 — 설정값/ID/세션요약                    |
| 2-R   | `2e160a1e4` | docs(core): Phase 2 리뷰 반영                                |
| 3     | `935afb8a6` | feat(core): non-Gemini generateContent() llm\* 경로          |
| 3     | `0d2fa840e` | docs(core): Phase 3 작업결과서                               |
| 3     | `80e9a3c5b` | docs(core): Phase 3 완료 상태 업데이트                       |
| 3-R   | `ee59e964a` | fix(core): 리뷰 반영 — signal/mismatch guard/도구 테스트     |
| 4     | `407985d56` | feat(utils): non-Gemini llmCountTokens 분기                  |
| 4-R   | `80cac7adf` | fix(utils): 리뷰 반영 — 조건 완화/로그 레벨/flatMap 문서화   |

---

## 4. 전체 변경 파일

### 신규 파일 (2)

| 파일                                 | Phase | 설명                                |
| ------------------------------------ | ----- | ----------------------------------- |
| `agents/llmAgentChatSession.ts`      | 1     | non-Gemini 서브에이전트 ChatSession |
| `agents/llmAgentChatSession.test.ts` | 1     | 단위 테스트 (39 tests)              |

### 수정 파일 (8)

| 파일                              | Phase | 변경 내용                          |
| --------------------------------- | ----- | ---------------------------------- |
| `agents/local-invocation.ts`      | 1     | chatFactory 주입 로직 (+25줄)      |
| `agents/local-invocation.test.ts` | 1     | 프로바이더 감지 테스트 (+50줄)     |
| `core/baseLlmClient.ts`           | 2     | llm\* 경로 분기 (+30줄)            |
| `core/baseLlmClient.test.ts`      | 2     | non-Gemini 테스트 (+100줄)         |
| `core/client.ts`                  | 3     | generateContent llm\* 분기 (+45줄) |
| `core/client.test.ts`             | 3     | C1~C10 테스트 (+180줄)             |
| `utils/tokenCalculation.ts`       | 4     | llmCountTokens 분기 (+20줄)        |
| `utils/tokenCalculation.test.ts`  | 4     | D1~D5b 테스트 (+95줄)              |

### 도구 테스트 추가 (2)

| 파일                       | Phase | 변경 내용                           |
| -------------------------- | ----- | ----------------------------------- |
| `tools/web-fetch.test.ts`  | 3-R   | non-Gemini urlContext 가드 테스트   |
| `tools/web-search.test.ts` | 3-R   | non-Gemini googleSearch 가드 테스트 |

---

## 5. 테스트 실행 결과

```
Core 전체: 284 files / 5520 passed / 24 skipped / 0 failures
빌드: 성공
Typecheck: 0 errors (4 packages)
Lint: 0 warnings
```

---

## 6. 수동 E2E 검증

비대화식 모드(`-p`) + `--yolo`로 검증. 2026-02-19 수행.

| 항목                                 | 상태 | 비고                                       |
| ------------------------------------ | ---- | ------------------------------------------ |
| E2E-1: Claude 서브에이전트           | ✅   | codebase_investigator 호출 → 정상 응답     |
| E2E-2: Claude 루프감지/히스토리 압축 | ⏳   | 긴 대화 필요 — 비대화식 모드로 테스트 불가 |
| E2E-3: Claude web-fetch fallback     | ✅   | urlContext 가드 → curl 폴백 → 정상 요약    |
| E2E-4: OpenAI 기본 스트리밍          | ✅   | 도구 미사용 쿼리 정상 응답                 |
| E2E-4: OpenAI 도구 호출              | ✅   | §6.1 버그 수정 후 정상 동작 확인           |
| E2E-5: Gemini 회귀                   | ⏳   | GEMINI_API_KEY 미제공                      |

### 6.1 OpenAI 도구 호출 role 매핑 — 수정 완료 ✅

**증상**: OpenAI 프로바이더에서 도구 호출 시
`400 An assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'`
에러 발생.

**근본 원인**: `buildLlmRequestFromGeminiState()`에서 currentRequest를 항상
`{ role: 'user' }`로 감쌈. functionResponse(도구 응답)도 동일하게 처리되어
OpenAI API의 `{ role: 'tool', tool_call_id }` 요구사항 미충족.

**수정**: `buildLlmRequestFromGeminiState()`에 `fixToolResultRoles()` 호출 추가.
이 유틸리티는 `{ role: 'user', content: [tool_result] }` →
`{ role: 'tool', content: [tool_result] }` 변환 수행. `llmMessageUtils.ts`에
이미 존재하던 함수로, `client.ts` routing context에서도 사용 중이었으나
`requestBuilder.ts`에서 누락되어 있었음.

**변경 파일**: `requestBuilder.ts` (+2줄), `requestBuilder.test.ts` (~60줄 추가)

**검증 결과**: OpenAI `echo hello` (shell tool) ✅, `list_directory` ✅, Claude
프로바이더 회귀 ✅

---

## 7. 잔여 이슈 및 향후 과제

1. ~~**[HIGH] OpenAI 도구 호출 role 매핑**~~: ✅ 수정 완료 (§6.1 참조)
2. **orphan tool message 구조적 해소**: non-Gemini 프로바이더에서 tool response
   매칭 시 id 기반 round-trip 의존 — 현재 typeConversion에서 id 보존으로
   해결하나 구조적 리팩터링 여지 있음
3. **OpenAI countTokens**: `supportsTokenCount: false` → 미디어 요청마다 warn
   로그 + heuristic fallback. 향후 tiktoken 로컬 카운팅 고려
4. **chatCompressionService flatMap**: Content[] → Part[] 평탄화 시 role 소실 —
   tokenCalculation과 Gemini 경로 모두 해당. 향후 Content[] 단위 전달로 개선
   가능

---

## 8. 완료 조건 달성 여부

| 검증 항목                                  | 상태 |
| ------------------------------------------ | ---- |
| Phase 1~4 작업 결과서 전체 확인            | ✅   |
| Core 전체 단위 테스트 PASS                 | ✅   |
| 빌드 성공                                  | ✅   |
| Lint + Typecheck 통과                      | ✅   |
| 수동 E2E (Claude 프로바이더)               | ✅   |
| 수동 E2E (OpenAI 프로바이더)               | ✅   |
| 수동 E2E (Gemini 프로바이더 회귀)          | ⏳   |
| 완료 조건 체크표시 + 최종 작업 결과서 작성 | ✅   |
