# Phase 1: 결정적 MCP 도구 이름 등록

> **목적**: MCP 서버 디스커버리 순서와 무관하게, 동일 이름 도구가 항상 동일한
> 방식으로 등록되도록 보장 **핵심 변경**: `tool-registry.ts`에 2-pass 일괄 등록
> 메서드 도입 → 충돌 도구는 모두 qualified name 강제 **참고 설계**:
> [main_todolist_mcp_tools_20260219.md Issue #2](../main_todolist_mcp_tools_20260219.md)

---

## 1.1 사전 작업 (Pre-Work)

- [ ] **[CONTEXT]** 작업 목적 및 배경 확인
  - 현상: `Promise.all()`로 MCP 서버 병렬 디스커버리 → 서버 등록 순서 비결정적
  - 영향: 동일 이름 도구가 세션마다 다른 이름(unqualified vs qualified)으로 등록

- [ ] **[ANALYSIS-1]** 현재 등록 흐름 분석
  - `mcp-client-manager.ts:323`: `Promise.all()` → `maybeDiscoverMcpServer()`
    병렬 호출
  - `maybeDiscoverMcpServer()` 내부: 도구 발견 시 `toolRegistry.registerTool()`
    개별 호출
  - `tool-registry.ts:214-226`: `registerTool()` — 이름 충돌 시 MCP 도구만
    qualified name 전환

- [ ] **[ANALYSIS-2]** 충돌 시나리오 구체화
  - 시나리오 A: 서버 A, B가 모두 `read_file` 도구 제공 → A 먼저 등록되면 A는
    `read_file`, B는 `serverB__read_file`
  - 시나리오 B: B 먼저 등록되면 B는 `read_file`, A는 `serverA__read_file` —
    비결정적
  - 시나리오 C: 내장 도구 `read_file`이 이미 등록된 상태에서 MCP `read_file`
    등록 → MCP만 qualified

- [ ] **[ANALYSIS-3]** `getTool()` lookup 경로 확인
  - `tool-registry.ts:532-549`: 직접 lookup 실패 시 `__` 포함 이름으로 FQN 검색
  - 현재: LLM이 unqualified 이름으로 호출하면 직접 lookup → 등록된 쪽만 발견
  - 비결정성에 의해 어느 서버의 도구가 발견되는지 달라짐

- [ ] **[ANALYSIS-4]** 기존 테스트 베이스라인 기록
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/tool-registry
  npm test -w @didim365/agent-cli-core -- src/tools/mcp-tool
  npm test -w @didim365/agent-cli-core -- src/tools/mcp-client-manager
  ```

---

## 1.2 2-pass 일괄 등록 메서드 (TDD)

> **설계**: 디스커버리 완료 후 충돌을 감지하여 일괄 처리

### 1.2.1 테스트 먼저 작성 (Red)

**파일**: `packages/core/src/tools/tool-registry.test.ts`

```typescript
describe('registerMCPTools (batch)', () => {
  it('should register single-server tools with unqualified names', () => {
    // 서버 A만 read_file 제공 → unqualified 'read_file'로 등록
  });

  it('should qualify all conflicting MCP tools when multiple servers provide same name', () => {
    // 서버 A, B 모두 read_file 제공
    // → A: 'serverA__read_file', B: 'serverB__read_file'
    // 어느 쪽도 unqualified 이름을 획득하지 못함
  });

  it('should always qualify MCP tool when built-in tool has same name', () => {
    // 내장 read_file 등록 후, MCP read_file 등록
    // → MCP만 qualified, 내장은 그대로
  });

  it('should preserve non-conflicting tools as unqualified', () => {
    // 서버 A: read_file, custom_tool
    // 서버 B: read_file, another_tool
    // → read_file 양쪽 qualified, custom_tool/another_tool은 unqualified
  });

  it('should handle three-way conflict (3 servers same tool name)', () => {
    // 서버 A, B, C 모두 search 제공
    // → 모두 qualified
  });
});
```

### 1.2.2 구현 (Green)

**파일**: `packages/core/src/tools/tool-registry.ts`

```typescript
/**
 * Batch-registers MCP tools with deterministic naming.
 *
 * Two-pass algorithm:
 * 1. Collect all tools, detect name conflicts (same name from multiple servers OR same name as built-in)
 * 2. Register: conflicting MCP tools → qualified name, non-conflicting → unqualified name
 *
 * This eliminates non-determinism from Promise.all() discovery order.
 */
registerMCPTools(tools: DiscoveredMCPTool[]): void {
  // Pass 1: Detect conflicts
  const nameToServers = new Map<string, DiscoveredMCPTool[]>();
  for (const tool of tools) {
    const baseName = generateValidName(tool.serverToolName);
    const existing = nameToServers.get(baseName) ?? [];
    existing.push(tool);
    nameToServers.set(baseName, existing);
  }

  // Pass 2: Register with deterministic naming
  for (const [baseName, serverTools] of nameToServers) {
    const hasBuiltInConflict = this.allKnownTools.has(baseName);
    const hasMultiServerConflict = serverTools.length > 1;
    const needsQualification = hasBuiltInConflict || hasMultiServerConflict;

    for (const tool of serverTools) {
      if (needsQualification) {
        this.allKnownTools.set(tool.getFullyQualifiedName(), tool.asFullyQualifiedTool());
      } else {
        this.allKnownTools.set(baseName, tool);
      }
    }
  }
}
```

### 1.2.3 mcp-client-manager 호출 변경

**파일**: `packages/core/src/tools/mcp-client-manager.ts`

현재 흐름:

```
maybeDiscoverMcpServer() → 도구 발견 즉시 → toolRegistry.registerTool(tool)
```

변경 후:

```
maybeDiscoverMcpServer() → 도구 수집만 → discoveredTools 배열에 추가
discoverTools() 완료 후 → toolRegistry.registerMCPTools(allDiscoveredTools)
```

### 1.2.4 리팩터링 (Refactor)

- 기존 `registerTool()`의 MCP 충돌 처리 코드는 유지 (단일 도구 등록 호환)
- `registerMCPTools()`는 배치 등록 전용 (디스커버리 완료 후 1회 호출)

---

## 1.3 검증

```bash
# 단위 테스트
npm test -w @didim365/agent-cli-core -- src/tools/tool-registry
npm test -w @didim365/agent-cli-core -- src/tools/mcp-client-manager

# 전체 회귀
npm test -w @didim365/agent-cli-core

# 빌드 + 린트
npm run typecheck && npm run lint
```

---

## 완료 조건

| 검증 항목                                   | 상태 |
| ------------------------------------------- | ---- |
| 2-pass 등록 TDD — 5개 테스트 작성 및 통과   | ⬜   |
| 충돌 도구 양쪽 모두 qualified name 확인     | ⬜   |
| 단일 서버 기존 동작 유지 (unqualified 이름) | ⬜   |
| 내장 도구와 MCP 충돌 시 MCP만 qualified     | ⬜   |
| mcp-client-manager 배치 호출 전환           | ⬜   |
| 기존 tool-registry 테스트 회귀 없음         | ⬜   |
| Core 전체 테스트 PASS                       | ⬜   |
| 커밋 완료 + 작업 결과서 작성                | ⬜   |

---

## 커밋 전략

1. **커밋 1** `test(tools): registerMCPTools 2-pass 일괄 등록 TDD`
   - tool-registry.test.ts (5개 테스트)
2. **커밋 2**
   `feat(tools): 결정적 MCP 도구 이름 등록 — registerMCPTools 2-pass 구현`
   - tool-registry.ts + mcp-client-manager.ts
3. **커밋 3** `refactor(tools): registerTool MCP 분기 정리` (필요시)
   - 기존 registerTool()의 MCP 분기 코드 정리

---

## 다음 Phase 전달사항

- Phase 2에서 `generateValidName()` 변경 시 이 Phase의 2-pass 로직에 영향 없는지
  확인
- `getFullyQualifiedName()` 결과가 `allKnownTools` Map 키로 사용되므로 Phase 2의
  재-truncate 결과가 유니크해야 함
