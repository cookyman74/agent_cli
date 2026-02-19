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

## 코드 리뷰 수정 (6건)

### Issue 1 [HIGH]: fuzzy 교정 후 파라미터 정규화(별칭/스키마) 재적용 누락

- **문제**: fuzzy 교정 후 `coerceParamTypes()`만 재적용하고,
  `normalizeToolParams()`/`normalizeToolParamsBySchema()`를 재적용하지 않음
- **영향**: `read_fil` → `read_file`로 교정되어도 `path`가 `file_path`로
  변환되지 않아 AJV 실패 가능
- **수정**: scheduler.ts + coreToolScheduler.ts의 fuzzy 교정 블록에서 전체
  정규화 파이프라인 재적용: `normalizeToolParams(correctedName, request.args)` →
  `normalizeToolParamsBySchema()` → `coerceParamTypes()`
- **추가 테스트**: 4개 (scheduler 2개 + coreToolScheduler 2개 통합 테스트)

### Issue 2 [HIGH]: 숫자 변환 시 Infinity 허용

- **문제**: `Number("Infinity")` → `Infinity` 변환이 `!Number.isNaN()` 가드를
  통과
- **영향**: AJV `type: number`에서 Infinity가 통과하여 비정상 값이 도구로 전달
- **수정**: `Number.isFinite(num)` 가드 추가 (line 320)
- **추가 테스트**: 2개 (`"Infinity"`, `"-Infinity"`)

### Issue 3 [MEDIUM]: coerceParamTypes가 allOf 조합 스키마를 해석하지 않음

- **문제**: Phase 4의 `extractSchemaInfo()`는 allOf 병합 지원하지만, Phase 5
  `coerceParamTypes()`는 top-level `properties`만 조회
- **영향**: allOf 기반 MCP schema에서 타입 보정 미적용
- **수정**: `extractSchemaInfo()` 재사용하여 allOf 병합된 properties 기반으로
  타입 변환
- **추가 테스트**: 2개 (allOf 병합 properties, allOf에 $ref only → no-op)

### Issue 4 [MEDIUM]: generateValidName 작은 maxLength에서 길이 보장 실패

- **문제**: `maxLength - 7`이 음수일 때 `slice(0, 음수)` → 빈 문자열이 아닌 원본
  반환
- **재현**: `maxLength=3`일 때 결과 길이 20+
- **수정**: `Math.max(0, maxLength - 7)` 가드 + `prefixBudget === 0`이면
  hash-only truncation (`hash.slice(0, maxLength)`)
- **추가 테스트**: 2개 (`maxLength=5`, `maxLength=7`)

### Issue 5 [MEDIUM]: 프로바이더별 길이 제한이 실제 경로에 연결되지 않음

- **문제**: `generateValidName(name, maxLength)` 시그니처 추가했지만 호출부는
  전부 기본값(63), `getFullyQualifiedName()`과 `tool-registry.ts`도 매직 넘버 63
  하드코딩
- **수정**:
  - `DEFAULT_MAX_TOOL_NAME_LENGTH = 63` 상수 도입 (mcp-tool.ts, export)
  - `getFullyQualifiedName()`의 4곳 하드코딩 63 → `maxLen` 지역 변수로 통일
  - `tool-registry.ts`의 해시 충돌 해소 로직 하드코딩 56/63 →
    `DEFAULT_MAX_TOOL_NAME_LENGTH` 기반으로 교체
- **설계 결정**: 현재는 63자 통일 (모든 프로바이더 최소 공통), 향후 프로바이더별
  차등 적용 시 상수만 교체하면 됨

### Issue 6 [LOW]: 스케줄러 통합 테스트 공백 (fuzzy+coerce 경로)

- **문제**: fuzzy name correction + 재정규화 + 타입 보정 통합 경로 회귀 테스트
  없음
- **수정**: scheduler.test.ts + coreToolScheduler.test.ts에 각 2개씩 통합 테스트
  추가
  - `should apply full normalization pipeline after fuzzy name correction` (내장
    도구: typo 교정 + static alias)
  - `should apply fuzzy correction + type coercion for MCP tools` (MCP 도구:
    typo 교정 + schema 정규화 + 타입 변환)

### 리뷰 수정 검증 결과

| 검증 항목                     | 결과                             |
| ----------------------------- | -------------------------------- |
| tool-utils 단위 테스트        | 83 PASS (기존 79 + 신규 4)       |
| mcp-tool 단위 테스트          | 65 PASS (기존 63 + 신규 2)       |
| scheduler 통합 테스트         | 32 PASS (기존 30 + 신규 2)       |
| coreToolScheduler 통합 테스트 | 27 PASS (기존 25 + 신규 2)       |
| tool-registry 회귀 테스트     | 30 PASS                          |
| Core 전체 테스트              | 284 files, 5661 PASS, 24 skipped |
| TypeScript typecheck          | PASS                             |
| ESLint lint                   | PASS                             |
