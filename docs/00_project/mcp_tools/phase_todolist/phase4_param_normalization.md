# Phase 4: MCP 도구 파라미터 schema-based 정규화

> **목적**: MCP 도구의 파라미터 schema를 분석하여 런타임 alias 추론 → non-Gemini
> LLM의 첫 호출 시 파라미터명 불일치 방지 **핵심 변경**: `tool-utils.ts`에
> `normalizeToolParamsBySchema()` 추가 + `scheduler.ts`에서 MCP 도구 호출 시
> 조건부 적용 **독립성**: Phase 1~3과 독립적 (이름 등록/정책과 무관) **참고
> 설계**:
> [main_todolist_mcp_tools_20260219.md Issue #4](../main_todolist_mcp_tools_20260219.md)

---

## 4.1 사전 작업 (Pre-Work)

- [ ] **[PREV-REVIEW]** Phase 3 결과서 확인 (또는 독립 착수 시 생략 가능)

- [ ] **[CONTEXT]** 작업 배경 확인
  - 선행 작업: `normalizeToolParams()` — 내장 도구 11개, 정적 alias map 50개
  - 한계: MCP 도구는 런타임 동적 디스커버리 → 컴파일 타임에 alias 정의 불가
  - 목표: MCP 도구의 `parameterSchema`에서 런타임으로 정규화 규칙 추론

- [ ] **[ANALYSIS-1]** MCP 도구 parameterSchema 구조 확인
  - `mcp-tool.ts`: `parameterSchema` 필드 — JSON Schema 형식
  - 접근: `DiscoveredMCPTool.parameterSchema` (public)
  - 구조 예시:
    ```json
    {
      "type": "object",
      "properties": {
        "file_path": { "type": "string", "description": "Path to the file" },
        "content": { "type": "string", "description": "File content" }
      },
      "required": ["file_path", "content"]
    }
    ```

- [ ] **[ANALYSIS-2]** non-Gemini LLM의 파라미터명 추측 패턴
  - 관찰된 패턴 (내장 도구 hotfix에서 확인):
    - `file_path` → `path`, `filePath`, `filepath`
    - `dir_path` → `path`, `directory`, `dirPath`
    - `pattern` → `query`, `search_query`
    - `old_string` → `old_text`, `oldText`
  - 일반화 가능한 변환 규칙:
    - snake_case → camelCase: `file_path` → `filePath`
    - 약어 치환: `file_path` → `path` (접미사만 사용)
    - 동의어: `query` ↔ `pattern` ↔ `search`

- [ ] **[ANALYSIS-3]** 정규화 적용 지점 확인
  - `scheduler.ts:244`: `normalizeToolParams()` 호출 지점
  - `coreToolScheduler.ts:488-492`: 레거시 경로 정규화 지점
  - 현재: `TOOL_PARAM_ALIASES[toolName]`에 없으면 그대로 반환
  - 목표: 없을 때 → schema-based 정규화 시도

- [ ] **[ANALYSIS-4]** 정규화 전략 결정

  **Option A: snake_case ↔ camelCase 변환만 (보수적)**
  - 장점: 높은 정확도, 오탐 최소화
  - 단점: `path` → `file_path` 같은 약어 변환 불가
  - 적용: `filePath` → schema에 `file_path` 있으면 매핑

  **Option B: 접미사 매칭 추가 (균형)**
  - 장점: `path` → `file_path` 매핑 가능 (가장 빈번한 패턴)
  - 단점: `path`가 `file_path`와 `dir_path` 모두에 매칭 → 모호성
  - 적용: required 필드 우선 + 정확 매칭 우선

  **Option C: 의미론적 매칭 (공격적)** — ❌ 과도한 복잡도

  **권장**: Option A 우선 구현 → Option B 선택적 추가

---

## 4.2 `normalizeToolParamsBySchema()` 구현 (TDD)

### 4.2.1 테스트 먼저 작성 (Red)

**파일**: `packages/core/src/utils/tool-utils.test.ts`

```typescript
describe('normalizeToolParamsBySchema', () => {
  const schema = {
    type: 'object',
    properties: {
      file_path: { type: 'string' },
      content: { type: 'string' },
      line_number: { type: 'number' },
    },
    required: ['file_path', 'content'],
  };

  // --- camelCase → snake_case 변환 ---

  it('should normalize camelCase to snake_case when schema property exists', () => {
    const args = { filePath: '/tmp/test.txt', content: 'hello' };
    const result = normalizeToolParamsBySchema(args, schema);
    expect(result).toEqual({ file_path: '/tmp/test.txt', content: 'hello' });
  });

  it('should not overwrite canonical param when it already exists', () => {
    const args = {
      file_path: '/correct.txt',
      filePath: '/wrong.txt',
      content: 'hello',
    };
    const result = normalizeToolParamsBySchema(args, schema);
    expect(result.file_path).toBe('/correct.txt');
  });

  it('should handle multiple camelCase conversions', () => {
    const args = { filePath: '/tmp/f.ts', lineNumber: 42, content: 'hello' };
    const result = normalizeToolParamsBySchema(args, schema);
    expect(result).toEqual({
      file_path: '/tmp/f.ts',
      line_number: 42,
      content: 'hello',
    });
  });

  it('should return args unchanged when all params match schema', () => {
    const args = { file_path: '/tmp/test.txt', content: 'hello' };
    const result = normalizeToolParamsBySchema(args, schema);
    expect(result).toEqual(args);
  });

  it('should return args unchanged when schema is undefined', () => {
    const args = { foo: 'bar' };
    const result = normalizeToolParamsBySchema(args, undefined);
    expect(result).toBe(args); // same reference
  });

  it('should not mutate original args', () => {
    const original = { filePath: '/tmp/test.txt', content: 'hello' };
    normalizeToolParamsBySchema(original, schema);
    expect(original).toEqual({ filePath: '/tmp/test.txt', content: 'hello' });
  });

  // --- 접미사 매칭 (Option B) ---

  it('should normalize suffix alias to required param (e.g., path → file_path)', () => {
    const args = { path: '/tmp/test.txt', content: 'hello' };
    const result = normalizeToolParamsBySchema(args, schema);
    expect(result).toEqual({ file_path: '/tmp/test.txt', content: 'hello' });
  });

  it('should prefer exact camelCase match over suffix match', () => {
    const args = {
      filePath: '/camel.txt',
      path: '/suffix.txt',
      content: 'hello',
    };
    const result = normalizeToolParamsBySchema(args, schema);
    expect(result.file_path).toBe('/camel.txt');
  });

  it('should not apply suffix match for optional params when ambiguous', () => {
    // schema has both dir_path and file_path → 'path' is ambiguous
    const ambiguousSchema = {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        dir_path: { type: 'string' },
      },
      required: ['file_path'],
    };
    const args = { path: '/tmp' };
    const result = normalizeToolParamsBySchema(args, ambiguousSchema);
    // 'path' matches file_path (required) → resolves ambiguity
    expect(result.file_path).toBe('/tmp');
  });

  it('should skip suffix match when ambiguous and no required resolution', () => {
    const ambiguousSchema = {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        dir_path: { type: 'string' },
      },
      required: [],
    };
    const args = { path: '/tmp' };
    const result = normalizeToolParamsBySchema(args, ambiguousSchema);
    // ambiguous, both optional → skip normalization
    expect(result).toEqual({ path: '/tmp' });
  });
});
```

### 4.2.2 구현 (Green)

**파일**: `packages/core/src/utils/tool-utils.ts`

```typescript
/**
 * Converts a camelCase string to snake_case.
 * e.g., 'filePath' → 'file_path', 'lineNumber' → 'line_number'
 */
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Extracts the suffix of a snake_case parameter name.
 * e.g., 'file_path' → 'path', 'dir_path' → 'path', 'line_number' → 'number'
 */
function getSuffix(snakeCaseName: string): string {
  const parts = snakeCaseName.split('_');
  return parts[parts.length - 1];
}

/**
 * Schema-based parameter normalization for MCP tools.
 *
 * Strategy (priority order):
 * 1. Exact match: arg name exists in schema → no change
 * 2. camelCase→snake_case: arg 'filePath' → schema 'file_path' → rename
 * 3. Suffix match: arg 'path' → schema 'file_path' (required param preferred)
 *
 * Rules:
 * - Canonical param already exists → no aliasing (protects correct calls)
 * - Original args never mutated (shallow copy)
 * - Ambiguous suffix matches skipped unless required param resolves it
 */
export function normalizeToolParamsBySchema(
  args: Record<string, unknown>,
  schema: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!schema) return args;

  const properties = (schema as { properties?: Record<string, unknown> })
    .properties;
  if (!properties) return args;

  const schemaKeys = new Set(Object.keys(properties));
  const requiredKeys = new Set(
    (schema as { required?: string[] }).required ?? [],
  );

  // Check if any normalization is needed
  const argKeys = Object.keys(args);
  const unknownKeys = argKeys.filter((k) => !schemaKeys.has(k));
  if (unknownKeys.length === 0) return args;

  const normalized = { ...args };

  for (const argKey of unknownKeys) {
    if (normalized[argKey] === undefined) continue;

    // Strategy 1: camelCase → snake_case exact match
    const snakeKey = toSnakeCase(argKey);
    if (
      snakeKey !== argKey &&
      schemaKeys.has(snakeKey) &&
      normalized[snakeKey] === undefined
    ) {
      normalized[snakeKey] = normalized[argKey];
      delete normalized[argKey];
      continue;
    }

    // Strategy 2: Suffix match (e.g., 'path' → 'file_path')
    const suffix = argKey; // The arg key itself is the suffix
    const candidates = [...schemaKeys].filter(
      (sk) => sk !== argKey && sk.endsWith(`_${suffix}`),
    );

    if (candidates.length === 1 && normalized[candidates[0]] === undefined) {
      // Unambiguous suffix match
      normalized[candidates[0]] = normalized[argKey];
      delete normalized[argKey];
    } else if (candidates.length > 1) {
      // Ambiguous — prefer required param
      const requiredCandidate = candidates.find((c) => requiredKeys.has(c));
      if (requiredCandidate && normalized[requiredCandidate] === undefined) {
        normalized[requiredCandidate] = normalized[argKey];
        delete normalized[argKey];
      }
      // else: skip (ambiguous, no required resolution)
    }
  }

  return normalized;
}
```

### 4.2.3 Scheduler 연결

**파일**: `packages/core/src/scheduler/scheduler.ts`

```typescript
import {
  normalizeToolParams,
  normalizeToolParamsBySchema,
} from '../utils/tool-utils.js';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';

// _schedule() 내 enrichedRequest 구성 시:
let normalizedArgs = normalizeToolParams(request.name, request.args);

// MCP 도구인 경우 schema-based 정규화 추가 적용
const tool = this.toolRegistry.getTool(request.name);
if (tool instanceof DiscoveredMCPTool && normalizedArgs === request.args) {
  // normalizeToolParams가 변경하지 않은 경우에만 schema-based 시도
  normalizedArgs = normalizeToolParamsBySchema(
    normalizedArgs,
    tool.parameterSchema,
  );
}

const enrichedRequest: ToolCallRequestInfo = {
  ...request,
  args: normalizedArgs,
  // ...
};
```

**파일**: `packages/core/src/core/coreToolScheduler.ts`

```typescript
// 동일 패턴으로 레거시 경로에도 적용
```

---

## 4.3 검증

```bash
# 단위 테스트
npm test -w @didim365/agent-cli-core -- src/utils/tool-utils

# Scheduler 회귀
npm test -w @didim365/agent-cli-core -- src/scheduler/scheduler
npm test -w @didim365/agent-cli-core -- src/core/coreToolScheduler

# 전체 회귀
npm test -w @didim365/agent-cli-core

# 빌드 + 린트
npm run typecheck && npm run lint
```

---

## 완료 조건

| 검증 항목                                                             | 상태 |
| --------------------------------------------------------------------- | ---- |
| `normalizeToolParamsBySchema()` camelCase→snake_case TDD — 6개 테스트 | ⬜   |
| 접미사 매칭 TDD — 4개 테스트 (모호성 처리 포함)                       | ⬜   |
| 원본 args 불변 확인                                                   | ⬜   |
| scheduler.ts MCP 도구 조건부 적용                                     | ⬜   |
| coreToolScheduler.ts 레거시 경로 적용                                 | ⬜   |
| 기존 `normalizeToolParams()` (내장 도구) 동작 회귀 없음               | ⬜   |
| scheduler/coreToolScheduler 기존 테스트 회귀 없음                     | ⬜   |
| Core 전체 테스트 PASS                                                 | ⬜   |
| 커밋 완료 + 최종 작업 결과서 작성                                     | ⬜   |

---

## 커밋 전략

1. **커밋 1**
   `test(utils): normalizeToolParamsBySchema TDD — schema-based 파라미터 정규화`
   - tool-utils.test.ts (10개 테스트)
2. **커밋 2** `feat(utils): MCP 도구 schema-based 파라미터 정규화 구현`
   - tool-utils.ts
3. **커밋 3**
   `fix(scheduler): MCP 도구 호출 시 schema-based 파라미터 정규화 적용`
   - scheduler.ts + coreToolScheduler.ts

---

## 설계 결정 사항

### 내장 도구 alias vs schema-based 정규화 우선순위

```
LLM 호출 → args
  ├─ normalizeToolParams() (내장 도구 정적 alias) → 1차 시도
  │   └─ 변경 발생 → 완료
  └─ normalizeToolParamsBySchema() (MCP 도구 동적) → 2차 시도
      └─ schema 기반 camelCase + suffix 매칭
```

- 내장 도구: 정적 alias가 더 정확 (관찰 기반) → 우선
- MCP 도구: schema-based가 유일한 방법 → 내장 alias 미적용 시에만 시도
- `normalizeToolParams()`가 args를 변경하지 않은 경우(`=== args`)에만
  schema-based 시도

### 성능 고려

- schema 파싱: 도구 호출마다 `Object.keys()` 1회 → O(n), n = schema 속성 수
  (보통 <20)
- camelCase 변환: 문자열 replace 1회
- 접미사 매칭: schema 속성 배열 filter 1회
- 전체: O(m \* n), m = unknown args, n = schema keys → 무시 가능

### 향후 확장

- 동의어 사전 (`query` ↔ `pattern` ↔ `search`): 별도 매핑 테이블로 추가 가능
- LLM별 패턴 학습: 프로바이더별 흔한 alias 패턴 누적 → 정적 alias와 유사한
  메커니즘
- MCP 서버별 커스텀 alias: 설정 파일에서 서버별 alias 정의 가능
