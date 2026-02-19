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

---

## 리뷰 이슈 수정 (2026-02-19)

### 제기된 이슈

| #   | 심각도 | 이슈                                    | 원인                                                                                          |
| --- | ------ | --------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | HIGH   | 교차 서버 충돌이 여전히 비결정적        | `registerMCPTools()`가 파라미터 배열만 처리, per-server 호출이므로 등록 순서에 따라 결과 변동 |
| 2   | MEDIUM | hash disambiguation 재충돌 시 도구 유실 | 6자 해시만 사용, 카운터 없이 `Map.set` 덮어쓰기                                               |
| 3   | LOW    | 테스트 커버리지 부족                    | 순차/동시 등록, 리프레시 후 결정성 테스트 누락                                                |

### 검증 결과

3개 이슈 모두 실제 문제로 확인됨.

### 수정 내용

#### Issue 1+2: `registerMCPTools()` 전면 재작성

**핵심 변경 — 글로벌 재등록 패턴**:

기존: 파라미터 배열만 내부 처리 → 교차 서버 충돌 미감지 변경: 호출 시 **전체 MCP
도구를 재수집하여 일괄 충돌 해소**

```
1. updatingServers 집합 산출 (파라미터의 서버 목록)
2. 기존 MCP 중 updatingServers에 포함되지 않은 도구 retainedTools로 수집
3. 전체 MCP 도구 삭제
4. retainedTools + newTools 합산 → allMcpTools
5. Pass 1: baseName 그룹화 (충돌 감지)
6. Pass 2: 결정적 등록
   - 충돌 없음 → unqualified (asFullyQualifiedTool(baseName)로 name 보장)
   - 충돌 → FQN 등록
   - FQN 중복(동일 서버 sanitize 충돌) → hash + usedKeys Set + counter 방어
```

**hash 카운터 방어**: `usedKeys` Set으로 중복 키 감지 → `_${counter}` 접미사
부여

#### Issue 3: 4개 신규 테스트 추가

| 테스트                                                                       | 검증 대상                             |
| ---------------------------------------------------------------------------- | ------------------------------------- |
| `should qualify both servers when registered sequentially (A then B)`        | 순차 등록 시 양쪽 qualified           |
| `should produce same names when registration order is reversed (B then A)`   | 역순 등록 동일 결과 → 결정성 확인     |
| `should maintain cross-server qualification after single-server refresh`     | 리프레시 후에도 교차 서버 충돌 유지   |
| `should use counter suffix when hash disambiguation produces identical keys` | 동일 해시 → 카운터 접미사로 유실 방지 |

### 수정 후 검증 결과

| 검증 항목                 | 결과                                   |
| ------------------------- | -------------------------------------- |
| tool-registry 단위 테스트 | ✅ 28 PASS (기존 17 + 초기 7 + 신규 4) |
| mcp-client 단위 테스트    | ✅ 56 PASS                             |
| Core 전체 테스트          | ✅ 284 files, 5568 PASS, 24 skipped    |
| TypeScript typecheck      | ✅ PASS (Phase 1 파일 에러 없음)       |
| ESLint lint               | ✅ PASS                                |

---

## 다음 Phase 전달사항

- `generateValidName()` 변경 시 2-pass 로직의 baseName 그룹화에 영향 → Phase
  2에서 확인
- `getFullyQualifiedName()` 결과가 `allKnownTools` Map 키 → Phase 2의
  재-truncate 결과 유니크 보장 필요
- `simpleHash()`는 `mcp-tool.ts`에서 export — Phase 5 등 다른 Phase에서 재사용
  가능
- mcp-client-manager.ts 자체는 변경 불필요 (McpClient 내부가 배치 전환되어 자동
  적용)
- 글로벌 재등록 패턴: `registerMCPTools()`는 호출마다 **전체 MCP 도구**를 재평가
  → 새 서버 추가 시에도 기존 서버 이름이 자동 재조정됨

---

## 크로스페이즈 코드 리뷰 수정 (2건, 2026-02-19)

### CX-1 [MEDIUM]: 비결정적 allMcpTools 순서

- **문제**: `allMcpTools = [...retainedTools, ...newTools]` 순서가 입력 순서에
  의존. `Promise.all()` 서버 발견 시 비결정적 순서 → counter-based
  disambiguation에서 같은 도구 세트에 다른 이름 할당 가능
- **영향**: 정책 규칙이 특정 disambiguated 이름을 참조하면, 재시작 시 다른
  도구에 적용
- **수정**: `allMcpTools`를 `serverName + serverToolName` 기준으로 정렬.
  `fqnTools`도 `serverToolName` 기준 정렬하여 counter 할당 결정론 보장
- **추가 테스트**: 1개
  (`should produce deterministic disambiguated names regardless of input order`)

### CX-2 [LOW-MEDIUM]: getTool FQN fallback 모호성

- **문제**: `getTool()` FQN fallback이 `getFullyQualifiedName()`으로 검색 시,
  disambiguation된 여러 도구가 동일 FQN을 반환 → `break`로 첫 번째 매칭 반환
  (모호)
- **영향**: LLM이 disambiguation 전 FQN으로 호출 시 비결정적 도구 선택
- **수정**: 매칭 카운트 추적, >1이면 `undefined` 반환 (모호성 → 기존 에러 경로)
- **추가 테스트**: 1개
  (`should return undefined for FQN lookup when multiple tools share the same FQN`)

### 리뷰 수정 검증 결과

| 검증 항목            | 결과                             |
| -------------------- | -------------------------------- |
| tool-registry 단위   | 32 PASS (기존 30 + 신규 2)       |
| Core 전체 테스트     | 284 files, 5664 PASS, 24 skipped |
| TypeScript typecheck | PASS                             |
| ESLint lint          | PASS                             |
