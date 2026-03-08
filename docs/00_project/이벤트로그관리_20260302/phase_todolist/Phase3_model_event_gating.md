# Phase 3: Provider Model Event Gating

> TDD 기반: Red -> Green -> Refactor  
> 우선순위: Critical(C-1, C-2) 선해결

---

## 작업 개요

| 항목        | 내용                                                                 |
| ----------- | -------------------------------------------------------------------- |
| 목표        | Gemini 스트리밍의 final-chunk 게이트 + provider 매트릭스 반영        |
| 영향 범위   | `providers/gemini/chat.ts`, audit mapper, model 이벤트 생성기        |
| 위험 수준   | 🔴 Critical                                                          |
| 성능 민감도 | 🟠 Medium (이벤트 수 폭증 방지)                                      |
| 완료 조건   | model.responded 요청당 최대 1건 보장, OpenAI/Claude 미지원 명시 동작 |

---

## 핵심 리스크

| 리스크                                   | 영향 | 대응                                      | 상태 |
| ---------------------------------------- | ---- | ----------------------------------------- | ---- |
| Gemini 스트리밍 청크당 이벤트 생성       | 🔴   | finishReason 최종 청크에서만 생성         | ⬜   |
| OpenAI/Claude에서 model 이벤트 누락 오해 | 🔴   | provider matrix 기반 `not_available` 기록 | ⬜   |
| duration_ms 계산 불능                    | 🟠   | request-response 짝 매칭 키 정규화        | ⬜   |

---

## 3.1 사전 작업 (Pre-Work)

- [ ] **[REVIEW]** Phase2 결과서 검토
- [ ] **[ANALYSIS]** Gemini streaming loop 및 AfterModel fire 위치 확인
  - `packages/core/src/providers/gemini/chat.ts`
- [ ] **[ANALYSIS]** OpenAI/Claude adapter hook 미연동 확인
  - `packages/core/src/providers/openai/adapter.ts`
  - `packages/core/src/providers/claude/adapter.ts`
- [ ] **[SCOPE-CHECK]** v1 범위 확정
  - v1은 Gemini-only 보장, 공통 adapter fire는 v1.5 backlog

---

## 3.2 RED Phase

- [ ] **[RED-001]** Gemini 청크 스트림 테스트
  - N개 chunk 입력 시 `model.responded`는 1건만 생성되어야 함
- [ ] **[RED-002]** finishReason 누락 시 경고 이벤트 테스트
  - `model.response.missing_finish_reason` 생성
- [ ] **[RED-003]** provider matrix 테스트
  - OpenAI/Claude에서 `model.*` 저장 시도 없음
- [ ] **[RED-004]** duration 계산 테스트
  - 동일 요청 단위에서 only-final 응답 시간 계산 가능성 확인

실패 확인:

```bash
npm test -w @didim365/agent-cli-core -- providers/gemini audit/model-events --runInBand
```

---

## 3.3 GREEN Phase

- [ ] **[TASK-001]** Gemini final-chunk 판별 구현
  - 파일: `packages/core/src/providers/gemini/chat.ts`
- [ ] **[TASK-002]** audit model event mapper 구현/수정
  - 파일: `packages/core/src/audit/model-event-mapper.ts` (신규 또는 수정)
- [ ] **[TASK-003]** provider capability 체크 반영
  - non-gemini provider는 `model.*` 미생성 또는 `model.not_available` 정책 적용
- [ ] **[TASK-004]** 요청-응답 짝 키로 `duration_ms` 계산 보정

통과 확인:

```bash
npm test -w @didim365/agent-cli-core -- providers/gemini audit/model-events
```

---

## 3.4 REFACTOR Phase

### 3.4.1 구조 개선

- [ ] final-chunk 판별 함수 분리(`isFinalModelChunk`)
- [ ] provider matrix 상수화
- [ ] 이벤트 생성기와 provider 코드 결합도 축소

### 3.4.2 성능 개선

- [ ] 이벤트 생성 횟수 비교 벤치(변경 전/후)
- [ ] 큰 스트림(50~100 chunk)에서 이벤트 삽입량 감소 확인

검증:

```bash
npm test -w @didim365/agent-cli-core -- providers/gemini audit --runInBand
```

---

## 3.5 사후 작업 (Post-Work)

- [ ] **[TEST]** core 전체 회귀
- [ ] **[LINT/TYPE]** lint + typecheck
- [ ] **[DOC]** 결과서 작성
  - `docs/00_project/이벤트로그관리_20260302/working_history/Phase3_model_event_gating_YYYYMMDD.md`
- [ ] **[COMMIT]** 커밋

```bash
git add .
git commit -m "[Phase3] provider-aware model event gating"
```
