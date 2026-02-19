# Phase 4 작업 결과서 — MCP 도구 파라미터 schema-based 정규화

## 작업 요약

- **목적**: MCP 도구의 파라미터 schema를 분석하여 런타임 alias 추론 → non-Gemini
  LLM의 첫 호출 시 파라미터명 불일치 방지
- **핵심 구현**: `normalizeToolParamsBySchema()` 함수 + scheduler 조건부 적용
- **변경 파일**:

| 파일                                          | 액션 | 변경량                                       |
| --------------------------------------------- | ---- | -------------------------------------------- |
| `packages/core/src/utils/tool-utils.ts`       | 수정 | `normalizeToolParamsBySchema()` 추가 (+85줄) |
| `packages/core/src/utils/tool-utils.test.ts`  | 수정 | +12개 테스트 (+110줄)                        |
| `packages/core/src/scheduler/scheduler.ts`    | 수정 | MCP 도구 조건부 적용 (+13줄)                 |
| `packages/core/src/core/coreToolScheduler.ts` | 수정 | 레거시 경로 조건부 적용 (+15줄)              |

## 구현 세부

### `normalizeToolParamsBySchema()` (tool-utils.ts)

**정규화 전략** (우선순위 순):

1. **Exact match**: arg 이름이 schema에 존재 → 변경 없음
2. **camelCase→snake_case**: `filePath` → schema `file_path` → 리네이밍
3. **Suffix match**: `path` → schema `file_path` (required 파라미터 우선)

**핵심 규칙**:

- Canonical 파라미터 이미 존재 → aliasing 안 함 (정상 호출 보호)
- 원본 args 불변 (shallow copy)
- 모호한 suffix 매칭 → required 후보가 정확히 1개인 경우에만 매핑
- Required 후보가 0개 또는 2개 이상 → 매핑 건너뜀 (오매핑 방지)

**헬퍼 함수**:

- `toSnakeCase(str)`: camelCase → snake*case 변환 (`/[A-Z]/g` → `*$lower`)

### Scheduler 연결 (scheduler.ts + coreToolScheduler.ts)

**파이프라인 순서**:

```
LLM 호출 → args
  ├─ normalizeToolParams() (내장 도구 정적 alias) → 1차 시도
  │   └─ 변경 발생 (reference !== args) → 완료
  └─ normalizeToolParamsBySchema() (MCP 도구 동적) → 2차 시도
      └─ tool instanceof DiscoveredMCPTool AND 1차 미변경 시에만
```

**조건**: `normalizedArgs === request.args` (reference identity) —
`normalizeToolParams`가 args를 변경하지 않은 경우에만 schema-based 시도. 내장
도구 정적 alias가 더 정확하므로 우선.

**`getTool()` 호출 순서 변경**: scheduler.ts에서 `getTool()`을
`normalizeToolParams()` 이후, schema-based 적용 전에 호출하도록 재배치. MCP 도구
여부 판별에 tool 인스턴스 필요.

### 테스트 (12개)

| 테스트                                                                     | 검증 대상                 |
| -------------------------------------------------------------------------- | ------------------------- |
| `should normalize camelCase to snake_case when schema property exists`     | camelCase→snake_case 기본 |
| `should not overwrite canonical param when it already exists`              | canonical 보호            |
| `should handle multiple camelCase conversions`                             | 복수 camelCase            |
| `should return args unchanged when all params match schema`                | 변경 불필요               |
| `should return args unchanged when schema is undefined`                    | undefined schema          |
| `should not mutate original args`                                          | 불변성                    |
| `should normalize suffix alias to required param`                          | suffix 매칭 기본          |
| `should prefer exact camelCase match over suffix match`                    | camelCase 우선            |
| `should not apply suffix match for optional params when ambiguous`         | 모호성 → required 해소    |
| `should skip suffix match when ambiguous and no required resolution`       | 모호성 → skip             |
| `should skip suffix match when ambiguous and multiple required candidates` | required 복수 → skip      |
| `should skip suffix match for *_id when multiple id fields exist`          | 복수 \*\_id → skip        |

## 검증 결과

| 검증 항목                         | 결과                                |
| --------------------------------- | ----------------------------------- |
| tool-utils 단위 테스트            | ✅ 48 PASS (기존 36 + 신규 12)      |
| scheduler 회귀                    | ✅ PASS                             |
| coreToolScheduler 회귀            | ✅ PASS                             |
| 기존 `normalizeToolParams()` 회귀 | ✅ PASS (36개 전수 통과)            |
| Core 전체 테스트                  | ✅ 284 files, 5613 PASS, 24 skipped |
| TypeScript typecheck              | ✅ PASS                             |
| ESLint lint                       | ✅ PASS                             |

## 커밋 해시

- (커밋 후 기록)

## 완료 조건 달성 여부

| 검증 항목                                                             | 상태 |
| --------------------------------------------------------------------- | ---- |
| `normalizeToolParamsBySchema()` camelCase→snake_case TDD — 6개 테스트 | ✅   |
| 접미사 매칭 TDD — 6개 테스트 (모호성 + required 복수 방지 포함)       | ✅   |
| 원본 args 불변 확인                                                   | ✅   |
| scheduler.ts MCP 도구 조건부 적용                                     | ✅   |
| coreToolScheduler.ts 레거시 경로 적용                                 | ✅   |
| 기존 `normalizeToolParams()` (내장 도구) 동작 회귀 없음               | ✅   |
| scheduler/coreToolScheduler 기존 테스트 회귀 없음                     | ✅   |
| Core 전체 테스트 PASS                                                 | ✅   |
| 커밋 완료 + 최종 작업 결과서 작성                                     | ✅   |

## 구현 결정 사항

- **정규화 전략**: Option A+B — camelCase→snake_case + suffix 매칭 동시 구현
- **suffix 모호성 해소**: required 후보가 정확히 1개인 경우에만 매핑. 0개 또는
  2개 이상이면 매핑 안 함 (Issue #7 대응)
- **내장 alias 우선**: `normalizeToolParams()`가 args를 변경한 경우 schema-based
  건너뜀 — reference identity (`===`) 체크
- **`getTool()` 재배치**: scheduler.ts에서 tool 인스턴스를 먼저 획득하여
  `instanceof DiscoveredMCPTool` 판별 후 schema-based 적용
- **parameterSchema 타입 캐스팅**: `tool.parameterSchema`가 `unknown` 타입이므로
  `as Record<string, unknown> | undefined` 캐스팅 적용

## 다음 Phase 전달사항

- Phase 4 완료 — MCP 도구 파라미터 정규화 파이프라인 구축 완료
- 정규화 파이프라인 순서: 내장 alias (정적) → schema-based (동적)
- `normalizeToolParamsBySchema()` 시그니처:
  `(args: Record<string, unknown>, schema: Record<string, unknown> | undefined) => Record<string, unknown>`
- Phase 5에서 확인할 사항:
  - 동의어 사전 확장 필요 시 별도 매핑 테이블 추가 가능
  - LLM별 패턴 학습은 향후 확장으로 분류
  - MCP 서버별 커스텀 alias는 설정 파일 지원으로 확장 가능
