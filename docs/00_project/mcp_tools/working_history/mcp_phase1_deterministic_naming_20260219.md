# Phase 1 작업 결과서 — 결정적 MCP 도구 이름 등록

## 작업 요약

- **목적**: `Promise.all()` 병렬 디스커버리로 인한 비결정적 MCP 도구 이름 등록
  해소
- **핵심 구현**: `registerMCPTools()` 2-pass 배치 등록 알고리즘
- **변경 파일**:

| 파일                                            | 액션 | 변경량                                         |
| ----------------------------------------------- | ---- | ---------------------------------------------- |
| `packages/core/src/tools/tool-registry.ts`      | 수정 | +69줄 (registerMCPTools 메서드)                |
| `packages/core/src/tools/tool-registry.test.ts` | 수정 | +123줄 (7개 테스트)                            |
| `packages/core/src/tools/mcp-tool.ts`           | 수정 | +10줄 (simpleHash + asFullyQualifiedTool 확장) |
| `packages/core/src/tools/mcp-client.ts`         | 수정 | -16줄/+4줄 (3개 경로 배치 전환)                |
| `packages/core/src/tools/mcp-client.test.ts`    | 수정 | +35줄/-26줄 (mock 업데이트)                    |

## 구현 세부

### 2-pass 알고리즘

1. **Pass 1**: `generateValidName(serverToolName)` 기준 baseName 그룹화 → 충돌
   감지
2. **Pass 2**: 결정적 등록
   - 충돌 없음 → unqualified 등록
   - 다중 서버 충돌 / 내장 도구 충돌 → FQN(`serverName__toolName`) 등록
   - 동일 서버 sanitize 충돌 → hash suffix(`${fqn}_${hash6}`) disambiguate

### McpClient 경로 전환

- **discover()** (mcp-client.ts:192): `for...registerTool()` →
  `registerMCPTools(tools)`
- **refreshTools()** (mcp-client.ts:506): `for...registerTool()` →
  `registerMCPTools(newTools)`
- **connectAndDiscover()** (mcp-client.ts:939): `for...registerTool()` →
  `registerMCPTools(tools)`
- `sortTools()` 호출 제거 — `registerMCPTools()` 내부에서 수행

### 테스트 변경 사항

- mcp-client.test.ts: 15개 mock ToolRegistry 객체에 `registerMCPTools: vi.fn()`
  추가
- 7개 assertion을 `registerTool` → `registerMCPTools`로 전환
- timeout 테스트: `not.toHaveBeenCalled()` → `toHaveBeenCalledWith([])` (빈 배열
  호출은 정상)

## 검증 결과

| 검증 항목                 | 결과                                |
| ------------------------- | ----------------------------------- |
| tool-registry 단위 테스트 | ✅ 24 PASS (기존 17 + 신규 7)       |
| mcp-tool 단위 테스트      | ✅ 43 PASS                          |
| mcp-client 단위 테스트    | ✅ 56 PASS                          |
| Core 전체 테스트          | ✅ 284 files, 5564 PASS, 24 skipped |
| TypeScript typecheck      | ✅ PASS                             |
| ESLint lint               | ✅ PASS                             |

## 커밋 해시

- `096e37416` —
  `feat(mcp-tools): Phase 1 — 결정적 MCP 도구 이름 등록 (2-pass batch)`

> 참고: 계획서의 3개 분리 커밋(Red/Green/Refactor)은 단일 커밋으로 통합. TDD
> 절차(Red → Green → McpClient 전환)는 작업 중 순차 수행, 최종 squash 커밋.

## 완료 조건 달성 여부

| 검증 항목                                                       | 상태 |
| --------------------------------------------------------------- | ---- |
| 2-pass 등록 TDD — 7개 테스트 작성 및 통과 (충돌 5 + 유실 2)     | ✅   |
| 충돌 도구 양쪽 모두 qualified name 확인                         | ✅   |
| 동일 서버 sanitize 충돌 시 hash suffix로 구분 (도구 유실 0)     | ✅   |
| 단일 서버 기존 동작 유지 (unqualified 이름)                     | ✅   |
| 내장 도구와 MCP 충돌 시 MCP만 qualified                         | ✅   |
| McpClient 3개 경로 배치 등록 전환 (discover/refresh/standalone) | ✅   |
| 도구 리프레시 후 이름 결정성 유지 확인                          | ✅   |
| 기존 tool-registry 테스트 회귀 없음                             | ✅   |
| Core 전체 테스트 PASS                                           | ✅   |
| 커밋 완료 + 작업 결과서 작성                                    | ✅   |

## 다음 Phase 전달사항

- `generateValidName()` 변경 시 2-pass 로직의 baseName 그룹화에 영향 → Phase
  2에서 확인
- `getFullyQualifiedName()` 결과가 `allKnownTools` Map 키 → Phase 2의
  재-truncate 결과 유니크 보장 필요
- `simpleHash()`는 `mcp-tool.ts`에서 export — Phase 5 등 다른 Phase에서 재사용
  가능
- mcp-client-manager.ts 자체는 변경 불필요 (McpClient 내부가 배치 전환되어 자동
  적용)
