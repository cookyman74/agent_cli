# Phase B 작업결과서: write_todos 제거 — Task\* 도구 단일화

> **작업일**: 2026-03-02 **브랜치**: `DID/v0.2`

---

## 1. 작업 개요

| 항목      | 내용                                                               |
| --------- | ------------------------------------------------------------------ |
| 목적      | write_todos 도구 완전 제거, Task\* 도구로 작업관리 단일화 (방안 C) |
| 배경      | Gemini 모델이 write_todos와 Task\* 도구 간 선택 충돌 발생          |
| 근본 원인 | 두 도구의 프롬프트 설명이 모두 "complex multi-step" 작업 대상 명시 |
| 위험 수준 | Medium — 도구 삭제 + 프롬프트 구조 변경 + 설정 필드 제거           |

---

## 2. 문제 분석

### 증상

- 사용자가 복잡한 작업 요청 시, 모델이 Task\* 도구 대신 write_todos를 기본 선택
- 명시적으로 "task를 사용해라"고 재지시해야 Task\* 도구 사용

### 원인

- `write_todos` 도구 설명: "Use this tool for complex queries that require
  multiple steps"
- `taskToolsGuidance` 프롬프트: "Use Task tools as the primary method for
  tracking progress on multi-step tasks"
- 두 설명이 동일 도메인을 주장하여 모델의 도구 선택에 모호성 발생

### 방안 비교

| 방안  | 내용                      | 장점                 | 단점                       |
| ----- | ------------------------- | -------------------- | -------------------------- |
| A     | 프롬프트 조정만           | 최소 변경            | 모호성 잔존 가능           |
| B     | write_todos를 wrapper화   | 점진적 전환          | 복잡성 증가                |
| **C** | **write_todos 완전 제거** | **모호성 근본 해소** | **하위호환 단절 (의도적)** |

**선택**: 방안 C — 도구 선택 모호성을 근본적으로 해소하고, 단일 데이터 소스로
통합.

---

## 3. 변경 내역

### 삭제 파일 (2)

| 파일                                          | 내용                    |
| --------------------------------------------- | ----------------------- |
| `packages/core/src/tools/write-todos.ts`      | write_todos 도구 구현체 |
| `packages/core/src/tools/write-todos.test.ts` | write_todos 단위 테스트 |

### 수정 파일 (11)

| #   | 파일                                                    | 변경 내용                                                                                                                |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | `packages/core/src/index.ts`                            | `export * from './tools/write-todos.js'` 제거                                                                            |
| 2   | `packages/core/src/tools/tool-names.ts`                 | `WRITE_TODOS_TOOL_NAME` 상수 및 배열 항목 제거                                                                           |
| 3   | `packages/core/src/config/config.ts`                    | `WriteTodosTool` import, `useWriteTodos` 필드/getter/초기화/등록 블록 제거                                               |
| 4   | `packages/core/src/core/prompts.ts`                     | `enableWriteTodosTool` 로직, todo variant 2개, 4-way→2-way 분기 간소화, taskToolsGuidance write_todos 비교문 제거        |
| 5   | `packages/cli/src/config/settingsSchema.ts`             | `useWriteTodos` 설정 항목 제거                                                                                           |
| 6   | `packages/cli/src/config/config.ts`                     | `CliArgs.useWriteTodos` 필드 및 전달 로직 제거                                                                           |
| 7   | `packages/core/src/config/config.test.ts`               | `UseWriteTodos Configuration` describe 제거 (4개), Task\* 테스트 이름 단순화, 불필요한 테스트 2개 제거, import/mock 정리 |
| 8   | `packages/core/src/core/prompts.test.ts`                | write_todos tool 목록에서 제거, 테스트 이름/내용 갱신, write_todos 미언급 검증 테스트 추가                               |
| 9   | `packages/core/src/tools/phase5-integration.test.ts`    | INTEGRATION-4 describe 전체 제거 (2개 테스트), import 제거                                                               |
| 10  | `packages/cli/src/ui/components/messages/Todo.test.tsx` | tool name `'write_todos'`→`'task_list'`, 테스트 description 갱신, 스냅샷 갱신                                            |
| 11  | `packages/cli/src/ui/constants/tips.ts`                 | write_todos 언급 tip을 Task tools 안내로 변경                                                                            |
| 12  | `packages/cli/src/gemini.test.tsx`                      | mock에서 `getUseWriteTodos` 제거                                                                                         |
| 13  | `packages/cli/src/ui/components/messages/Todo.tsx`      | 주석에서 WriteTodosTool 언급 갱신                                                                                        |

### 변경하지 않은 파일

| 파일                                               | 이유                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/cli/src/ui/components/messages/Todo.tsx` | TodoTray는 tool-agnostic (`'todos' in resultDisplay` 검사). 코드 변경 불필요. |
| `packages/cli/src/config/settings_repro.test.ts`   | `useWriteTodos: true` 제거 (minor)                                            |

---

## 4. 프롬프트 구조 변경 상세

### Before (4-way variant 선택)

```
if (enableCodebaseInvestigator && enableWriteTodosTool)
  → primaryWorkflows_prefix_ci_todo
else if (enableCodebaseInvestigator)
  → primaryWorkflows_prefix_ci
else if (enableWriteTodosTool)
  → primaryWorkflows_todo
else
  → primaryWorkflows_prefix
```

### After (2-way variant 선택)

```
if (enableCodebaseInvestigator)
  → primaryWorkflows_prefix_ci
else
  → primaryWorkflows_prefix
```

### taskToolsGuidance Before

```
In addition to `write_todos`, you have access to structured task management tools...
When to use Task tools vs write_todos:
- Use Task tools as the primary method...
- Use write_todos for quick, simple todo lists...
```

### taskToolsGuidance After

```
You have access to structured task management tools for tracking complex, multi-step work:
- task_create: ...
- task_get: ...
- task_update: ...
- task_list: ...

Use Task tools as the primary method for tracking progress on multi-step tasks.
```

---

## 5. 검증 결과

| 검증 항목                        | 결과                                    |
| -------------------------------- | --------------------------------------- |
| Core typecheck                   | 0 에러 ✅                               |
| CLI typecheck                    | 0 에러 ✅                               |
| Full build (`npm run build`)     | 성공 ✅                                 |
| Core 단위 테스트                 | 4843/4843 passed ✅                     |
| CLI 단위 테스트                  | 105/105 passed ✅                       |
| VSCode 테스트                    | 40/40 passed ✅                         |
| write_todos 잔여 참조 (src 기준) | 0건 (테스트 negative assertion 제외) ✅ |
| 스냅샷 갱신                      | 2 obsolete 제거, 2 written ✅           |

---

## 6. 영향 분석

### 하위호환

- `useWriteTodos` 설정을 `true`/`false`로 지정한 사용자: 설정이 무시됨 (에러
  없음, 단순 무시)
- `settings.json`에 `useWriteTodos` 남아있어도 JSON 파싱 시 무해하게 무시됨

### 모델 행동 변화

- Task\* 도구가 작업 관리의 유일한 수단 → 도구 선택 모호성 완전 해소
- 프롬프트에서 write_todos 언급 완전 제거 → 모델이 Task\* 도구에 집중

### TodoTray UI

- 변경 없음 — TodoTray는 `resultDisplay.todos` 키 존재 여부만 확인하므로 Task\*
  도구 출력과 완전 호환

---

## 7. 리뷰 이슈 R1-R2 수정

### R1. [MEDIUM] 세션 Resume 시 제거된 write_todos 호출명 처리

**증상**: 구세션 Resume 시 `write_todos` functionCall이 히스토리에 그대로
주입되어, 모델이 패턴 참조 후 재호출 시도 → `TOOL_NOT_REGISTERED` 에러

**원인**: `convertSessionToHistoryFormats()` (useSessionBrowser.ts)에서 저장된
`toolCall.name`을 무검증으로 `functionCall.name`에 주입

**조치**:

- `REMOVED_TOOL_NAMES = new Set(['write_todos'])` 상수 추가
- functionCall 생성 루프: 제거된 도구 → 텍스트 요약
  `[Previously used tool "${name}" — result: ...]`으로 대체
- functionResponse 생성 루프: 제거된 도구 → `continue`로 건너뛰기
- 테스트 2건 추가: 단독 write_todos 케이스, 혼합(valid + removed) 케이스

| 수정 파일                                             | 변경 내용                                                       |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| `packages/cli/src/ui/hooks/useSessionBrowser.ts`      | `REMOVED_TOOL_NAMES` 상수, functionCall/functionResponse 필터링 |
| `packages/cli/src/ui/hooks/useSessionBrowser.test.ts` | 제거된 도구 필터링 검증 테스트 2건 추가                         |

### R2. [LOW] 문서에서 write_todos/useWriteTodos 참조 잔존 정리

**증상**: 활성 문서(사용자 대면 docs)에서 `write_todos`, `useWriteTodos` 참조가
남아 운영 혼선 가능

**조치**:

| 수정 파일                            | 변경 내용                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| `docs/tools/todos.md`                | 전체 개편 — write_todos 문서 → Task\* 도구 문서                                 |
| `docs/tools/index.md`                | Todo Tool → Task Tools 링크/설명 갱신                                           |
| `docs/get-started/configuration.md`  | tools.core 목록에서 write_todos 제거, Task\* 도구 추가; useWriteTodos 섹션 삭제 |
| `docs/index.md`                      | Todo tool 링크 → Task tools 갱신                                                |
| `docs/get-started/authentication.md` | 도구 테이블에서 write_todos → Task\* 4개 도구로 교체                            |
| `docs/hooks/writing-hooks.md`        | 예제 코드에서 write_todos → task_create, task_list                              |
| `docs/providers.md`                  | 도구 테이블에서 write_todos → Task\* 4개 도구로 교체                            |

**미수정 (의도적 유지)**:

- `docs/00_project/` — 프로젝트 히스토리/설계 문서 (역사적 기록)
- `docs/changelogs/` — 변경로그 (역사적 기록)

### R1-R2 검증 결과

| 검증 항목                       | 결과                          |
| ------------------------------- | ----------------------------- |
| CLI build                       | 성공 ✅                       |
| Core 단위 테스트                | 5938 passed ✅                |
| CLI 단위 테스트                 | 4845 passed ✅                |
| VSCode 테스트                   | 40 passed ✅                  |
| useSessionBrowser 테스트        | 9/9 passed (2건 신규 포함) ✅ |
| 활성 문서 write_todos 잔여 참조 | 0건 ✅                        |

---

**작성일**: 2026-03-02 **상태**: ✅ Phase B (write_todos 제거) 완료 + R1-R2 리뷰
이슈 수정 완료
