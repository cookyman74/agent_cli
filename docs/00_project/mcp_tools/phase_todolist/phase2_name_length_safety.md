# Phase 2: Qualified 도구 이름 길이/형식 안전성

> **목적**: `getFullyQualifiedName()` 결과가 항상 Gemini API 63자 제한 이내이고,
> 도구 이름 내 `__` 구분자가 포함되지 않도록 보장 **핵심 변경**:
> `generateValidName()`에서 `__` sanitize + `getFullyQualifiedName()`에서 최종
> 재-truncate **의존성**: Phase 1 완료 (등록 방식 확정 후 이름 생성 규칙 변경)
> **참고 설계**:
> [main_todolist_mcp_tools_20260219.md Issue #3](../main_todolist_mcp_tools_20260219.md)

---

## 2.1 사전 작업 (Pre-Work)

- [ ] **[PREV-REVIEW]** Phase 1 결과서 확인
  - 2-pass 등록 정상 동작 확인
  - `registerMCPTools()` 배치 등록 메서드 존재 확인

- [ ] **[ANALYSIS-1]** 현재 이름 생성 로직 분석
  - `mcp-tool.ts:445-456` (`generateValidName()`):
    - 특수문자 → `_` 치환: `/[^a-zA-Z0-9_.-]/g`
    - 63자 초과 시: `name.slice(0, 28) + '___' + name.slice(-32)` = 63자
    - **문제 1**: `__` (double underscore)를 sanitize하지 않음
    - **문제 2**: 서버 이름에 `__`가 포함될 수 있음 (현재 제약 없음)
  - `mcp-tool.ts:273-275` (`getFullyQualifiedName()`):
    - `${prefix}${generateValidName(toolName)}`
    - prefix = `${serverName}__`
    - **문제**: prefix 길이 + 63자 → 63자 초과 가능

- [ ] **[ANALYSIS-2]** 경계값 시나리오
  - 서버명 30자 + `__` (2자) + 도구명 63자 = 95자 → API 거부
  - 서버명 5자 + `__` (2자) + 도구명 63자 = 70자 → API 거부
  - 서버명 1자 + `__` (2자) + 도구명 60자 = 63자 → OK (경계)

- [ ] **[ANALYSIS-3]** `__` 구분자 보호 필요성 확인
  - `MCP_QUALIFIED_NAME_SEPARATOR` = `'__'` (`mcp-tool.ts`)
  - `tool-registry.ts:534`: `name.includes('__')` → FQN 검색 분기
  - `policy-engine.ts:312`: `!toolCall.name.includes('__')` → 2차 자격 게이트
  - 도구 이름에 `__` 포함 시 → unqualified 이름도 FQN으로 오판 → lookup 오류

- [ ] **[ANALYSIS-4]** 기존 테스트 베이스라인 기록
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/mcp-tool
  ```

---

## 2.2 `generateValidName()` `__` sanitize (TDD)

### 2.2.1 테스트 먼저 작성 (Red)

**파일**: `packages/core/src/tools/mcp-tool.test.ts`

```typescript
describe('generateValidName — __ sanitize', () => {
  it('should replace consecutive underscores with single underscore', () => {
    // 'my__tool' → 'my_tool'
    expect(generateValidName('my__tool')).toBe('my_tool');
  });

  it('should replace triple underscores with single underscore', () => {
    // 'my___tool' → 'my_tool'
    expect(generateValidName('my___tool')).toBe('my_tool');
  });

  it('should handle special chars followed by underscores', () => {
    // 'my-@-tool' → 'my___tool' (특수문자 치환 후) → 'my_tool' (__ 정리 후)
    expect(generateValidName('my-@-tool')).toBe('my___tool'); // 기존
    // → 변경 후: 'my_tool'
  });

  it('should not modify single underscores', () => {
    // 'my_tool' → 'my_tool' (변경 없음)
    expect(generateValidName('my_tool')).toBe('my_tool');
  });

  it('should handle leading/trailing underscores from sanitization', () => {
    // '__tool__' → '_tool_' (__ 정리)
  });
});
```

### 2.2.2 구현 (Green)

**파일**: `packages/core/src/tools/mcp-tool.ts`

```typescript
export function generateValidName(name: string) {
  // Step 1: Replace invalid characters with underscores
  let validToolname = name.replace(/[^a-zA-Z0-9_.-]/g, '_');

  // Step 2: Collapse consecutive underscores to single (protect __ separator)
  validToolname = validToolname.replace(/_{2,}/g, '_');

  // Step 3: Truncate if longer than 63 characters
  if (validToolname.length > 63) {
    validToolname =
      validToolname.slice(0, 28) + '___' + validToolname.slice(-32);
  }
  return validToolname;
}
```

> **주의**: Step 3의 truncation에서 `___`가 다시 도입되지만, 이는 의도적
> 구분자임. `getFullyQualifiedName()`의 `__`와 구별하기 위해 triple
> underscore(`___`) 사용. 다만 `tool-registry.ts:534`의 `includes('__')`에는
> 걸리므로, FQN 검색 분기 조건도 확인 필요.
>
> **대안**: truncation 구분자를 `___` 대신 `_X_` 등 비-underscore로 변경 검토.
> 이 결정은 구현 시 Phase 3 정책 엣지 케이스와 함께 확정.

---

## 2.3 `getFullyQualifiedName()` 재-truncate (TDD)

### 2.3.1 테스트 먼저 작성 (Red)

**파일**: `packages/core/src/tools/mcp-tool.test.ts`

```typescript
describe('getFullyQualifiedName — length safety', () => {
  it('should not exceed 63 characters for long server+tool names', () => {
    // serverName: 'very_long_server_name_12345' (26자)
    // toolName: 'equally_long_tool_name_that_exceeds_normal_limits_for_testing' (61자)
    // prefix: 26 + 2 = 28자
    // qualified: 28 + 63 = 91자 → 재-truncate 필요
    const tool = createMCPTool('very_long_server_name_12345', longToolName);
    expect(tool.getFullyQualifiedName().length).toBeLessThanOrEqual(63);
  });

  it('should preserve server prefix and separator in truncated name', () => {
    // 재-truncate 후에도 'serverName__' prefix가 유지되어야 lookup 가능
    const tool = createMCPTool('myserver', longToolName);
    const fqn = tool.getFullyQualifiedName();
    expect(fqn.startsWith('myserver__')).toBe(true);
    expect(fqn.length).toBeLessThanOrEqual(63);
  });

  it('should not truncate when total length is within limit', () => {
    // serverName: 'srv' (3자) + '__' (2자) + toolName: 'tool' (4자) = 9자 → 변경 없음
    const tool = createMCPTool('srv', 'tool');
    expect(tool.getFullyQualifiedName()).toBe('srv__tool');
  });

  it('should handle very long server name gracefully', () => {
    // serverName이 30자 이상 → prefix만으로 32자+ → tool 이름 공간 부족
    // → 최소 tool 이름 부분 10자 보장 (해시 포함)
    const tool = createMCPTool('a'.repeat(40), 'short_tool');
    const fqn = tool.getFullyQualifiedName();
    expect(fqn.length).toBeLessThanOrEqual(63);
  });
});
```

### 2.3.2 구현 (Green)

**파일**: `packages/core/src/tools/mcp-tool.ts`

```typescript
getFullyQualifiedName(): string {
  const prefix = this.getFullyQualifiedPrefix(); // 'serverName__'
  const toolName = generateValidName(this.serverToolName);
  const combined = `${prefix}${toolName}`;

  if (combined.length <= 63) {
    return combined;
  }

  // Re-truncate: preserve prefix + truncate tool name portion
  const maxToolNameLength = 63 - prefix.length;

  if (maxToolNameLength < 10) {
    // Server name too long — truncate server name portion too
    // Use hash to maintain uniqueness
    const hash = simpleHash(`${this.serverName}:${this.serverToolName}`);
    return combined.slice(0, 57) + hash.slice(0, 6);
  }

  // Truncate tool name: keep start + hash suffix for uniqueness
  const hash = simpleHash(toolName);
  return `${prefix}${toolName.slice(0, maxToolNameLength - 7)}_${hash.slice(0, 6)}`;
}
```

> **`simpleHash()` 설계**: 6자 hex hash (MD5/SHA 불필요, 문자열 해싱으로 충분)
> 충돌 확률: 16^6 = 16.7M 조합 → MCP 도구 수 대비 충분

---

## 2.4 검증

```bash
# 단위 테스트
npm test -w @didim365/agent-cli-core -- src/tools/mcp-tool

# Phase 1 회귀
npm test -w @didim365/agent-cli-core -- src/tools/tool-registry

# 전체 회귀
npm test -w @didim365/agent-cli-core

# 빌드 + 린트
npm run typecheck && npm run lint
```

---

## 완료 조건

| 검증 항목                                                   | 상태 |
| ----------------------------------------------------------- | ---- |
| `generateValidName()` `__` sanitize TDD — 5개 테스트        | ⬜   |
| `getFullyQualifiedName()` 63자 재-truncate TDD — 4개 테스트 | ⬜   |
| 긴 서버명 + 긴 도구명 경계값 테스트 통과                    | ⬜   |
| 기존 `generateValidName()` 테스트 회귀 없음                 | ⬜   |
| Phase 1 테스트 회귀 없음                                    | ⬜   |
| Core 전체 테스트 PASS                                       | ⬜   |
| 커밋 완료 + 작업 결과서 작성                                | ⬜   |

---

## 커밋 전략

1. **커밋 1**
   `test(tools): generateValidName __ sanitize + getFullyQualifiedName 길이 안전성 TDD`
   - mcp-tool.test.ts (9개 테스트)
2. **커밋 2**
   `fix(tools): MCP 도구 이름 길이/형식 안전성 — __ sanitize + 재-truncate`
   - mcp-tool.ts

---

## 다음 Phase 전달사항

- `__` sanitize로 인해 도구 이름에서 `__`가 불가능해짐 → Phase 3 정책 엣지
  케이스의 전제 조건 충족
- truncation 구분자 (`___` vs 대안)의 최종 결정을 Phase 3 착수 전에 확정
- `simpleHash()` 구현 방식 (내장 crypto vs 자체 구현) 결정 필요
