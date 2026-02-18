# Phase 5: 통합 검증

> **목적**: 전체 카테고리(A~D) 수정 후 회귀 테스트 및 E2E 검증 **전제**: Phase
> 1~4 모두 완료 후 실행 **참고 설계**:
> [plan_20260218.md §12](../plan_20260218.md)

---

## 5.0 사전 작업 (Pre-Work)

- [ ] **[PREV-REVIEW-ALL]** Phase 1~4 작업 결과서 전체 확인
  - Phase 1: `working_history/subagent_phase1_subagent_streaming_{작업일자}.md`
  - Phase 2: `working_history/subagent_phase2_basellmclient_{작업일자}.md`
  - Phase 3: `working_history/subagent_phase3_geminiclient_{작업일자}.md`
  - Phase 4: `working_history/subagent_phase4_token_calculation_{작업일자}.md`
  - 확인: **모든 Phase 완료 조건이 ✅인지 검증**
  - 확인: 각 Phase 전달사항에 미해결 이슈가 없는지 확인
  - 확인: 커밋 해시가 모두 기록되어 있는지 확인
  - **미완료 항목 있으면 해당 Phase로 돌아가 해소 필요**

---

## 5.1 전체 테스트

- [ ] **[TEST-ALL]** Core 패키지 전체 단위 테스트

  ```bash
  npm test -w @didim365/agent-cli-core
  ```

- [ ] **[TEST-AGENTS]** 에이전트 전체 테스트 (Category A 회귀)

  ```bash
  npm test -w @didim365/agent-cli-core -- src/agents/
  ```

- [ ] **[TEST-TOOLS]** 도구 테스트 (Category C 회귀)
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/
  ```

---

## 5.2 빌드 + 린트

- [ ] **[BUILD]** Core 빌드

  ```bash
  npm run build -w @didim365/agent-cli-core
  ```

- [ ] **[LINT-ALL]** 린터 + 타입체크 전체
  ```bash
  npm run typecheck
  npm run lint
  ```

---

## 5.3 수동 E2E 검증

- [ ] **[E2E-1]** Claude 프로바이더 서브에이전트 동작 검증

  ```bash
  LLM_PROVIDER=claude ANTHROPIC_API_KEY=xxx npm run start
  # → Codebase Investigator 호출하는 쿼리 실행 → 정상 동작 확인
  ```

- [ ] **[E2E-2]** Claude 프로바이더 루프 감지/히스토리 압축 동작 검증

  ```bash
  # → 긴 대화로 루프 감지/히스토리 압축 유발 → 정상 동작 확인
  ```

- [ ] **[E2E-3]** Claude 프로바이더 web-fetch 동작 검증

  ```bash
  # → @url 참조로 web-fetch 호출 → fallback 경로 (HTTP fetch + LLM 요약) 정상 동작 확인 [4차 #2]
  ```

- [ ] **[E2E-4]** OpenAI 프로바이더 서브에이전트 + web-fetch 동작 검증

  ```bash
  LLM_PROVIDER=openai OPENAI_API_KEY=xxx npm run start
  # → 서브에이전트(Codebase Investigator) 호출 → 정상 동작 확인
  # → @url 참조로 web-fetch 호출 → fallback 경로 정상 동작 확인
  ```

- [ ] **[E2E-5]** Gemini 프로바이더 기존 기능 회귀 검증
  ```bash
  GEMINI_API_KEY=xxx npm run start
  # → 서브에이전트 + web-fetch + web-search + 일반 대화 → 기존과 동일 동작 확인
  ```

---

## 5.4 사후 작업 (Post-Work)

- [ ] **[CHECKLIST-E]** 완료 조건 체크표시
  - 위 "Phase 5 완료 조건" 테이블의 모든 항목을 `⬜` → `✅`로 변경

- [ ] **[DOC-E]** 최종 작업 결과서 작성
  - 파일:
    `docs/00_project/subagent_multi_provider/working_history/subagent_phase5_integration_{작업일자}.md`
  - 내용:
    - **전체 작업 최종 요약** (Phase 1~5 일괄)
    - 전체 변경 파일 목록 (신규 4 + 수정 8 = 12 파일)
    - Phase별 커밋 해시 통합 목록
    - 전체 테스트 실행 결과 (단위 테스트 + 린트 + 타입체크)
    - E2E 검증 결과 (Claude / OpenAI / Gemini 회귀)
    - Phase 1~4 작업 결과서 참조 링크
    - 잔여 이슈 및 향후 과제 (orphan tool message 구조적 해소 등)

- [ ] **[MAIN-UPDATE]** 메인 작업계획서 상태 업데이트
  - `main_todolist_20260218.md`의 전체 완료 조건 테이블 `⬜` → `✅` 변경
  - 상태: `⬜ 작성 완료, 작업 대기` → `✅ 전체 완료`

---

## Phase 5 완료 조건

| 검증 항목                                  | 상태 |
| ------------------------------------------ | ---- |
| Phase 1~4 작업 결과서 전체 확인            | ✅   |
| Core 전체 단위 테스트 PASS                 | ✅   |
| 빌드 성공                                  | ✅   |
| Lint + Typecheck 통과                      | ✅   |
| 수동 E2E (Claude 프로바이더)               | ✅   |
| 수동 E2E (OpenAI 프로바이더)               | ⚠️   |
| 수동 E2E (Gemini 프로바이더 회귀)          | ⏳   |
| 완료 조건 체크표시 + 최종 작업 결과서 작성 | ✅   |
