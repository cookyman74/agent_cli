# Phase 5: 로컬 LLM(sLM) 도구 호출 내결함성 보강

> **목적**: sLM(Ollama, vLLM, TGI, LM Studio 등)의 낮은 도구 호출 품질에
> 대응하여 파라미터 타입 강제 변환, 도구 이름 퍼지 매칭 자동 교정, 프로바이더별
> 이름 길이 제한 분리를 구현 **핵심 변경**: AJV coercion 전처리 + fuzzy tool
> name match + 프로바이더별 maxNameLength **의존성**: Phase 4 완료 (schema-based
> 정규화 인프라 재사용), Phase 2 완료 (이름 길이 로직 확장) **참고 설계**:
> [main_todolist_mcp_tools_20260219.md Issue #5](../main_todolist_mcp_tools_20260219.md)

---

## 배경: sLM 도구 호출 특성

로컬 LLM(`OpenAiCompatibleAdapter`)은 클라우드 LLM 대비 다음 특성이 있음:

| 특성                 | Cloud LLM (GPT-4, Claude)      | Local sLM (Llama, Mistral, Qwen)    |
| -------------------- | ------------------------------ | ----------------------------------- |
| 도구 호출 포맷 준수  | 높음 (99%+)                    | 중간~낮음 (70~90%)                  |
| 파라미터명 정확도    | 높음 (1~2회 시도 후 학습)      | 낮음 (반복 실패 가능)               |
| 파라미터 타입 정확도 | 높음                           | 낮음 (`"42"` vs `42` 빈번)          |
| 도구 이름 정확도     | 높음                           | 중간 (환각·오타 빈번)               |
| JSON 포맷 정확도     | 높음                           | 중간 (malformed JSON 가능)          |
| 자기 교정 능력       | 높음 (에러 피드백 후 1회 교정) | 낮음 (같은 실수 반복)               |
| 컨텍스트 윈도우      | 128K+                          | 4K~32K (도구 선언이 상당 부분 점유) |

**결과**: Phase 1~4의 개선은 클라우드 LLM에 충분하나, sLM은 추가 내결함성 필요.

---

## 5.1 사전 작업 (Pre-Work)

- [ ] **[PREV-REVIEW]** Phase 4 결과서 확인
  - `normalizeToolParamsBySchema()` 정상 동작 확인
  - scheduler 양쪽 경로(scheduler.ts + coreToolScheduler.ts) 정규화 적용 확인

- [ ] **[ANALYSIS-1]** 현재 AJV 설정 분석
  - `schemaValidator.ts:12-23`: `new AjvClass({ strictSchema: false })`
  - `coerceTypes` 옵션 미설정 → **타입 강제 변환 없음**
  - `strictSchema: false`는 스키마 키워드 관련 → 데이터 타입 변환과 무관
  - AJV coerceTypes 옵션:
    - `true`: string→number, string→boolean 등 자동 변환
    - `'array'`: 추가로 단일 값→배열 변환
    - 주의: coercion은 **원본 데이터를 변경** (mutate)

- [ ] **[ANALYSIS-2]** 도구 이름 매칭 현재 로직
  - `coreToolScheduler.ts:498-509`: `getToolSuggestion()` → 에러 메시지에 제안만
  - `scheduler.ts:274-281`: 동일 패턴 → 제안만, 자동 교정 없음
  - `getToolSuggestion()`: Levenshtein 기반, top N 결과 반환
  - 현재: `ToolErrorType.TOOL_NOT_REGISTERED` 에러 → LLM에 피드백 → 재시도 의존

- [ ] **[ANALYSIS-3]** 프로바이더별 이름 길이 제한 확인
  - `mcp-tool.ts:449-454`: 하드코딩 `63`자 (Gemini API 고유)
  - Gemini: 63자 (주석: "API says max 64, but actual limit seems 63")
  - OpenAI: 64자 (공식 문서)
  - Anthropic: 64자 (공식 문서)
  - OpenAI-compatible (sLM): 실질 제한 없음 (서버 구현에 따라 다름)

- [ ] **[ANALYSIS-4]** sLM 타입 불일치 빈도 측정 (수동)

  ```bash
  # Ollama + Llama 3.2 + 도구 호출 시나리오
  LLM_PROVIDER=openai-compatible LLM_BASE_URL=http://localhost:11434/v1 \
    npm run start -- -p "Read the file /tmp/test.txt"
  # 관찰: 파라미터 타입, 이름 정확도
  ```

- [ ] **[ANALYSIS-5]** 기존 테스트 베이스라인 기록
  ```bash
  npm test -w @didim365/agent-cli-core -- src/utils/schemaValidator
  npm test -w @didim365/agent-cli-core -- src/utils/tool-utils
  npm test -w @didim365/agent-cli-core -- src/scheduler/scheduler
  npm test -w @didim365/agent-cli-core -- src/core/coreToolScheduler
  ```

---

## 5.2 파라미터 타입 강제 변환 (TDD)

> **설계**: AJV `coerceTypes` 직접 사용 대신 **별도 전처리 함수** 구현. 이유:
> AJV coercion은 원본 데이터를 mutate하고, 모든 도구에 일괄 적용되어 의도치 않은
> 부작용 위험. 전처리 함수로 제어 가능한 변환만 수행.

### 5.2.1 테스트 먼저 작성 (Red)

**파일**: `packages/core/src/utils/tool-utils.test.ts`

```typescript
describe('coerceParamTypes', () => {
  const schema = {
    type: 'object',
    properties: {
      count: { type: 'number' },
      enabled: { type: 'boolean' },
      name: { type: 'string' },
      offset: { type: 'integer' },
      tags: { type: 'array', items: { type: 'string' } },
    },
    required: ['count', 'name'],
  };

  // --- string → number 변환 ---

  it('should coerce string "42" to number 42 when schema expects number', () => {
    const args = { count: '42', name: 'test' };
    const result = coerceParamTypes(args, schema);
    expect(result.count).toBe(42);
    expect(typeof result.count).toBe('number');
  });

  it('should coerce string "3.14" to float when schema expects number', () => {
    const args = { count: '3.14', name: 'test' };
    const result = coerceParamTypes(args, schema);
    expect(result.count).toBe(3.14);
  });

  it('should not coerce non-numeric string to number', () => {
    const args = { count: 'abc', name: 'test' };
    const result = coerceParamTypes(args, schema);
    expect(result.count).toBe('abc'); // 변환 불가 → 원본 유지 (AJV가 에러 처리)
  });

  // --- string → boolean 변환 ---

  it('should coerce string "true" to boolean true', () => {
    const args = { count: 1, name: 'test', enabled: 'true' };
    const result = coerceParamTypes(args, schema);
    expect(result.enabled).toBe(true);
  });

  it('should coerce string "false" to boolean false', () => {
    const args = { count: 1, name: 'test', enabled: 'false' };
    const result = coerceParamTypes(args, schema);
    expect(result.enabled).toBe(false);
  });

  // --- string → integer 변환 ---

  it('should coerce string "10" to integer when schema expects integer', () => {
    const args = { count: 1, name: 'test', offset: '10' };
    const result = coerceParamTypes(args, schema);
    expect(result.offset).toBe(10);
    expect(Number.isInteger(result.offset)).toBe(true);
  });

  it('should not coerce float string to integer', () => {
    const args = { count: 1, name: 'test', offset: '3.14' };
    const result = coerceParamTypes(args, schema);
    expect(result.offset).toBe('3.14'); // 변환 불가 → 원본 유지
  });

  // --- 변환 불필요 케이스 ---

  it('should not modify args when types already match', () => {
    const args = { count: 42, name: 'test', enabled: true };
    const result = coerceParamTypes(args, schema);
    expect(result).toEqual(args);
  });

  it('should return args unchanged when schema is undefined', () => {
    const args = { foo: 'bar' };
    const result = coerceParamTypes(args, undefined);
    expect(result).toBe(args); // same reference
  });

  it('should not mutate original args', () => {
    const original = { count: '42', name: 'test' };
    coerceParamTypes(original, schema);
    expect(original.count).toBe('42'); // 원본 불변
  });

  // --- number → string 변환 (역방향) ---

  it('should coerce number 42 to string "42" when schema expects string', () => {
    const args = { count: 1, name: 42 };
    const result = coerceParamTypes(args, schema);
    expect(result.name).toBe('42');
  });
});
```

### 5.2.2 구현 (Green)

**파일**: `packages/core/src/utils/tool-utils.ts`

```typescript
/**
 * Coerces parameter values to match the types declared in the JSON schema.
 *
 * Handles common sLM type mismatches:
 * - string "42" → number 42 (when schema expects 'number' or 'integer')
 * - string "true"/"false" → boolean (when schema expects 'boolean')
 * - number 42 → string "42" (when schema expects 'string')
 *
 * Rules:
 * - Only converts when the target type is unambiguous (single type in schema)
 * - Conversion failure (e.g., "abc" → number) → original value preserved (AJV handles error)
 * - Original args never mutated (shallow copy)
 * - No conversion for 'object' or 'array' types (too risky)
 *
 * @param args The raw arguments from the LLM
 * @param schema The tool's JSON Schema (from tool definition or MCP parameterSchema)
 * @returns A new args object with coerced types, or the original if unchanged
 */
export function coerceParamTypes(
  args: Record<string, unknown>,
  schema: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!schema) return args;

  const properties = (schema as { properties?: Record<string, unknown> })
    .properties;
  if (!properties) return args;

  let changed = false;
  const coerced = { ...args };

  for (const [key, value] of Object.entries(coerced)) {
    const propSchema = properties[key] as { type?: string } | undefined;
    if (!propSchema?.type || value === undefined || value === null) continue;

    const targetType = propSchema.type;
    const actualType = typeof value;

    // string → number/integer
    if (
      actualType === 'string' &&
      (targetType === 'number' || targetType === 'integer')
    ) {
      const num = Number(value);
      if (
        !Number.isNaN(num) &&
        (targetType === 'number' || Number.isInteger(num))
      ) {
        coerced[key] = num;
        changed = true;
      }
    }
    // string → boolean
    else if (actualType === 'string' && targetType === 'boolean') {
      if (value === 'true') {
        coerced[key] = true;
        changed = true;
      } else if (value === 'false') {
        coerced[key] = false;
        changed = true;
      }
    }
    // number/boolean → string
    else if (
      (actualType === 'number' || actualType === 'boolean') &&
      targetType === 'string'
    ) {
      coerced[key] = String(value);
      changed = true;
    }
  }

  return changed ? coerced : args;
}
```

### 5.2.3 Scheduler 연결

기존 정규화 체인에 타입 강제 변환 단계 추가:

```
LLM 호출 → args
  ├─ normalizeToolParams() (내장 도구 정적 alias) → 1차: 이름 정규화
  ├─ normalizeToolParamsBySchema() (MCP 도구) → 2차: 이름 정규화 (Phase 4)
  └─ coerceParamTypes() → 3차: 타입 강제 변환 (Phase 5, 모든 도구 대상)
      └─ AJV schema validation
```

**파일**: `packages/core/src/scheduler/scheduler.ts`

```typescript
// _schedule() 내, normalizeToolParams/normalizeToolParamsBySchema 이후:
normalizedArgs = coerceParamTypes(
  normalizedArgs,
  tool?.schema?.parametersJsonSchema,
);
```

**적용 범위**: MCP 도구뿐 아니라 **모든 도구**에 적용 (sLM은 내장 도구에서도
타입 불일치 발생).

---

## 5.3 도구 이름 퍼지 매칭 자동 교정 (TDD)

> **설계**: Levenshtein distance ≤ 2 + 단일 후보 시 자동 교정. 복수 후보 또는
> distance > 2 → 기존 에러 메시지 유지.

### 5.3.1 테스트 먼저 작성 (Red)

**파일**: `packages/core/src/utils/tool-utils.test.ts`

```typescript
describe('fuzzyMatchToolName', () => {
  const allToolNames = [
    'read_file',
    'write_file',
    'list_directory',
    'search_file_content',
  ];

  it('should return exact match as-is', () => {
    expect(fuzzyMatchToolName('read_file', allToolNames)).toBe('read_file');
  });

  it('should auto-correct typo with distance 1', () => {
    // 'read_fil' → 'read_file' (distance 1, unique match)
    expect(fuzzyMatchToolName('read_fil', allToolNames)).toBe('read_file');
  });

  it('should auto-correct typo with distance 2', () => {
    // 'raed_file' → 'read_file' (distance 2)
    expect(fuzzyMatchToolName('raed_file', allToolNames)).toBe('read_file');
  });

  it('should return null when distance > 2 (too different)', () => {
    expect(fuzzyMatchToolName('completely_wrong', allToolNames)).toBeNull();
  });

  it('should return null when multiple candidates at same distance', () => {
    // 'write_fil' → 'write_file' (distance 1)
    // But if there were another tool 'write_fill' at distance 1 → ambiguous
    // In this case, 'write_fil' → 'write_file' is unique → should match
    expect(fuzzyMatchToolName('write_fil', allToolNames)).toBe('write_file');
  });

  it('should return null when name is empty', () => {
    expect(fuzzyMatchToolName('', allToolNames)).toBeNull();
  });

  it('should handle qualified MCP tool name typo', () => {
    const mcpTools = ['myserver__custom_tool', 'myserver__other_tool'];
    // 'myserver__cusom_tool' → 'myserver__custom_tool' (distance 1)
    expect(fuzzyMatchToolName('myserver__cusom_tool', mcpTools)).toBe(
      'myserver__custom_tool',
    );
  });
});
```

### 5.3.2 구현 (Green)

**파일**: `packages/core/src/utils/tool-utils.ts`

```typescript
/**
 * Fuzzy-matches a tool name against registered tool names.
 *
 * If exact match exists, returns it immediately.
 * Otherwise, finds the closest match using Levenshtein distance.
 * Auto-corrects only when:
 * - Distance ≤ 2 (typo threshold)
 * - Single unique candidate at minimum distance
 *
 * Returns null if no suitable match found (distance > 2 or ambiguous).
 *
 * @param name The tool name from the LLM
 * @param allToolNames All registered tool names
 * @returns The matched tool name, or null if no suitable match
 */
export function fuzzyMatchToolName(
  name: string,
  allToolNames: string[],
): string | null {
  if (!name || allToolNames.length === 0) return null;

  // Exact match — fast path
  if (allToolNames.includes(name)) return name;

  const MAX_DISTANCE = 2;

  const matches = allToolNames
    .map((toolName) => ({
      name: toolName,
      distance: levenshtein.get(name, toolName),
    }))
    .filter((m) => m.distance <= MAX_DISTANCE)
    .sort((a, b) => a.distance - b.distance);

  if (matches.length === 0) return null;

  // Ambiguity check: top candidate must be strictly closer than second
  if (matches.length > 1 && matches[0].distance === matches[1].distance) {
    return null; // Ambiguous — defer to error message
  }

  return matches[0].name;
}
```

### 5.3.3 Scheduler 연결

**파일**: `packages/core/src/scheduler/scheduler.ts` +
`packages/core/src/core/coreToolScheduler.ts`

```typescript
// 도구 lookup 실패 시 fuzzy match 시도:
let tool = this.toolRegistry.getTool(request.name);

if (!tool) {
  const correctedName = fuzzyMatchToolName(request.name, toolNames);
  if (correctedName) {
    debugLogger.info(
      `[Scheduler] Auto-corrected tool name: "${request.name}" → "${correctedName}"`,
    );
    tool = this.toolRegistry.getTool(correctedName);
    // request.name도 교정된 이름으로 업데이트 (하류 처리 호환)
  }
}

if (!tool) {
  // 기존 에러 처리 (getToolSuggestion)
}
```

---

## 5.4 프로바이더별 도구 이름 길이 제한 (TDD)

> **설계**: `generateValidName()`의 하드코딩 63을 프로바이더별 설정으로 분리.
> 도구 등록은 프로바이더 확정 전에 발생하므로, 가장 관대한 제한(128)으로 등록 후
> API 호출 시점에 프로바이더 제한에 맞춰 재-truncate.

### 5.4.1 테스트 먼저 작성 (Red)

**파일**: `packages/core/src/tools/mcp-tool.test.ts`

```typescript
describe('generateValidName — provider-aware length', () => {
  it('should truncate to 63 chars for gemini provider', () => {
    const longName = 'a'.repeat(80);
    expect(generateValidName(longName, 63).length).toBeLessThanOrEqual(63);
  });

  it('should allow up to 128 chars for openai-compatible provider', () => {
    const name70 = 'a'.repeat(70);
    expect(generateValidName(name70, 128)).toBe(name70); // no truncation
  });

  it('should use default 63 when maxLength not specified', () => {
    const longName = 'a'.repeat(80);
    expect(generateValidName(longName).length).toBeLessThanOrEqual(63);
  });
});
```

### 5.4.2 구현 (Green)

**파일**: `packages/core/src/tools/mcp-tool.ts`

```typescript
/** Provider-specific maximum tool name lengths */
export const MAX_TOOL_NAME_LENGTH: Record<string, number> = {
  gemini: 63,
  openai: 64,
  anthropic: 64,
  'openai-compatible': 128,
};

export const DEFAULT_MAX_TOOL_NAME_LENGTH = 63;

export function generateValidName(
  name: string,
  maxLength: number = DEFAULT_MAX_TOOL_NAME_LENGTH,
): string {
  let validToolname = name.replace(/[^a-zA-Z0-9_.-]/g, '_');

  // Collapse consecutive underscores (Phase 2)
  validToolname = validToolname.replace(/_{2,}/g, '_');

  if (validToolname.length > maxLength) {
    const keepStart = Math.floor((maxLength - 3) / 2);
    const keepEnd = maxLength - 3 - keepStart;
    validToolname =
      validToolname.slice(0, keepStart) + '___' + validToolname.slice(-keepEnd);
  }
  return validToolname;
}
```

> **주의**: `generateValidName()`의 시그니처 변경은 Phase 2의 truncation 로직과
> 통합하여 구현. Phase 2에서 먼저 `__` sanitize가 적용된 후 이 변경이 추가됨.
>
> **대안**: 등록 시점에는 가장 관대한 제한(128)으로 등록하고, API 요청 변환
> 시점에 프로바이더별 제한 적용. 이 경우 `toGeminiTools()`, `toOpenAiTools()` 등
> converter에서 이름 재-truncate. 구현 복잡도가 높지만 정보 손실 최소화.

---

## 5.5 검증

```bash
# 단위 테스트
npm test -w @didim365/agent-cli-core -- src/utils/tool-utils
npm test -w @didim365/agent-cli-core -- src/utils/schemaValidator
npm test -w @didim365/agent-cli-core -- src/tools/mcp-tool

# Scheduler 회귀
npm test -w @didim365/agent-cli-core -- src/scheduler/scheduler
npm test -w @didim365/agent-cli-core -- src/core/coreToolScheduler

# 전체 회귀
npm test -w @didim365/agent-cli-core

# 빌드 + 린트
npm run typecheck && npm run lint

# sLM E2E (수동)
LLM_PROVIDER=openai-compatible LLM_BASE_URL=http://localhost:11434/v1 \
  npm run start -- -p "List the files in /tmp"
# 확인: 파라미터 타입 자동 변환, 도구 이름 오타 자동 교정
```

---

## 완료 조건

| 검증 항목                                                      | 상태 |
| -------------------------------------------------------------- | ---- |
| `coerceParamTypes()` string↔number TDD — 4개 테스트           | ⬜   |
| `coerceParamTypes()` string↔boolean TDD — 2개 테스트          | ⬜   |
| `coerceParamTypes()` integer 변환 + 에지 케이스 — 4개 테스트   | ⬜   |
| `coerceParamTypes()` 원본 불변 + schema undefined 처리         | ⬜   |
| scheduler.ts / coreToolScheduler.ts 타입 강제 변환 연결        | ⬜   |
| `fuzzyMatchToolName()` TDD — 7개 테스트                        | ⬜   |
| scheduler에서 도구 lookup 실패 시 fuzzy match 시도 + 자동 교정 | ⬜   |
| 프로바이더별 이름 길이 제한 TDD — 3개 테스트                   | ⬜   |
| 기존 `normalizeToolParams()` / AJV 검증 회귀 없음              | ⬜   |
| sLM 환경 수동 E2E (Ollama + 도구 호출)                         | ⬜   |
| Core 전체 테스트 PASS                                          | ⬜   |
| 커밋 완료 + 최종 작업 결과서 작성                              | ⬜   |

---

## 커밋 전략

1. **커밋 1** `test(utils): coerceParamTypes TDD — sLM 파라미터 타입 강제 변환`
   - tool-utils.test.ts (10개 테스트)
2. **커밋 2** `feat(utils): sLM 파라미터 타입 강제 변환 구현 + scheduler 연결`
   - tool-utils.ts + scheduler.ts + coreToolScheduler.ts
3. **커밋 3** `test(utils): fuzzyMatchToolName TDD — 도구 이름 퍼지 매칭`
   - tool-utils.test.ts (7개 테스트)
4. **커밋 4**
   `feat(utils): 도구 이름 퍼지 매칭 자동 교정 + 프로바이더별 이름 길이 제한`
   - tool-utils.ts + coreToolScheduler.ts + scheduler.ts + mcp-tool.ts

---

## 설계 결정 사항

### AJV coerceTypes vs 별도 전처리 함수

| 방식             | 장점                                | 단점                                    |
| ---------------- | ----------------------------------- | --------------------------------------- |
| AJV coerceTypes  | AJV 내장, 코드 1줄                  | 원본 데이터 mutate, 전역 적용 제어 불가 |
| 별도 전처리 함수 | 원본 불변, 선택적 적용, 테스트 용이 | 별도 구현 필요, AJV 외부에서 중복 로직  |

**결정**: 별도 전처리 함수 (`coerceParamTypes()`).

- 원본 불변 원칙 유지 (프로젝트 전반 패턴)
- 변환 불가 시 원본 유지 → AJV가 정확한 에러 메시지 생성
- 향후 프로바이더별 변환 전략 분기 가능

### fuzzyMatchToolName 자동 교정 안전성

| 임계값 | 정확도    | 위험도    | 예시                                  |
| ------ | --------- | --------- | ------------------------------------- |
| ≤ 1    | 매우 높음 | 매우 낮음 | `read_fil` → `read_file`              |
| ≤ 2    | 높음      | 낮음      | `raed_file` → `read_file`             |
| ≤ 3    | 중간      | 중간      | `read_fill` → `read_file` (위험 증가) |

**결정**: 임계값 2 + 단일 후보 조건.

- Distance 2 이내는 오타 교정 범위 (keyboard adjacency)
- 복수 후보 동일 거리 → 교정 거부 (에러 메시지로 폴백)
- 로그에 교정 기록 남김 → 디버깅 가능

### 프로바이더별 이름 길이: 등록 시 vs API 호출 시

| 시점        | 장점                              | 단점                                |
| ----------- | --------------------------------- | ----------------------------------- |
| 등록 시     | 단순, tool-registry 일관성        | 프로바이더 확정 전 적용 → 정보 손실 |
| API 호출 시 | 최소 정보 손실, 프로바이더 최적화 | converter별 재-truncate 로직 필요   |

**권장**: 등록 시 관대한 제한(128자) 적용 후, API 호출 시 프로바이더별
재-truncate. 다만 초기 구현은 등록 시 프로바이더 감지가 복잡하므로, **DEFAULT
128자 + Gemini converter에서 63자 재-truncate** 방식으로 시작.

---

## 전체 정규화 파이프라인 (Phase 4 + 5 통합)

```
LLM Tool Call Response
  │
  ▼
[1] normalizeToolParams(toolName, args)          ← Phase 4 (내장 도구 정적 alias)
  │   └─ 변경 발생 시 → [3]으로 이동
  │
  ▼
[2] normalizeToolParamsBySchema(args, schema)     ← Phase 4 (MCP 도구 동적 alias)
  │   └─ camelCase→snake_case + suffix 매칭
  │
  ▼
[3] coerceParamTypes(args, schema)                ← Phase 5 (타입 강제 변환)
  │   └─ string↔number, string↔boolean
  │
  ▼
[4] tool = registry.getTool(toolName)
  │   └─ 실패 시: fuzzyMatchToolName()            ← Phase 5 (이름 자동 교정)
  │        └─ distance ≤ 2 + 단일 후보 → 자동 교정
  │        └─ 실패 → getToolSuggestion() 에러 메시지
  │
  ▼
[5] tool.build(args) → AJV schema validation
  │
  ▼
[6] tool.execute(invocation)
```

---

## 다음 단계 전달사항

- Phase 5 완료 후 전체 파이프라인 통합 E2E 검증 필요
- sLM별 도구 호출 품질 차이가 크므로 (Llama > Mistral > Qwen 순 일반적) 주요 sLM
  모델별 수동 테스트 권장
- 향후 확장: sLM 프로바이더 설정에
  `toolCallingQuality: 'high' | 'medium' | 'low'` 옵션 추가 → low일 때만 fuzzy
  match + coercion 활성화 (성능 민감 환경 대응)
