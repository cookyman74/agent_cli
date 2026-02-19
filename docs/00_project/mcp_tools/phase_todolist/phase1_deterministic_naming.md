# Phase 1: 결정적 MCP 도구 이름 등록

> **목적**: MCP 서버 디스커버리 순서와 무관하게, 동일 이름 도구가 항상 동일한
> 방식으로 등록되도록 보장 **핵심 변경**: `tool-registry.ts`에 2-pass 일괄 등록
> 메서드 도입 → 충돌 도구는 모두 qualified name 강제 **참고 설계**:
> [main_todolist_mcp_tools_20260219.md Issue #2](../main_todolist_mcp_tools_20260219.md)

---

## 1.1 사전 작업 (Pre-Work)

- [ ] **[PREV-REVIEW]** 선행 작업 결과서 확인
  - 참조:
    `../subagent_multi_provider/working_history/hotfix_tool_param_normalize_20260219.md`
  - 확인 항목:
    - `normalizeToolParams()` 유틸리티 함수가 `tool-utils.ts`에 정상 존재
    - `scheduler.ts`, `coreToolScheduler.ts` 양쪽 경로에 정규화 적용 완료
    - 내장 도구 11개, alias 50개 커버리지 확인
  - 참고: Phase 1은 첫 번째 Phase이므로 이전 Phase 결과서는 없음. 선행 hotfix
    결과서만 확인.

- [ ] **[CONTEXT]** 작업 목적 및 배경 확인
  - 현상: `Promise.all()`로 MCP 서버 병렬 디스커버리 → 서버 등록 순서 비결정적
  - 영향: 동일 이름 도구가 세션마다 다른 이름(unqualified vs qualified)으로 등록

- [ ] **[ANALYSIS-1]** 현재 등록 흐름 분석 (전체 경로)
  - **경로 1: 초기 디스커버리** — `mcp-client-manager.ts:323`: `Promise.all()` →
    `client.discover()` → 내부에서 `toolRegistry.registerTool()` 개별 호출
    (`mcp-client.ts:193`)
  - **경로 2: 도구 리프레시** — `mcp-client.ts:508-512`:
    `removeMcpToolsByServer()` 후 `registerTool()` 개별 호출
  - **경로 3: 독립 디스커버리** — `mcp-client.ts:946-948`: `discoverMcpServer()`
    내에서 `registerTool()` 개별 호출
  - **경로 4: mcp-client-manager.ts:235**: `client.discover(cliConfig)` 호출 →
    경로 1과 동일 (McpClient 내부 개별 등록)
  - `tool-registry.ts:214-226`: `registerTool()` — 이름 충돌 시 MCP 도구만
    qualified name 전환
  - **핵심 문제**: 4개 경로 모두 개별 `registerTool()` 사용 → 비결정적

- [ ] **[ANALYSIS-2]** 충돌 시나리오 구체화
  - 시나리오 A: 서버 A, B가 모두 `read_file` 도구 제공 → A 먼저 등록되면 A는
    `read_file`, B는 `serverB__read_file`
  - 시나리오 B: B 먼저 등록되면 B는 `read_file`, A는 `serverA__read_file` —
    비결정적
  - 시나리오 C: 내장 도구 `read_file`이 이미 등록된 상태에서 MCP `read_file`
    등록 → MCP만 qualified
  - **시나리오 D: 동일 서버 내 sanitize 충돌** — 서버 A가 `foo bar`와 `foo@bar`
    모두 제공 → `generateValidName()` 결과가 둘 다 `foo_bar` → FQN도
    `serverA__foo_bar`로 동일 → Map.set()에서 마지막이 이전을 덮어씀 → **도구
    유실**
  - 시나리오 E: 도구 리프레시 시 다른 서버 도구와의 충돌 재검사 누락

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

  // --- Issue #2: 동일 서버 내 sanitize 충돌 ---

  it('should detect same-server sanitize collision and use hash-differentiated FQN', () => {
    // 서버 A: 'foo bar', 'foo@bar' → 둘 다 sanitize 후 'foo_bar'
    // → FQN 충돌 감지 → hash suffix로 구분
    // 예: 'serverA__foo_bar', 'serverA__foo_bar_a1b2c3'
  });

  it('should not lose tools when same server has sanitize-colliding names', () => {
    // 서버 A: 'my-tool', 'my tool' → 둘 다 'my_tool'
    // → 양쪽 모두 등록되어야 함 (FQN + hash로 구분)
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
 * 1. Collect all tools, detect name conflicts (same baseName from
 *    multiple servers, same baseName as built-in, OR same-server
 *    sanitize collision → all need qualification)
 * 2. Register: conflicting MCP tools → qualified name (with hash
 *    disambiguation for same-server FQN collision),
 *    non-conflicting → unqualified name
 *
 * This eliminates non-determinism from Promise.all() discovery order.
 */
registerMCPTools(tools: DiscoveredMCPTool[]): void {
  // Pass 1: Detect conflicts (baseName 기준 그룹화)
  const nameToServers = new Map<string, DiscoveredMCPTool[]>();
  for (const tool of tools) {
    const baseName = generateValidName(tool.serverToolName);
    const existing = nameToServers.get(baseName) ?? [];
    existing.push(tool);
    nameToServers.set(baseName, existing);
  }

  // Pass 2: Register with deterministic naming
  for (const [baseName, groupedTools] of nameToServers) {
    const hasBuiltInConflict = this.allKnownTools.has(baseName);
    const hasNameConflict = hasBuiltInConflict || groupedTools.length > 1;

    if (!hasNameConflict) {
      // 충돌 없음 → unqualified 등록
      this.allKnownTools.set(baseName, groupedTools[0]);
      continue;
    }

    // 충돌 → qualified name 등록, FQN 중복 감지
    const fqnMap = new Map<string, DiscoveredMCPTool[]>();
    for (const tool of groupedTools) {
      const fqn = tool.getFullyQualifiedName();
      const existing = fqnMap.get(fqn) ?? [];
      existing.push(tool);
      fqnMap.set(fqn, existing);
    }

    for (const [fqn, fqnTools] of fqnMap) {
      if (fqnTools.length === 1) {
        // FQN 유일 → 정상 등록
        this.allKnownTools.set(fqn, fqnTools[0].asFullyQualifiedTool());
      } else {
        // 동일 서버 내 sanitize 충돌 → hash suffix로 구분
        for (const tool of fqnTools) {
          const hash = simpleHash(tool.serverToolName);
          const disambiguated = `${fqn.slice(0, 56)}_${hash.slice(0, 6)}`;
          this.allKnownTools.set(disambiguated, tool.asFullyQualifiedTool());
        }
      }
    }
  }
}
```

> **Issue #2 대응**: 동일 서버 내 sanitize 충돌(`foo bar` + `foo@bar` → 둘 다
> `foo_bar`) 시 FQN도 동일해짐(`serverA__foo_bar`). hash suffix로 구분하여 도구
> 유실 방지. `simpleHash()`는 원본 `serverToolName` 기반이므로 유니크.

### 1.2.3 McpClient 내부 경로 변경 (Issue #1 대응)

> **핵심**: McpClient 내부의 **3개 등록 경로** 모두 배치 등록으로 전환.
> mcp-client-manager만 변경하면 refresh/재연결 경로에서 비결정성 재발.

**경로 1: 초기 디스커버리** — `mcp-client.ts:192-194` (discover 메서드)

현재:

```typescript
for (const tool of tools) {
  this.toolRegistry.registerTool(tool); // 개별 등록
}
```

변경 후:

```typescript
// discover()에서 도구 수집만 → 배치 등록
this.toolRegistry.removeMcpToolsByServer(this.serverName);
this.toolRegistry.registerMCPTools(tools);
```

**경로 2: 도구 리프레시** — `mcp-client.ts:508-512`

현재:

```typescript
this.toolRegistry.removeMcpToolsByServer(this.serverName);
for (const tool of newTools) {
  this.toolRegistry.registerTool(tool); // 개별 등록
}
```

변경 후:

```typescript
this.toolRegistry.removeMcpToolsByServer(this.serverName);
this.toolRegistry.registerMCPTools(newTools);
```

> **주의**: refresh는 단일 서버 도구만 재등록하므로, 다른 서버와의 충돌은 기존
> registry 상태에 의존. `registerMCPTools()`가 기존 `allKnownTools`의 이름과도
> 충돌 검사를 수행하므로 안전.

**경로 3: 독립 디스커버리** — `mcp-client.ts:946-948`

현재:

```typescript
for (const tool of tools) {
  toolRegistry.registerTool(tool); // 개별 등록
}
```

변경 후:

```typescript
toolRegistry.registerMCPTools(tools);
```

**경로 4: mcp-client-manager** — `mcp-client-manager.ts:234-236`

변경: `client.discover()` 호출 시 McpClient 내부가 이미 배치 등록으로 전환되므로
**추가 변경 불필요**. 단, 초기 병렬 디스커버리 (`Promise.all()`) 완료 후 전체
MCP 도구 일괄 재확인이 필요한 경우:

```typescript
// 모든 서버 디스커버리 완료 후 → 전체 MCP 도구 재등록 (선택적)
const allMcpTools = this.getAllDiscoveredMCPTools();
toolRegistry.removeAllMcpTools();
toolRegistry.registerMCPTools(allMcpTools);
```

### 1.2.4 리팩터링 (Refactor)

- 기존 `registerTool()`의 MCP 충돌 처리 코드는 유지 (비-MCP 도구 등록 호환)
- `registerMCPTools()`는 배치 등록 전용 (디스커버리/리프레시 시 호출)
- McpClient의 3개 등록 경로 모두 배치 등록으로 전환

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

| 검증 항목                                                       | 상태 |
| --------------------------------------------------------------- | ---- |
| 2-pass 등록 TDD — 7개 테스트 작성 및 통과 (충돌 5 + 유실 2)     | ⬜   |
| 충돌 도구 양쪽 모두 qualified name 확인                         | ⬜   |
| 동일 서버 sanitize 충돌 시 hash suffix로 구분 (도구 유실 0)     | ⬜   |
| 단일 서버 기존 동작 유지 (unqualified 이름)                     | ⬜   |
| 내장 도구와 MCP 충돌 시 MCP만 qualified                         | ⬜   |
| McpClient 3개 경로 배치 등록 전환 (discover/refresh/standalone) | ⬜   |
| 도구 리프레시 후 이름 결정성 유지 확인                          | ⬜   |
| 기존 tool-registry 테스트 회귀 없음                             | ⬜   |
| Core 전체 테스트 PASS                                           | ⬜   |
| 커밋 완료 + 작업 결과서 작성                                    | ⬜   |

---

## 커밋 전략

1. **커밋 1** `test(tools): registerMCPTools 2-pass 일괄 등록 TDD`
   - tool-registry.test.ts (7개 테스트: 충돌 5 + sanitize 유실 2)
2. **커밋 2**
   `feat(tools): 결정적 MCP 도구 이름 등록 — registerMCPTools 2-pass + FQN 충돌 해시`
   - tool-registry.ts (registerMCPTools + simpleHash FQN 구분)
3. **커밋 3** `refactor(tools): McpClient 3개 등록 경로 배치 전환`
   - mcp-client.ts (discover, refreshTools, discoverMcpServer)
4. **커밋 4** `refactor(tools): registerTool MCP 분기 정리` (필요시)
   - 기존 registerTool()의 MCP 분기 코드 정리

---

## 작업 결과서 작성

> Phase 완료 시 반드시 작성. 다음 Phase 착수 시 `[PREV-REVIEW]`에서 참조.

**파일**: `working_history/mcp_phase1_deterministic_naming_{작업일자}.md`

**포함 항목**:

```markdown
# Phase 1 작업 결과서 — 결정적 MCP 도구 이름 등록

## 작업 요약

- 변경 파일: (목록)
- 핵심 구현: registerMCPTools() 2-pass 배치 등록

## 검증 결과

- 단위 테스트: (PASS/FAIL, 테스트 수)
- 회귀 테스트: (PASS/FAIL)
- 빌드: (성공/실패)
- 린트 + 타입체크: (PASS/FAIL)

## 커밋 해시

- 커밋 1: (해시) — (메시지)
- 커밋 2: (해시) — (메시지)

## 완료 조건 달성 여부

(완료 조건 테이블 복사 + ✅/⬜ 상태 업데이트)

## 다음 Phase 전달사항

- Phase 2에서 확인할 사항
- 미해결 이슈 또는 주의점
```

---

## 다음 Phase 전달사항

- Phase 2에서 `generateValidName()` 변경 시 이 Phase의 2-pass 로직에 영향 없는지
  확인
- `getFullyQualifiedName()` 결과가 `allKnownTools` Map 키로 사용되므로 Phase 2의
  재-truncate 결과가 유니크해야 함
