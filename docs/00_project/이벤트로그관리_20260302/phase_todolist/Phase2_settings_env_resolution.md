# Phase 2: Settings + Env Resolution

> TDD 기반: Red -> Green -> Refactor  
> 참고: [99_TDD_plan.md](../../ai_adapter/template/99_TDD_plan.md),
> [01_todolist_performance_template.md](../../ai_adapter/template/01_todolist_performance_template.md),
> [agent_event_audit_log_design_20260302.md](../agent_event_audit_log_design_20260302.md)

---

## 작업 개요

| 항목        | 내용                                                           |
| ----------- | -------------------------------------------------------------- |
| 목표        | `/settings` + env prefix 우선순위 + sharedEnv 강제 규칙 구현   |
| 영향 범위   | `settingsSchema`, env resolver, hook env 전달 규칙             |
| 위험 수준   | 🔴 High                                                        |
| 성능 민감도 | 🟢 Low                                                         |
| 완료 조건   | `/settings` 편집 가능 키 반영, strict env에서도 설정 유실 없음 |

---

## 핵심 리스크

| 리스크                                       | 영향 | 대응                          | 상태 |
| -------------------------------------------- | ---- | ----------------------------- | ---- |
| strict sanitization에서 `AGENT_AUDIT_*` 누락 | 🔴   | `DIDIM_CLI_AUDIT_*` 표준 적용 | ⬜   |
| sharedEnv=true + tenantId 누락 저장          | 🔴   | 저장 차단 + 검증 테스트       | ⬜   |
| env/settings/default 우선순위 역전           | 🟠   | 우선순위 매트릭스 테스트      | ⬜   |

---

## 2.1 사전 작업 (Pre-Work)

- [ ] **[REVIEW]** Phase1 결과서 검토
  - 저장소 인터페이스/이벤트 필드 확정 여부 확인
- [ ] **[ANALYSIS]** 현재 settings 다이얼로그/스키마 구조 분석
  - `packages/cli/src/config/settingsSchema.ts`
  - `packages/cli/src/ui/components/SettingsDialog.tsx`
- [ ] **[ANALYSIS]** env sanitization 규칙 분석
  - `packages/core/src/services/environmentSanitization.ts`
  - strict 모드 allowlist 확인
- [ ] **[SCOPE-CHECK]** 구현 범위 확정
  - auditLog 키 추가 + 런타임 해석기 + 검증 에러 처리

---

## 2.2 RED Phase

- [ ] **[RED-001]** `/settings` schema 키 존재 테스트
  - `auditLog.enabled/sharedEnv/tenantId/storageMode/...` 노출 여부
- [ ] **[RED-002]** 우선순위 해석 테스트
  - `DIDIM_CLI_AUDIT_* > GEMINI_CLI_AUDIT_* > AGENT_AUDIT_* > settings > default`
- [ ] **[RED-003]** sharedEnv 강제 테스트
  - sharedEnv=true + tenantId empty -> 저장/쓰기 차단
- [ ] **[RED-004]** strict sanitization 전달 테스트
  - `DIDIM_CLI_AUDIT_*`는 hook subprocess env에 유지됨

실패 확인:

```bash
npm test -w @didim365/agent-cli-core -- environmentSanitization
npm test -w @didim365/agent-cli -- settings
```

---

## 2.3 GREEN Phase

- [ ] **[TASK-001]** `settingsSchema`에 `auditLog` 루트 추가
  - 파일: `packages/cli/src/config/settingsSchema.ts`
- [ ] **[TASK-002]** audit 설정 해석 유틸 구현
  - 파일: `packages/core/src/audit/config.ts` (신규)
- [ ] **[TASK-003]** hook env 전달 규약 반영
  - `DIDIM_CLI_AUDIT_*` 기준으로 해석/문서화
- [ ] **[TASK-004]** sharedEnv guard 구현
  - tenant 누락 시 저장 스킵 + 오류 이벤트 로깅

통과 확인:

```bash
npm test -w @didim365/agent-cli-core -- audit/config environmentSanitization
npm test -w @didim365/agent-cli -- settings
```

---

## 2.4 REFACTOR Phase

### 2.4.1 구조 개선

- [ ] env 키 매핑 테이블 상수화
- [ ] settings validation 메시지 일관화
- [ ] audit 설정 객체 타입 안정화

### 2.4.2 성능/운영 개선

- [ ] 설정 해석 캐시(세션 단위) 적용
- [ ] `/settings` 저장 후 즉시 반영 검증(재시작 불필요 항목)

검증:

```bash
npm test -w @didim365/agent-cli -- settings --runInBand
npm test -w @didim365/agent-cli-core -- audit/config
```

---

## 2.5 사후 작업 (Post-Work)

- [ ] **[TEST]** Core/CLI 관련 회귀 테스트
- [ ] **[LINT/TYPE]** lint + typecheck
- [ ] **[DOC]** 결과서 작성
  - `docs/00_project/이벤트로그관리_20260302/working_history/Phase2_settings_env_resolution_YYYYMMDD.md`
- [ ] **[COMMIT]** 커밋

```bash
git add .
git commit -m "[Phase2] audit settings and env resolution"
```
