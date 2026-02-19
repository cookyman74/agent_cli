# MCP 도구 호출 안정성 개선 — 작업 계획서

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 테스트
> 먼저 작성 → 최소 코드 구현 → 리팩터링 **리팩터링 원칙**: "Make it work → Make
> it right → Make it fast" **참고 문서**:
>
> - [상세 작업계획서 디렉토리](./phase_todolist/) — Phase별 상세 계획
> - [normalizeToolParams hotfix 결과서](../subagent_multi_provider/working_history/hotfix_tool_param_normalize_20260219.md)
>   — 선행 작업

---

## 작업 개요

| 항목        | 내용                                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| 프로젝트    | MCP 도구 호출 안정성 개선 — 이름 충돌·정책 우회·길이 초과·파라미터 정규화                                       |
| 영향 범위   | `mcp-tool.ts`, `mcp-client-manager.ts`, `tool-registry.ts`, `policy-engine.ts`, `tool-utils.ts`, `scheduler.ts` |
| 위험 수준   | 🔴 High — 정책 우회(보안), 도구 이름 비결정성(재현 불가 버그), 길이 초과(API 거부)                              |
| 성능 민감도 | 🟢 Low — MCP 디스커버리 시점 1회 처리, 런타임 호출 경로 변경 없음 (Phase 4 제외)                                |
| 작업 브랜치 | `v0.2.0/se_manager_agent`                                                                                       |

---

## 이슈 요약

### Issue #1: [HIGH] MCP server wildcard 정책 우회 가능성

| 항목     | 내용                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------- |
| 위치     | `policy-engine.ts:45-57` (`ruleMatches()`), `policy-engine.ts:312` (`toolCallsToTry` 구성)            |
| 현상     | `server__*` 와일드카드 정책이 `serverName`과 `toolCall.name` prefix를 이중 검증하나, 엣지 케이스 존재 |
| 근본원인 | 1) `!toolCall.name.includes('__')` 게이트가 도구 이름 자체에 `__` 포함 시 2차 자격 부여 건너뜀        |
|          | 2) `serverName`이 `undefined`일 때 와일드카드 매칭에서 서버 검증 생략 → prefix만으로 매칭             |
| 영향     | 악의적 MCP 서버가 도구 이름에 `trusted_server__` prefix를 포함시켜 신뢰된 서버 정책 우회 가능         |
| 대응     | `generateValidName()`에서 `__` 제거 + `ruleMatches()` serverName undefined 가드 강화                  |

### Issue #2: [HIGH] 동일 도구의 비결정적 이름 등록

| 항목     | 내용                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------- |
| 위치     | `mcp-client-manager.ts:323` (`Promise.all()`), `tool-registry.ts:214-226` (`registerTool()`)              |
| 현상     | 여러 MCP 서버가 동일 이름 도구 제공 시, 서버 디스커버리 순서(Promise.all 레이스)에 따라 등록 이름 변동    |
| 근본원인 | `Promise.all()`은 항목 실행 순서를 보장하지 않음 → 먼저 등록된 서버의 도구가 unqualified 이름 획득        |
| 영향     | 세션마다 같은 도구가 다른 이름(unqualified vs qualified)으로 등록 → 정책 규칙·LLM 학습·디버깅 모두 불안정 |
| 대응     | 2-pass 등록: 디스커버리 완료 후 충돌 감지 → 충돌 도구 전부 qualified name 강제                            |

### Issue #3: [HIGH] Qualified 도구 이름 길이/형식 안전성

| 항목     | 내용                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| 위치     | `mcp-tool.ts:445-456` (`generateValidName()`), `mcp-tool.ts:273-275` (`getFullyQualifiedName()`)               |
| 현상     | `generateValidName()`이 63자로 truncate하지만, `getFullyQualifiedName()`이 prefix 추가 후 재-truncate하지 않음 |
| 근본원인 | `getFullyQualifiedName()` = `prefix + generateValidName(toolName)` → prefix 길이만큼 63자 초과 가능            |
| 영향     | 긴 서버명 + 긴 도구명 조합 시 Gemini API 63자 제한 위반 → 400 에러                                             |
| 대응     | `getFullyQualifiedName()`에서 최종 결합명에 대해 재-truncate 적용                                              |

### Issue #4: [MEDIUM] MCP 도구 파라미터 alias 정규화 미적용

| 항목     | 내용                                                                                   |
| -------- | -------------------------------------------------------------------------------------- |
| 위치     | `tool-utils.ts` (`TOOL_PARAM_ALIASES`), `scheduler.ts`, `coreToolScheduler.ts`         |
| 현상     | `normalizeToolParams()`는 내장 도구만 커버 → MCP 도구는 alias map에 없어 정규화 건너뜀 |
| 근본원인 | MCP 도구는 런타임에 동적 디스커버리 → 컴파일 타임에 alias 정의 불가                    |
| 영향     | non-Gemini LLM이 MCP 도구 첫 호출 시 파라미터명 불일치 → AJV 검증 실패 → 1 turn 낭비   |
| 대응     | MCP 도구의 `parameterSchema`에서 런타임으로 alias 후보 추론 + schema-based 정규화      |

---

## 핵심 리스크 요약

| 리스크                                                  | 영향      | 대응 방안                                                          | Phase |
| ------------------------------------------------------- | --------- | ------------------------------------------------------------------ | ----- |
| 2-pass 등록 도입 시 기존 단일-서버 환경 회귀            | 🟡 Medium | 단일 서버 시 기존 동작 유지 (충돌 없으면 unqualified 이름 유지)    | 1     |
| qualified name 재-truncate 시 해시 충돌                 | 🟢 Low    | 해시 접미사(6자) 추가로 충돌 최소화 + 충돌 시 카운터 접미사        | 2     |
| `__` 구분자 제거가 기존 MCP 도구 이름과 호환성 문제     | 🟡 Medium | `generateValidName()`만 변경 → 이미 등록된 도구의 원본 이름은 보존 | 3     |
| schema-based 정규화의 camelCase↔snake_case 추론 정확도 | 🟡 Medium | required 필드에만 적용 + 정확 매칭 우선 → 퍼지 매칭은 옵션화       | 4     |
| MCP 서버 응답 속도 차이로 디스커버리 타임아웃           | 🟢 Low    | 기존 타임아웃 메커니즘 유지, 2-pass는 디스커버리 완료 후 처리      | 1     |

---

## 작업 일관성 메커니즘

> **원칙**: 각 Phase 완료 시 작업 결과서를 작성하고, 다음 Phase 착수 시 이전
> 결과서를 확인하여 작업 일관성을 유지한다.

```
Phase 1 완료 → [DOC-A] 결과서 작성 → Phase 2 [PREV-REVIEW] 결과서 확인 → Phase 2 착수
Phase 2 완료 → [DOC-B] 결과서 작성 → Phase 3 [PREV-REVIEW] 결과서 확인 → Phase 3 착수
Phase 3 완료 → [DOC-C] 결과서 작성 → Phase 4 [PREV-REVIEW] 결과서 확인 → Phase 4 착수
Phase 4 완료 → [DOC-D] 최종 결과서 작성 → 전체 완료
```

| Phase | 작업 결과서 파일명                                              |
| ----- | --------------------------------------------------------------- |
| 1     | `working_history/mcp_phase1_deterministic_naming_{작업일자}.md` |
| 2     | `working_history/mcp_phase2_name_length_safety_{작업일자}.md`   |
| 3     | `working_history/mcp_phase3_policy_hardening_{작업일자}.md`     |
| 4     | `working_history/mcp_phase4_param_normalization_{작업일자}.md`  |

**작업 결과서 공통 포함 항목**:

- Phase 작업 요약 (변경 파일, 핵심 구현 사항)
- 테스트/린트/타입체크 실행 결과
- 커밋 해시
- 완료 조건 달성 여부 (테이블 + 체크 상태)
- **다음 Phase 전달사항** (주의점, 미해결 이슈)

---

## Phase 요약 및 진행 상황

### Phase 1: 결정적 MCP 도구 이름 등록

> **상세 계획**:
> [phase_todolist/phase1_deterministic_naming.md](./phase_todolist/phase1_deterministic_naming.md)

| 항목      | 내용                                                                        |
| --------- | --------------------------------------------------------------------------- |
| 목적      | MCP 서버 디스커버리 순서와 무관하게 도구 이름이 결정적으로 등록되도록 보장  |
| 핵심 변경 | `tool-registry.ts`에 2-pass 등록 로직: 충돌 도구는 모두 qualified name 강제 |
| 변경 파일 | 수정 2 + 신규 0 = **2 파일**, ~120줄                                        |
| 커밋      | 3건 (TDD + 구현 + refactor)                                                 |
| 상태      | ⬜ 미착수                                                                   |

### Phase 2: Qualified 도구 이름 길이/형식 안전성

> **상세 계획**:
> [phase_todolist/phase2_name_length_safety.md](./phase_todolist/phase2_name_length_safety.md)

| 항목      | 내용                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------- |
| 목적      | `getFullyQualifiedName()` 결과가 항상 63자 이내이고, `__` 구분자가 도구 이름 내에 포함되지 않도록 보장   |
| 핵심 변경 | `mcp-tool.ts`의 `generateValidName()`에서 `__` sanitize + `getFullyQualifiedName()`에서 최종 길이 재검증 |
| 변경 파일 | 수정 2 = **2 파일**, ~80줄                                                                               |
| 커밋      | 2건 (TDD + 구현)                                                                                         |
| 상태      | ⬜ 미착수                                                                                                |

### Phase 3: 정책 엔진 와일드카드 엣지 케이스 강화

> **상세 계획**:
> [phase_todolist/phase3_policy_hardening.md](./phase_todolist/phase3_policy_hardening.md)

| 항목      | 내용                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------- |
| 목적      | `server__*` 와일드카드 정책에서 서버 스푸핑 불가능 보장 + `serverName` undefined 엣지 케이스 차단    |
| 핵심 변경 | `ruleMatches()`에서 serverName undefined 시 와일드카드 거부 + 도구 이름 `__` sanitize (Phase 2 연계) |
| 변경 파일 | 수정 2 = **2 파일**, ~60줄                                                                           |
| 커밋      | 2건 (TDD + 구현)                                                                                     |
| 의존성    | Phase 2 완료 필수 (도구 이름에서 `__` 제거 보장 전제)                                                |
| 상태      | ⬜ 미착수                                                                                            |

### Phase 4: MCP 도구 파라미터 schema-based 정규화

> **상세 계획**:
> [phase_todolist/phase4_param_normalization.md](./phase_todolist/phase4_param_normalization.md)

| 항목      | 내용                                                                                       |
| --------- | ------------------------------------------------------------------------------------------ |
| 목적      | MCP 도구의 파라미터 schema를 분석하여 런타임 alias 추론 → non-Gemini LLM 첫 호출 실패 방지 |
| 핵심 변경 | `tool-utils.ts`에 `normalizeToolParamsBySchema()` 추가 + `scheduler.ts` 조건부 호출        |
| 변경 파일 | 수정 3 + 신규 0 = **3 파일**, ~150줄                                                       |
| 커밋      | 3건 (TDD + 구현 + scheduler 연결)                                                          |
| 상태      | ⬜ 미착수                                                                                  |

---

## 전체 완료 조건

| 검증 항목                                                                 | Phase | 상태 |
| ------------------------------------------------------------------------- | ----- | ---- |
| 2-pass 등록 TDD (충돌 도구 양쪽 모두 qualified, 단일 서버 기존 동작 유지) | 1     | ⬜   |
| `registerMCPTools()` 일괄 등록 메서드 구현 + 기존 테스트 회귀 없음        | 1     | ⬜   |
| Phase 1 커밋 완료 + **작업 결과서 작성**                                  | 1     | ⬜   |
| `generateValidName()` `__` sanitize TDD                                   | 2     | ⬜   |
| `getFullyQualifiedName()` 63자 재-truncate TDD                            | 2     | ⬜   |
| 긴 서버명 + 긴 도구명 조합 경계값 테스트                                  | 2     | ⬜   |
| Phase 2 커밋 완료 + **작업 결과서 작성**                                  | 2     | ⬜   |
| `ruleMatches()` serverName undefined + 와일드카드 거부 TDD                | 3     | ⬜   |
| 도구 이름에 `__` 포함된 상태에서 정책 매칭 불가 확인                      | 3     | ⬜   |
| Phase 3 커밋 완료 + **작업 결과서 작성**                                  | 3     | ⬜   |
| `normalizeToolParamsBySchema()` TDD (camelCase, snake_case, 정확 매칭)    | 4     | ⬜   |
| scheduler에서 MCP 도구 호출 시 schema-based 정규화 적용 확인              | 4     | ⬜   |
| 기존 `normalizeToolParams()` (내장 도구) 동작 회귀 없음                   | 4     | ⬜   |
| Phase 4 커밋 완료 + **최종 작업 결과서 작성**                             | 4     | ⬜   |
| Core 전체 단위 테스트 PASS                                                | 전체  | ⬜   |
| 빌드 성공                                                                 | 전체  | ⬜   |
| Lint + Typecheck 통과                                                     | 전체  | ⬜   |

---

## 변경 파일 요약

| 파일                           | Phase | 액션   | 예상 규모 |
| ------------------------------ | ----- | ------ | --------- |
| `tools/tool-registry.ts`       | 1     | 수정   | +60줄     |
| `tools/tool-registry.test.ts`  | 1     | 수정   | +60줄     |
| `tools/mcp-tool.ts`            | 2     | 수정   | +30줄     |
| `tools/mcp-tool.test.ts`       | 2     | 수정   | +50줄     |
| `policy/policy-engine.ts`      | 3     | 수정   | +15줄     |
| `policy/policy-engine.test.ts` | 3     | 수정   | +45줄     |
| `utils/tool-utils.ts`          | 4     | 수정   | +80줄     |
| `utils/tool-utils.test.ts`     | 4     | 수정   | +70줄     |
| `scheduler/scheduler.ts`       | 4     | 수정   | +5줄      |
| **합계**                       |       | 수정 9 | ~415줄    |

---

## Phase 의존성 그래프

```
Phase 1 (결정적 이름) ─┬─→ Phase 2 (길이/형식) ──→ Phase 3 (정책 강화)
                       │
                       └─→ Phase 4 (파라미터 정규화) [독립]
```

- Phase 2는 Phase 1에서 등록 방식이 확정된 후 이름 생성 규칙 변경
- Phase 3은 Phase 2에서 `__` sanitize가 보장된 후 정책 엣지 케이스 차단
- Phase 4는 독립적이나, Phase 1의 이름 결정성이 보장되어야 정규화 대상 도구
  이름이 안정

---

## 참고: 선행 작업 (normalizeToolParams hotfix)

이 작업은
[hotfix_tool_param_normalize_20260219.md](../subagent_multi_provider/working_history/hotfix_tool_param_normalize_20260219.md)에서
발견된 MCP 도구 관련 이슈를 체계적으로 해결하기 위한 후속 작업입니다.

선행 작업에서 완료된 내용:

- `normalizeToolParams()` 유틸리티 함수 구현 (내장 도구 11개, alias 50개)
- `scheduler.ts`, `coreToolScheduler.ts` 양쪽 경로에 정규화 적용
- 내장 도구의 파라미터 alias 커버리지 100% 달성

이 작업에서 해결할 잔여 이슈:

- MCP 도구는 동적 디스커버리 → 컴파일 타임 alias 정의 불가 → schema-based 런타임
  정규화 필요
- MCP 도구 이름 등록/정책/길이 관련 구조적 문제
