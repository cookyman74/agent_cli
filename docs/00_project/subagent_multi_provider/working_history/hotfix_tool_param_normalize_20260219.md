# Hotfix: non-Gemini LLM 도구 파라미터명 불일치 정규화

> **작업일**: 2026-02-19 **브랜치**: `hotfix/v0.2.5` (`v0.2.0/se_manager_agent`
> 기반)

---

## 1. 작업 요약

### 문제

non-Gemini 모델(OpenAI, Claude)이 도구 호출 시 파라미터명을 관례적 이름으로
추측하여 **매 대화 첫 도구 호출마다 1회 실패**:

| 도구       | 모델이 보낸 파라미터 | 올바른 이름 | 에러 메시지                                      |
| ---------- | -------------------- | ----------- | ------------------------------------------------ |
| ReadFile   | `path`               | `file_path` | `params must have required property 'file_path'` |
| SearchText | `query`              | `pattern`   | `params must have required property 'pattern'`   |

### 근본 원인

`scheduler.ts:299`에서 `tool.build(request.args)` 호출 전에 파라미터명 정규화
레이어가 없음. AJV가 strict 검증을 수행하여 즉시 실패.

```
LLM Response → args (변환 없음) → tool.build(args) → AJV 검증 실패
```

### 해결

`normalizeToolParams()` 순수 함수를 `tool-utils.ts`에 추가하고,
`scheduler.ts`에서 `tool.build()` 호출 전에 1줄 연결.

```
LLM Response → args → normalizeToolParams(toolName, args) → tool.build(normalized) → AJV 검증 통과
```

---

## 2. 변경 파일

| 파일                                            | 액션 | 변경 규모                |
| ----------------------------------------------- | ---- | ------------------------ |
| `packages/core/src/utils/tool-utils.ts`         | 수정 | +90줄 (alias map + 함수) |
| `packages/core/src/utils/tool-utils.test.ts`    | 수정 | +100줄 (12개 테스트)     |
| `packages/core/src/scheduler/scheduler.ts`      | 수정 | +2줄 (import + 호출)     |
| `packages/core/src/scheduler/scheduler.test.ts` | 수정 | +63줄 (3개 테스트)       |

### 핵심 구현

#### TOOL_PARAM_ALIASES (도구별 alias→canonical 매핑)

```typescript
const TOOL_PARAM_ALIASES: Record<string, Record<string, string>> = {
  read_file: {
    path: 'file_path',
    filepath: 'file_path',
    filePath: 'file_path',
    file: 'file_path',
  },
  search_file_content: {
    query: 'pattern',
    search_query: 'pattern',
    regex: 'pattern',
    search: 'pattern',
  },
  list_directory: {
    path: 'dir_path',
    directory: 'dir_path',
    dirPath: 'dir_path',
    dir: 'dir_path',
  },
  glob: { glob_pattern: 'pattern', search_pattern: 'pattern' },
  write_file: {
    path: 'file_path',
    filepath: 'file_path',
    filePath: 'file_path',
  },
  replace: { path: 'file_path', filepath: 'file_path', filePath: 'file_path' },
  run_shell_command: { cmd: 'command', shell_command: 'command' },
  google_web_search: { search_query: 'query', search: 'query', q: 'query' },
};
```

#### normalizeToolParams() 규칙

- canonical 파라미터가 이미 존재 → alias 무시 (정상 호출 보호)
- alias 발견 + canonical 부재 → alias 값을 canonical으로 이동, alias key 제거
- alias 규칙 없는 도구 → 원본 args 참조 그대로 반환 (no copy)
- 원본 args 불변 (shallow copy 후 변환)

#### scheduler.ts 연결 (line 299~300)

```typescript
const args = normalizeToolParams(request.name, request.args);
const invocation = tool.build(args);
```

---

## 3. 테스트 결과

### 단위 테스트

```
✓ src/utils/tool-utils.test.ts       (21 tests) — 12개 신규
✓ src/scheduler/scheduler.test.ts    (27 tests) — 3개 신규
```

### 전체 회귀

```
Test Files  284 passed (284)
      Tests  5538 passed | 24 skipped (5562)
```

### 빌드 + 정적 분석

```
TypeScript typecheck: 0 errors
ESLint: 0 warnings
```

---

## 4. 커밋

| #   | 해시      | 메시지                                                                              | 유형                |
| --- | --------- | ----------------------------------------------------------------------------------- | ------------------- |
| 1   | `35ec369` | `feat(utils): normalizeToolParams 유틸리티 — 도구 파라미터 alias 정규화`            | 구조적 (Tidy-first) |
| 2   | `f5af885` | `fix(scheduler): non-Gemini 도구 파라미터명 불일치 해소 — normalizeToolParams 적용` | 동작 변경           |

---

## 5. 완료 조건

| 검증 항목                             | 상태 |
| ------------------------------------- | ---- |
| normalizeToolParams TDD (12개 테스트) | ✅   |
| scheduler 연결 + 테스트 (3개 테스트)  | ✅   |
| 전체 단위 테스트 PASS (5538)          | ✅   |
| TypeScript typecheck 0 errors         | ✅   |
| ESLint 0 warnings                     | ✅   |
| Tidy-first 커밋 분리 (2건)            | ✅   |

---

## 6. 확장성

새 alias 추가 시 `TOOL_PARAM_ALIASES` 상수에 엔트리만 추가. 코드 변경/테스트
추가 불필요.

```typescript
// 예: 새 도구 추가
new_tool: {
  alias_name: 'canonical_name',
},
```

---

## 7. 리스크 및 한계

| 항목                | 설명                                                              | 심각도  |
| ------------------- | ----------------------------------------------------------------- | ------- |
| 관찰된 alias만 커버 | 새 모델의 새로운 파라미터명 추측은 커버 안 됨                     | 🟢 Low  |
| MCP 도구 미대상     | MCP 도구(`server__tool_name`)는 alias 규칙 없음 (설계 의도)       | 🟢 Low  |
| Workspace 경로 제한 | 별도 이슈 — 서브에이전트 workspace scope가 `packages/core`로 제한 | 🟡 별도 |

---

## 8. 리뷰 이슈 검증 및 수정

> **리뷰일**: 2026-02-19 (동일)

### 제기된 이슈 목록

| #   | 심각도  | 이슈                                                 | 검증 결과 |
| --- | ------- | ---------------------------------------------------- | --------- |
| 1   | 🔴 HIGH | Policy bypass — 정규화가 tool.build() 직전에만 적용  | ✅ 확인됨 |
| 2   | 🔴 HIGH | Checkpoint skip — checkpointUtils가 file_path만 검색 | ✅ 확인됨 |
| 3   | 🔴 HIGH | CoreToolScheduler 경로 미적용                        | ✅ 확인됨 |
| 4   | 🟡 MED  | Tool modifier가 request.args 원본 사용               | ✅ 확인됨 |
| 5   | 🟢 LOW  | 테스트 부족 — policy/checkpoint/legacy 경로 미커버   | ✅ 확인됨 |

### 근본 원인 (공통)

정규화를 `_validateAndCreateToolCall` 내부 `tool.build()` 직전에서만 수행.
`request.args`는 원본 alias가 남아 있어 upstream 소비자(policy, checkpoint,
modifier)가 canonical 이름을 찾지 못함.

```
[기존] LLM → request.args(alias) → policy(alias) → modifier(alias) → tool.build(normalized)
                                     ↑ 실패            ↑ 실패
```

### 수정 방안: 정규화 위치 상향

**원칙**: 정규화를 요청 진입점에서 수행 → `request.args` 자체가 canonical → 모든
downstream 소비자 자동 보호.

```
[수정] LLM → normalizeToolParams → enrichedRequest(canonical) → policy(canonical) → modifier(canonical) → tool.build(canonical)
```

### 수정 내역

#### 이슈 #1, #2, #4 — scheduler.ts 정규화 위치 이동

`_validateAndCreateToolCall` 내부가 아닌 `_startBatch`의 `enrichedRequest` 구성
시점으로 이동:

```typescript
// scheduler.ts:242 — 요청 진입점에서 정규화
const enrichedRequest: ToolCallRequestInfo = {
  ...request,
  args: normalizeToolParams(request.name, request.args), // ← 여기로 이동
  schedulerId: this.schedulerId,
  parentCallId: this.parentCallId,
};
```

이로써 policy (`policy.ts:40`), checkpoint (`checkpointUtils.ts:52`), modifier
(`tool-modifier.ts:50,83`) 모두 정규화된 `request.args`를 수신.

#### 이슈 #3 — coreToolScheduler.ts 정규화 추가

`_schedule` 메서드의 `requestsToProcess.map()` 진입점에서 정규화:

```typescript
// coreToolScheduler.ts:488 — legacy 경로 진입점
const newToolCalls: ToolCall[] = requestsToProcess.map(
  (rawReqInfo): ToolCall => {
    const reqInfo: ToolCallRequestInfo = {
      ...rawReqInfo,
      args: normalizeToolParams(rawReqInfo.name, rawReqInfo.args),
    };
    // 이후 buildInvocation, policy check 모두 reqInfo.args 사용
    ...
  },
);
```

#### 이슈 #5 — 테스트 보강

| 파일                        | 추가 테스트 | 설명                                                    |
| --------------------------- | ----------- | ------------------------------------------------------- |
| `scheduler.test.ts`         | +1          | enrichedRequest.args canonical 검증 (state.enqueue)     |
| `coreToolScheduler.test.ts` | +3          | build canonical, policy canonical, no-alias passthrough |

### 변경 파일 (리뷰 수정분)

| 파일                                               | 액션 | 변경 규모                        |
| -------------------------------------------------- | ---- | -------------------------------- |
| `packages/core/src/scheduler/scheduler.ts`         | 수정 | 정규화 위치 이동 (~4줄 변경)     |
| `packages/core/src/core/coreToolScheduler.ts`      | 수정 | import + 정규화 추가 (~5줄)      |
| `packages/core/src/scheduler/scheduler.test.ts`    | 수정 | +1 테스트 (enrichedRequest 검증) |
| `packages/core/src/core/coreToolScheduler.test.ts` | 수정 | +3 테스트 (legacy 경로 검증)     |

### 테스트 결과 (리뷰 수정 후)

```
✓ src/scheduler/scheduler.test.ts         (28 tests) — +1 신규
✓ src/core/coreToolScheduler.test.ts      (23 tests) — +3 신규

Test Files  284 passed (284)
      Tests  5542 passed | 24 skipped (5566)

TypeScript typecheck: 0 errors
ESLint: 0 warnings
```

### 검증 완료 조건

| 검증 항목                                           | 상태 |
| --------------------------------------------------- | ---- |
| 이슈 #1 — policy 경로 canonical args 수신 확인      | ✅   |
| 이슈 #2 — checkpoint canonical file_path 보장       | ✅   |
| 이슈 #3 — coreToolScheduler 정규화 적용 + 테스트    | ✅   |
| 이슈 #4 — modifier canonical args 수신 확인         | ✅   |
| 이슈 #5 — enrichedRequest + legacy 경로 테스트 보강 | ✅   |
| 전체 단위 테스트 PASS (5542)                        | ✅   |
| TypeScript typecheck 0 errors                       | ✅   |
| ESLint 0 warnings                                   | ✅   |

---

## 9. 2차 리뷰: TOOL_PARAM_ALIASES 커버리지 갭 분석 및 수정

> **리뷰일**: 2026-02-19 (동일)

### 분석 범위

전체 15개 빌트인 도구의 파라미터 스키마를 코드 레벨로 검증하여, 기존 8개 도구
alias 매핑의 커버리지 갭을 식별.

### 발견된 이슈

#### 🔴 P0 — 필수 파라미터 실패 (AJV 검증 에러)

| 도구      | 미커버 파라미터          | 예상 alias 혼동                      | 영향              |
| --------- | ------------------------ | ------------------------------------ | ----------------- |
| `replace` | `old_string` (required)  | `old_text`, `oldText`, `original`    | 첫 edit 호출 실패 |
| `replace` | `new_string` (required)  | `new_text`, `newText`, `replacement` | 첫 edit 호출 실패 |
| `replace` | `instruction` (required) | `description`, `reason`              | 첫 edit 호출 실패 |

#### 🟡 P0 — Optional 파라미터 Silent Failure

| 도구                  | 미커버 파라미터       | 예상 alias 혼동                | 영향                                    |
| --------------------- | --------------------- | ------------------------------ | --------------------------------------- |
| `search_file_content` | `dir_path` (optional) | `path`, `directory`, `dirPath` | AJV 통과하지만 잘못된 디렉토리에서 검색 |
| `glob`                | `dir_path` (optional) | `path`, `directory`, `dirPath` | AJV 통과하지만 잘못된 디렉토리에서 검색 |

#### 🟡 P1 — 미커버 도구

| 도구                | 미커버 파라미터      | 예상 alias 혼동                     |
| ------------------- | -------------------- | ----------------------------------- |
| `web_fetch`         | `prompt` (required)  | `url`, `input`, `request`           |
| `read_many_files`   | `include` (required) | `files`, `paths`, `file_paths`      |
| `get_internal_docs` | `path` (optional)    | `file_path`, `filePath`, `doc_path` |

### 수정 내역

`TOOL_PARAM_ALIASES` 확장 (+3 신규 도구, 기존 3 도구 보강):

```typescript
// P0: replace — old_string / new_string / instruction aliases
replace: {
  // (기존 file_path aliases 유지)
  old_text: 'old_string', oldText: 'old_string',
  original: 'old_string', original_string: 'old_string',
  new_text: 'new_string', newText: 'new_string',
  replacement: 'new_string', replacement_string: 'new_string',
  description: 'instruction', reason: 'instruction',
  change_description: 'instruction',
},

// P0: search_file_content — dir_path aliases (silent failure 방지)
search_file_content: {
  // (기존 pattern aliases 유지)
  path: 'dir_path', directory: 'dir_path',
  dirPath: 'dir_path', dir: 'dir_path',
},

// P0: glob — dir_path aliases
glob: {
  // (기존 pattern aliases 유지)
  path: 'dir_path', directory: 'dir_path',
  dirPath: 'dir_path', dir: 'dir_path',
},

// P1: 신규 도구
web_fetch: { url: 'prompt', input: 'prompt', request: 'prompt' },
read_many_files: {
  files: 'include', paths: 'include',
  file_paths: 'include', patterns: 'include',
  glob_patterns: 'include',
},
get_internal_docs: {
  file_path: 'path', filepath: 'path',
  filePath: 'path', doc_path: 'path',
},
```

### 미대상 도구 (위험 낮음)

| 도구             | 이유                                                 |
| ---------------- | ---------------------------------------------------- |
| `write_todos`    | `todos` — 의미적으로 명확, 대체 이름 가능성 낮음     |
| `save_memory`    | `fact` — 특수 의미, 혼동 가능성 낮음                 |
| `ask_user`       | `questions` — 명확, nested 구조는 AJV가 개별 검증    |
| `activate_skill` | `name` — 단일 필수 파라미터, 에러 메시지로 학습 용이 |

### 테스트 결과

```
✓ src/utils/tool-utils.test.ts (36 tests) — +15 신규

Test Files  284 passed (284)
      Tests  5557 passed | 24 skipped (5581)

TypeScript typecheck: 0 errors
ESLint: 0 warnings
```

### 커밋

| 해시      | 메시지                                                                   |
| --------- | ------------------------------------------------------------------------ |
| `d5b7da8` | `feat(utils): TOOL_PARAM_ALIASES 확장 — 미커버 도구 파라미터 alias 추가` |
