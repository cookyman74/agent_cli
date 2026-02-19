# Phase 2 작업 결과서 — Qualified 도구 이름 길이/형식 안전성

## 작업 요약

- **목적**: `getFullyQualifiedName()` 결과가 항상 Gemini API 63자 제한 이내이고,
  도구 이름 내 `__` 구분자가 포함되지 않도록 보장
- **핵심 구현**: `generateValidName()` `__` sanitize + `getFullyQualifiedName()`
  재-truncate
- **변경 파일**:

| 파일                                       | 액션 | 변경량                                                                    |
| ------------------------------------------ | ---- | ------------------------------------------------------------------------- |
| `packages/core/src/tools/mcp-tool.ts`      | 수정 | `generateValidName()` 재작성 + `getFullyQualifiedName()` 재-truncate 추가 |
| `packages/core/src/tools/mcp-tool.test.ts` | 수정 | +10개 테스트 (\_\_ sanitize 6 + FQN 길이 4), 기존 2개 기대값 수정         |

## 구현 세부

### `generateValidName()` 변경

1. **Step 1**: 특수문자 → `_` 치환 (기존 유지)
2. **Step 2 (신규)**: `_{2,}` → `_` (연속 밑줄 단일화) — `__` 구분자 보호
3. **Step 3 (변경)**: 63자 초과 시 `slice(0, 56) + '_' + hash.slice(0, 6)` (기존
   `___` 마커 → hash suffix 변경)

**기존 `___` 마커 제거 사유**:

- `tool-names.ts:89` `split('__')`, `tool-registry.ts:534` `includes('__')`,
  `policy-engine.ts:312` `includes('__')` 와 충돌

### `getFullyQualifiedName()` 재-truncate

- `prefix + toolName` > 63자 → prefix 보존 + toolName 부분 truncate
- `maxToolNameLength < 10` (서버명 과도) → 전체 combined slice + hash
- 일반 경우 → `prefix + toolName.slice(0, max-7) + '_' + hash.slice(0, 6)`

### 기존 테스트 기대값 수정

| 테스트                                             | 기존 기대값                        | 변경 기대값                                 |
| -------------------------------------------------- | ---------------------------------- | ------------------------------------------- |
| `should truncate long names`                       | `'xxx...___xxx...'` (middle `___`) | `'xxx..._' + hash.slice(0,6)` (hash suffix) |
| `should handle names with only invalid characters` | `'__________'` (10자)              | `'_'` (1자, `__` 축소)                      |

## 검증 결과

| 검증 항목                 | 결과                                |
| ------------------------- | ----------------------------------- |
| mcp-tool 단위 테스트      | ✅ 53 PASS (기존 43 + 신규 10)      |
| tool-registry 단위 테스트 | ✅ 28 PASS (Phase 1 회귀 없음)      |
| Core 전체 테스트          | ✅ 284 files, 5578 PASS, 24 skipped |
| TypeScript typecheck      | ✅ PASS (Phase 2 파일 에러 없음)    |
| ESLint lint               | ✅ PASS                             |

## 커밋 해시

- `f72522f66` — `fix(tools): Phase 2 — MCP 도구 이름 길이/형식 안전성`

> 계획서의 2개 분리 커밋(Red/Green)은 단일 커밋으로 통합. TDD 절차(Red →
> Green)는 작업 중 순차 수행, 최종 squash.

## 완료 조건 달성 여부

| 검증 항목                                                   | 상태 |
| ----------------------------------------------------------- | ---- |
| `generateValidName()` `__` sanitize TDD — 6개 테스트        | ✅   |
| `getFullyQualifiedName()` 63자 재-truncate TDD — 4개 테스트 | ✅   |
| 긴 서버명 + 긴 도구명 경계값 테스트 통과                    | ✅   |
| 기존 `generateValidName()` 테스트 회귀 없음                 | ✅   |
| Phase 1 테스트 회귀 없음                                    | ✅   |
| Core 전체 테스트 PASS                                       | ✅   |
| 커밋 완료 + 작업 결과서 작성                                | ✅   |

## 구현 결정 사항

- **truncation 구분자**: `___` 마커 → `_` + 6자 hex hash suffix 방식 확정
- **simpleHash() 방식**: 내장 `crypto.createHash('sha256')` — Phase 1에서 도입된
  `simpleHash()` 재사용
- **`__` sanitize 범위**: 도구 이름(`generateValidName`)에만 적용. 서버 이름은
  `getFullyQualifiedPrefix()`에서 직접 사용되므로 별도 처리 없음 (서버명에
  `__`가 포함되면 prefix 자체가 `__`를 갖지만, 이는 MCP 서버 설정 수준의 제약)

---

## 리뷰 이슈 수정 (2026-02-19)

### 제기된 이슈

| #   | 심각도 | 이슈                                         | 원인                                                                       |
| --- | ------ | -------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | HIGH   | 긴 서버명에서 FQN 구분자(`__`)가 깨짐        | `maxToolNameLength < 10` 분기에서 `combined.slice(0, 57)`이 separator 절단 |
| 2   | MEDIUM | 서버명 무검증으로 qualified 이름 형식 불안전 | `getFullyQualifiedPrefix()`가 raw 서버명 사용, 공백/특수문자 미처리        |
| 3   | LOW    | counter disambiguation이 63자 초과 가능      | counter 3자리(100+) 시 `53+1+6+1+3=64`자                                   |
| 4   | LOW    | 테스트가 `__` 보존/서버명 sanitize 검증 부재 | long-server 테스트가 길이만 확인, separator/prefix 보존 미검증             |

### 검증 결과

4개 이슈 모두 실제 문제로 확인됨.

### 수정 내용

#### Issue 1 (HIGH): FQN 구분자 보존

`maxToolNameLength < 10` 분기 전면 재작성:

- 기존: `combined.slice(0, 57) + hash(6)` → 서버 56자+ 시 `__` 절단
- 수정: `truncatedServer(≤55) + '__' + hash(6)` → **항상** `__` separator 보존
- `prefix.slice(0, 55).replace(/_+$/, '')` → trailing `_` 제거로 `___` 방지

#### Issue 2 (MEDIUM): 서버명 sanitize

`getFullyQualifiedPrefix()` 변경:

- 특수문자 → `_` 치환
- 연속 밑줄 `_{2,}` → `_` 단일화 (서버명 내 `__` 방지)
- trailing `_` 제거 → `server___tool` 형태 방지

#### Issue 3 (LOW): counter 63자 보장

`tool-registry.ts` disambiguation 루프:

- 기존: 고정 `fqn.slice(0, 53)` → counter 3자리+ 시 초과
- 수정: `budget = 63 - 1 - 6 - 1 - counterStr.length` 동적 계산

#### Issue 4 (LOW): 테스트 강화

| 테스트                                                                 | 검증 대상                                       |
| ---------------------------------------------------------------------- | ----------------------------------------------- |
| `should preserve __ separator even with server name >= 56 chars`       | 극단 서버명에서 `__` 보존 + `split('__')` 2파트 |
| `should sanitize server name with special characters in prefix`        | 공백/특수문자 sanitize 후 valid FQN             |
| `should collapse __ in server name to prevent ambiguous separator`     | 서버명 내 `__` 단일화                           |
| `should keep disambiguated names within 63 characters` (tool-registry) | counter suffix 포함 63자 이내                   |
| 기존 `should handle very long server name` — `__` 포함 assertion 추가  | separator 보존 검증                             |

### 수정 후 검증 결과

| 검증 항목                 | 결과                                |
| ------------------------- | ----------------------------------- |
| mcp-tool 단위 테스트      | ✅ 56 PASS (기존 53 + 신규 3)       |
| tool-registry 단위 테스트 | ✅ 29 PASS (기존 28 + 신규 1)       |
| Core 전체 테스트          | ✅ 284 files, 5582 PASS, 24 skipped |
| TypeScript typecheck      | ✅ PASS (Phase 2 파일 에러 없음)    |
| ESLint lint               | ✅ PASS                             |

---

## 다음 Phase 전달사항

- `__` sanitize로 **registry 이름**에서 `__` 불가능 → Phase 3 정책 엣지 케이스의
  부분적 전제 조건 충족
- **주의**: 정책 경로에서는 raw `serverToolName` 사용 (`mcp-tool.ts:92`) →
  sanitize가 정책 입력에 적용되지 않음. Phase 3에서 독립적 방어 필요
- `getFullyQualifiedName()` 결과가 63자 이내 보장 + `__` separator 항상 보존 →
  Phase 1의 `registerMCPTools()`에서 `allKnownTools` Map 키 안전
- 서버명 sanitize 적용: `getFullyQualifiedPrefix()`에서 chars + `__` 단일화 +
  trailing `_` 제거
- counter disambiguation도 63자 보장 → 극단 케이스 방어 완료
