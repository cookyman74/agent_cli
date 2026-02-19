# Phase 5 작업 결과서 — sLM 도구 호출 내결함성 강화

## 작업 요약

- **목적**: 소형 LLM(sLM)이 도구 호출 시 발생하는 파라미터 타입 불일치, 도구
  이름 오타, 도구 이름 길이 초과 문제에 대한 자동 복구 파이프라인 구축
- **핵심 구현**:
  - `coerceParamTypes()` — schema 기반 파라미터 타입 강제 변환
  - `fuzzyMatchToolName()` — Levenshtein distance ≤ 2 자동 교정
  - `generateValidName(name, maxLength)` — 프로바이더별 이름 길이 제한 확장
- **변경 파일**:

| 파일                                          | 액션 | 변경량                                     |
| --------------------------------------------- | ---- | ------------------------------------------ |
| `packages/core/src/utils/tool-utils.ts`       | 수정 | +coerceParamTypes, +fuzzyMatchToolName     |
| `packages/core/src/utils/tool-utils.test.ts`  | 수정 | +23개 테스트 (13 coerce + 10 fuzzy)        |
| `packages/core/src/tools/mcp-tool.ts`         | 수정 | generateValidName maxLength 파라미터       |
| `packages/core/src/tools/mcp-tool.test.ts`    | 수정 | +3개 테스트 (maxLength)                    |
| `packages/core/src/scheduler/scheduler.ts`    | 수정 | coerceParamTypes + fuzzyMatchToolName 연결 |
| `packages/core/src/core/coreToolScheduler.ts` | 수정 | coerceParamTypes + fuzzyMatchToolName 연결 |

## 구현 세부

### 5.2 coerceParamTypes (tool-utils.ts)

**타입 변환 전략**:

1. `string "42"` → `number 42` (schema expects `number`)
2. `string "3.14"` → `number 3.14` (schema expects `number`)
3. `string "10"` → `integer 10` (schema expects `integer`, `Number.isInteger()`
   검증)
4. `string "true"/"false"` → `boolean true/false` (schema expects `boolean`)
5. `number/boolean` → `string` (schema expects `string`)

**방어 규칙**:

- 빈/공백 문자열 → number 변환 금지 (Issue #8: `Number('') = 0` 방지)
- float string → integer 변환 금지 (`"3.14"` → integer 불가)
- 비수치 문자열 → 원본 유지 (AJV가 에러 처리)
- 원본 args 불변 (shallow copy)
- `object`/`array` 타입은 변환하지 않음

### 5.3 fuzzyMatchToolName (tool-utils.ts)

**매칭 전략**:

1. Exact match → 즉시 반환 (fast path)
2. Levenshtein distance ≤ 2 후보 필터링
3. 단일 최소 거리 후보만 자동 교정
4. 동일 거리 복수 후보 → `null` (모호성 → 기존 에러 메시지)

**서버 경계 보호** (Issue #1 교차):

- Qualified name (`server__tool`) → 동일 prefix 도구만 후보로 필터
- `serverA__cusom_tool` → `serverA__*` 후보만 탐색 (다른 서버 도구 교정 불가)
- prefix 불일치 시 → `null` (교정 불가)

### 5.4 generateValidName maxLength (mcp-tool.ts)

**변경**: `generateValidName(name: string)` →
`generateValidName(name: string, maxLength: number = 63)`

- 하드코딩 `63` → `maxLength` 파라미터
- 하드코딩 `56` → `maxLength - 7` (hash suffix 7자: `_` + 6-char hex)
- 기본값 63 유지 → 기존 호출 코드 변경 불필요

### Scheduler 연결

**정규화 파이프라인 (최종)**:

```
LLM Tool Call → args
  ├─ normalizeToolParams()          (1차: 내장 도구 정적 alias)
  ├─ normalizeToolParamsBySchema()  (2차: MCP 도구 동적 alias, Phase 4)
  ├─ coerceParamTypes()             (3차: 타입 강제 변환, Phase 5)
  └─ getTool()
      ├─ 성공 → AJV validation → execute
      └─ 실패 → fuzzyMatchToolName() fallback
          ├─ 교정 성공 → enrichedRequest.name 갱신 + coerceParamTypes → execute
          └─ 교정 실패 → 기존 에러 메시지 (getToolSuggestion)
```

**적용 범위**: `scheduler.ts` + `coreToolScheduler.ts` 양쪽 동일 패턴

## 테스트 (26개)

### coerceParamTypes (13개)

| 테스트                                                            | 검증 대상              |
| ----------------------------------------------------------------- | ---------------------- |
| should coerce string "42" to number 42 when schema expects number | string→number 기본     |
| should coerce string "3.14" to float when schema expects number   | string→float           |
| should not coerce non-numeric string to number                    | 비수치 방어            |
| should not coerce empty string to number 0                        | 빈 문자열 방어         |
| should not coerce whitespace-only string to number 0              | 공백 문자열 방어       |
| should coerce string "true" to boolean true                       | string→boolean true    |
| should coerce string "false" to boolean false                     | string→boolean false   |
| should coerce string "10" to integer when schema expects integer  | string→integer         |
| should not coerce float string to integer                         | float→integer 방어     |
| should not modify args when types already match                   | no-op                  |
| should return args unchanged when schema is undefined             | undefined schema       |
| should not mutate original args                                   | 불변성                 |
| should coerce number 42 to string "42" when schema expects string | number→string (역방향) |

### fuzzyMatchToolName (10개)

| 테스트                                                                 | 검증 대상                  |
| ---------------------------------------------------------------------- | -------------------------- |
| should return exact match as-is                                        | 완전 일치                  |
| should auto-correct typo with distance 1                               | 거리 1 교정                |
| should auto-correct typo with distance 2                               | 거리 2 교정                |
| should return null when distance > 2 (too different)                   | 거리 초과 거부             |
| should return null when multiple candidates at same minimum distance   | 모호성 거부                |
| should return null when name is empty                                  | 빈 이름 방어               |
| should handle qualified MCP tool name typo                             | MCP qualified 교정         |
| should not cross server boundary in qualified name fuzzy match         | 서버 경계 보호             |
| should reject qualified name when prefix does not match any registered | prefix 불일치 거부         |
| should not match qualified name against unqualified tools              | qualified→unqualified 방어 |

### generateValidName maxLength (3개)

| 테스트                                                     | 검증 대상        |
| ---------------------------------------------------------- | ---------------- |
| should truncate to custom maxLength when specified         | 커스텀 길이 제한 |
| should use default 63 when maxLength not specified         | 기본값 호환      |
| should not truncate when name fits within custom maxLength | 짧은 이름 통과   |

## 검증 결과

| 검증 항목              | 결과                             |
| ---------------------- | -------------------------------- |
| tool-utils 단위 테스트 | 79 PASS (기존 56 + 신규 23)      |
| mcp-tool 단위 테스트   | 63 PASS (기존 60 + 신규 3)       |
| scheduler 회귀         | 30 PASS                          |
| coreToolScheduler 회귀 | 25 PASS                          |
| Core 전체 테스트       | 284 files, 5651 PASS, 24 skipped |
| TypeScript typecheck   | PASS                             |
| ESLint lint            | PASS                             |

## 완료 조건 달성 여부

| 검증 항목                                                       | 상태 |
| --------------------------------------------------------------- | ---- |
| coerceParamTypes TDD — 13개 테스트                              | ✅   |
| fuzzyMatchToolName TDD — 10개 테스트                            | ✅   |
| generateValidName maxLength TDD — 3개 테스트                    | ✅   |
| scheduler.ts coerceParamTypes + fuzzyMatchToolName 연결         | ✅   |
| coreToolScheduler.ts coerceParamTypes + fuzzyMatchToolName 연결 | ✅   |
| 기존 테스트 회귀 없음                                           | ✅   |
| Core 전체 테스트 PASS                                           | ✅   |
| TypeScript typecheck PASS                                       | ✅   |
| ESLint lint PASS                                                | ✅   |
| 작업 결과서 작성                                                | ✅   |

## 구현 결정 사항

- **coerceParamTypes 적용 범위**: MCP 도구뿐 아니라 모든 도구에 적용 (sLM은 내장
  도구에서도 타입 불일치 발생)
- **fuzzyMatchToolName 교정 후 처리**: `enrichedRequest.name`을 교정된 이름으로
  갱신 → 하류 정책 체크가 올바른 이름으로 수행
- **fuzzyMatchToolName 교정 후 coerceParamTypes**: 교정된 도구의 schema로 타입
  변환 재적용 (원래 도구를 못 찾았으므로 초기 coercion이 미적용)
- **generateValidName 기본값**: 63 (Gemini 호환, 모든 프로바이더 최소 공통값)
- **fast-levenshtein 의존성**: 이미 프로젝트에 존재 (추가 설치 불필요)
