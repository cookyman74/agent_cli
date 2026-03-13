# Phase 4: Quality Gates + 문서 + E2E 검증

> **작업 원칙**: Phase 1~3 전체 변경 사항의 품질 검증 + 문서 업데이트 **참고
> 문서**:
>
> - [00_master_plan.md](./00_master_plan.md) — E2E 시나리오 12개
> - Phase 1~3 작업 결과서

---

## 작업 개요

| 항목        | 내용                                            |
| ----------- | ----------------------------------------------- |
| 프로젝트    | DidimAIStudio 연동 — Quality Gates + 문서 + E2E |
| 영향 범위   | Phase 1~3 전체 변경 사항 + 문서                 |
| 위험 수준   | 🟡 Medium                                       |
| 작업 브랜치 | `DID/v0.3`                                      |

---

## 4.1 사전 작업 (Pre-Work)

- [ ] **[REVIEW]** Phase 1~3 작업 결과서 전수 검토
  - Phase 1: `../working_history/Phase1_core_didim_converter_{날짜}.md`
  - Phase 2: `../working_history/Phase2_core_didim_adapter_{날짜}.md`
  - Phase 3: `../working_history/Phase3_cli_auth_and_settings_{날짜}.md`
  - 확인: 미해결 이슈, 알려진 제한사항 정리

- [ ] **[CONTEXT]** Phase 4 목적 확인
  - Quality Gate 4단계 통과
  - E2E 시나리오 12개 수동 검증
  - 문서 업데이트 (providers.md, authentication.md, index.md)

---

## 4.2 Quality Gate 1: Typecheck + Lint

- [ ] **[QG1-CORE]** Core 타입 검사

  ```bash
  npm run typecheck -w @didim365/agent-cli-core
  ```

- [ ] **[QG1-CLI]** CLI 타입 검사

  ```bash
  npm run typecheck -w @didim365/agent-cli
  ```

- [ ] **[QG1-LINT-CORE]** Core 린터

  ```bash
  npm run lint -w @didim365/agent-cli-core
  ```

- [ ] **[QG1-LINT-CLI]** CLI 린터
  ```bash
  npm run lint -w @didim365/agent-cli
  ```

---

## 4.3 Quality Gate 2: 단위 테스트 전수

- [ ] **[QG2-CORE]** Core 전체 테스트

  ```bash
  npm test -w @didim365/agent-cli-core -- --run
  ```
  - 기대: 294+ files, 5973+ tests passed

- [ ] **[QG2-CLI]** CLI 전체 테스트

  ```bash
  npm test -w @didim365/agent-cli -- --run
  ```

- [ ] **[QG2-DIDIM]** Didim 전용 테스트 상세 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- --run src/providers/didim/
  ```
  - converter.test.ts: URL/헤더/바디/SSE 파싱
  - adapter.test.ts: generateContent/generateContentStream/에러
  - bootstrap.test.ts: 등록/factory

---

## 4.4 Quality Gate 3: Cross-Module 빌드 검증

- [ ] **[QG3-BUILD]** 전체 빌드

  ```bash
  npm run build
  ```

- [ ] **[QG3-BUNDLE]** 번들 생성

  ```bash
  npm run bundle
  ```

- [ ] **[QG3-STALE]** stale node_modules 확인
  ```bash
  ls packages/cli/node_modules/@didim365/ 2>/dev/null && echo "STALE" || echo "OK"
  ```

---

## 4.5 Quality Gate 4: 수동 E2E 시나리오 검증

> **전제 조건**: DidimAIStudio 테스트 환경 접근 가능 (도메인 + JWT 토큰)
> **주의**: JWT 토큰이 없는 경우 시나리오 6~9는 mock/stub으로 대체

### 프로바이더 감지 시나리오

- [ ] **[E2E-01]** `DIDIM_API_KEY` 설정 → 프로바이더 자동 감지

  ```bash
  DIDIM_API_KEY=test_jwt didim
  # 기대: didim 프로바이더 활성화
  ```
  - 결과: ⬜ Pass / ⬜ Fail
  - 비고:

- [ ] **[E2E-02]** `LLM_PROVIDER=didim` 명시 설정
  ```bash
  LLM_PROVIDER=didim DIDIM_API_KEY=test_jwt didim
  # 기대: didim 프로바이더 선택
  ```
  - 결과: ⬜ Pass / ⬜ Fail

### Auth 시나리오

- [ ] **[E2E-03]** `/auth login` → DidimAIStudio 선택
  - 기대: Auth 다이얼로그 표시 (Coming Soon 아님)
  - 입력: 도메인 + JWT 토큰 + 스트림 모드
  - 결과: ⬜ Pass / ⬜ Fail

- [ ] **[E2E-04]** JWT 토큰 + 도메인 저장 후 재시작
  - 기대: 설정이 영속화되어 재시작 후에도 유지
  - 결과: ⬜ Pass / ⬜ Fail

### 모델 선택 시나리오

- [ ] **[E2E-05]** `/model` → Didim 비활성 안내 표시
  - 기대: "시나리오 기반으로 동작하므로 개별 모델 선택을 지원하지 않습니다"
    메시지
  - 결과: ⬜ Pass / ⬜ Fail

### 채팅 시나리오

- [ ] **[E2E-06]** 일반 채팅 요청 → 응답 수신
  - 기대: `POST /invoke` → 응답 텍스트 표시
  - 결과: ⬜ Pass / ⬜ Fail / ⬜ Skip (JWT 없음)

- [ ] **[E2E-07]** SSE 스트리밍 채팅 (sse 모드)
  - 기대: 실시간 텍스트 스트리밍 표시
  - 결과: ⬜ Pass / ⬜ Fail / ⬜ Skip

- [ ] **[E2E-08]** SSE 스트리밍 채팅 (improved 모드)
  - 기대: improved 이벤트 처리, 실시간 표시
  - 결과: ⬜ Pass / ⬜ Fail / ⬜ Skip

- [ ] **[E2E-09]** 대화 연속성 (thread_id 유지)
  - 기대: 두 번째 메시지에 x-thread-id 헤더 포함
  - 결과: ⬜ Pass / ⬜ Fail / ⬜ Skip

### 에러 시나리오

- [ ] **[E2E-10]** 401 에러 → 인증 오류 메시지
  - 기대: "JWT token has expired or is invalid" 등 안내
  - 결과: ⬜ Pass / ⬜ Fail / ⬜ Skip

### 프로바이더 전환 시나리오

- [ ] **[E2E-11]** 프로바이더 전환 (Didim → Gemini)
  - 기대: thread_id 초기화, DIDIM_API_KEY env 정리
  - 결과: ⬜ Pass / ⬜ Fail

- [ ] **[E2E-12]** 프로바이더 전환 (Gemini → Didim)
  - 기대: Didim 설정 복원 (도메인, 스트림 모드)
  - 결과: ⬜ Pass / ⬜ Fail

---

## 4.6 문서 업데이트

- [ ] **[DOC-1]** `docs/providers.md` 업데이트
  - Didim 프로바이더 설명 추가
  - 지원 기능 매트릭스: 채팅 ✅, 스트리밍 ✅, 도구 ❌, 비전 ❌
  - 인증 방식: JWT Token
  - 제한사항: 모델 선택 불가, 시나리오 기반

- [ ] **[DOC-2]** `docs/get-started/authentication.md` 업데이트
  - DidimAIStudio 인증 섹션 추가
  - JWT 토큰 획득 방법 안내
  - `/auth login` → DidimAIStudio 흐름 설명

- [ ] **[DOC-3]** `docs/index.md` 업데이트
  - 프로바이더 매트릭스 Didim 행 업데이트 (모델 컬럼: "시나리오 기반")

---

## 4.7 사후 작업

- [ ] **[FINAL-TEST]** 최종 전체 테스트

  ```bash
  npm run preflight
  ```

- [ ] **[FINAL-BUILD]** 최종 빌드 + 번들

  ```bash
  npm run build && npm run bundle
  ```

- [ ] **[DOC]** Phase 4 작업 결과서 작성
  - 파일: `../working_history/Phase4_quality_gates_and_e2e_{작업일자}.md`
  - 내용:
    - Quality Gate 1~4 결과
    - E2E 시나리오 12개 결과 요약
    - 문서 업데이트 목록
    - 알려진 제한사항
    - 향후 개선 사항 (이미지 첨부, 경로 프록시 등)

- [ ] **[COMMIT]** 변경사항 커밋
  ```bash
  git commit -m "test: Phase 4 quality gates — Didim integration + doc updates"
  ```

---

## ✅ 최종 체크리스트

### TDD 사이클 완료

- [ ] Phase 1~3 모든 Red → Green → Refactor 사이클 완료
- [ ] 전체 테스트 통과 (`npm test`)
- [ ] Typecheck 에러 0개
- [ ] Lint 경고 0개
- [ ] 빌드 + 번들 성공

### E2E 검증

| #   | 시나리오                | 결과 |
| --- | ----------------------- | ---- |
| 1   | DIDIM_API_KEY 자동 감지 | ⬜   |
| 2   | LLM_PROVIDER=didim 명시 | ⬜   |
| 3   | Auth 다이얼로그 표시    | ⬜   |
| 4   | 설정 영속화             | ⬜   |
| 5   | /model 비활성 안내      | ⬜   |
| 6   | 일반 채팅               | ⬜   |
| 7   | SSE sse 모드            | ⬜   |
| 8   | SSE improved 모드       | ⬜   |
| 9   | thread_id 유지          | ⬜   |
| 10  | 401 에러 안내           | ⬜   |
| 11  | Didim → Gemini 전환     | ⬜   |
| 12  | Gemini → Didim 전환     | ⬜   |

### 문서화

- [ ] `docs/providers.md` 업데이트 완료
- [ ] `docs/get-started/authentication.md` 업데이트 완료
- [ ] `docs/index.md` 업데이트 완료
- [ ] Phase 1~4 작업 결과서 전수 작성 완료

### 최종 커밋 및 PR

- [ ] 모든 변경사항 커밋 완료 (7개 커밋)
- [ ] 커밋 히스토리 검토 (구조/동작 분리 확인)

---

## 📊 Phase 전체 진행 체크리스트

| Phase | 범위                     | PRE | RED | GREEN | REFACTOR | POST | 결과서 | 커밋 | 상태 |
| ----- | ------------------------ | --- | --- | ----- | -------- | ---- | ------ | ---- | ---- |
| 1     | Core Converter           | ⬜  | ⬜  | ⬜    | ⬜       | ⬜   | ⬜     | ⬜   | ⬜   |
| 2     | Core Adapter + Bootstrap | ⬜  | ⬜  | ⬜    | ⬜       | ⬜   | ⬜     | ⬜   | ⬜   |
| 3     | CLI Auth + Settings      | ⬜  | ⬜  | ⬜    | ⬜       | ⬜   | ⬜     | ⬜   | ⬜   |
| 4     | Quality Gates + E2E      | ⬜  | —   | —     | —        | ⬜   | ⬜     | ⬜   | ⬜   |

---

## 향후 개선 사항 (본 프로젝트 범위 외)

| #   | 항목                              | 우선순위  | 비고                               |
| --- | --------------------------------- | --------- | ---------------------------------- |
| 1   | 이미지 첨부 (attachments[])       | 🟡 Medium | scenario-gateway 첨부 투과 완료 후 |
| 2   | 경로 기반 프록시 지원             | 🟢 Low    | `domain/custom-prefix` 지원        |
| 3   | Didim 전용 로컬 프롬프트 확장     | 🟢 Low    | 서버 시나리오 정책에 따라 결정     |
| 4   | countTokens 지원                  | 🟢 Low    | Didim API에서 토큰 카운트 제공 시  |
| 5   | `useAuth.ts` Didim 자동 감지 보완 | 🟡 Medium | `DIDIM_API_KEY` 단독 자동감지      |

---

**상태**: ⬜ Phase 3 완료 후 시작
