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
