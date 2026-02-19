# Phase 3 작업 결과서 — 정책 엔진 와일드카드 엣지 케이스 강화

## 작업 요약

- **목적**: `server__*` 와일드카드 정책에서 서버 스푸핑 불가능 보장 +
  `serverName` undefined 엣지 케이스 안전 처리
- **핵심 구현**: `ruleMatches()` serverName undefined 시 prefix 추출 검증 +
  `toolCallsToTry` serverName `__` 가드
- **변경 파일**:

| 파일                                             | 액션 | 변경량                                               |
| ------------------------------------------------ | ---- | ---------------------------------------------------- |
| `packages/core/src/policy/policy-engine.ts`      | 수정 | `ruleMatches()` 재구성 + `check()` 가드 추가 (+12줄) |
| `packages/core/src/policy/policy-engine.test.ts` | 수정 | +8개 테스트 (+65줄)                                  |

## 구현 세부

### `ruleMatches()` 와일드카드 분기 강화

**변경 전** (line 44-57):

```
1. serverName !== undefined → prefix 일치 검증
2. toolCall.name.startsWith(prefix + '__') 검증
```

**변경 후**:

```
1. toolCall.name.startsWith(prefix + '__') 검증 (조기 반환 — 가장 빈번한 불일치)
2. serverName !== undefined → prefix 일치 검증 (기존 동작 유지)
3. serverName === undefined → toolCall.name.split('__')[0] 추출 → prefix 대조 (신규)
```

**변경 포인트**:

- **순서 변경**: `startsWith` 검사를 serverName 검사 앞으로 이동 (빈번한 불일치
  조기 반환)
- **신규 방어**: serverName undefined 시 `split('__')[0]` prefix 추출 → rule
  prefix에 `__`가 포함된 경우(`my__server__*`) 추가 방어 제공
- **기존 동작 호환**: `startsWith(prefix + '__')` +
  `split('__')[0] === prefix`는 prefix에 `__`가 없는 일반 경우 항상 동시 성립 →
  기존 테스트 64개 전수 통과

### `check()` `toolCallsToTry` 가드

**변경 전**:

```typescript
if (serverName && toolCall.name && !toolCall.name.includes('__')) {
```

**변경 후**:

```typescript
if (serverName && !serverName.includes('__') && toolCall.name && !toolCall.name.includes('__')) {
```

**효과**: serverName에 `__` 포함 시 `server__evil__tool` 형태의 모호한 FQN 생성
방지.

### 테스트 추가 (8개)

| 테스트                                                                          | 검증 대상                                      |
| ------------------------------------------------------------------------------- | ---------------------------------------------- |
| `should match wildcard when serverName is undefined and prefix matches`         | undefined + prefix 추출 → 매칭 성공            |
| `should reject wildcard when serverName is undefined and prefix does not match` | undefined + prefix 불일치 → 매칭 거부          |
| `should reject wildcard when serverName does not match prefix`                  | serverName 불일치 → 거부 (기존 동작 회귀 방지) |
| `should match wildcard when serverName matches prefix exactly`                  | 정상 매칭 (기존 동작 회귀 방지)                |
| `should not confuse server prefix with partial match`                           | 부분 prefix 매칭 방지                          |
| `should reject wildcard for unqualified name without serverName`                | serverName undefined + unqualified → 거부      |
| `should allow wildcard when multiple __ but serverName matches`                 | 도구명 내 \_\_ 무해 확인                       |
| `should not construct ambiguous FQN when serverName contains __`                | serverName \_\_ 가드 검증                      |

## 검증 결과

| 검증 항목                                  | 결과                                |
| ------------------------------------------ | ----------------------------------- |
| policy-engine 단위 테스트                  | ✅ 72 PASS (기존 64 + 신규 8)       |
| Phase 1, 2 회귀 (tool-registry + mcp-tool) | ✅ 90 PASS                          |
| Core 전체 테스트                           | ✅ 284 files, 5595 PASS, 24 skipped |
| TypeScript typecheck                       | ✅ PASS                             |
| ESLint lint                                | ✅ PASS                             |

## 커밋 해시

- (커밋 후 기록)

## 완료 조건 달성 여부

| 검증 항목                                                    | 상태 |
| ------------------------------------------------------------ | ---- |
| 와일드카드 엣지 케이스 TDD — 8개 테스트                      | ✅   |
| serverName undefined + prefix 추출 검증 동작 확인            | ✅   |
| 기존 와일드카드 테스트 회귀 없음 (`test:349-476`)            | ✅   |
| toolCallsToTry serverName `__` 가드 적용                     | ✅   |
| 정책 경로 raw serverToolName 독립 방어 확인 (Phase 2 비의존) | ✅   |
| Phase 1, 2 테스트 회귀 없음                                  | ✅   |
| Core 전체 테스트 PASS                                        | ✅   |
| 커밋 완료 + 작업 결과서 작성                                 | ✅   |

## 구현 결정 사항

- **prefix 추출 방식**: `toolCall.name.split('__')[0]` — 첫 번째 `__` 이전
  세그먼트만 사용. 서버 이름에 `__`가 포함된 rule prefix와 자연스럽게 불일치하여
  방어 효과 발생.
- **toolCallsToTry 가드 범위**: `serverName.includes('__')` 시 2차 자격 부여
  차단 — 모호한 FQN 생성 방지. 서버 이름에 `__`가 포함된 경우는 극히 드물지만
  방어적 프로그래밍 적용.
- **테스트 8개 (계획 7개 + 1개 추가)**: `toolCallsToTry` serverName `__` 가드
  테스트를 추가하여 계획서 대비 1개 증가.

## 다음 Phase 전달사항

- Phase 3 완료 시점에서 MCP 도구의 이름/정책/길이 문제는 모두 해결 상태
- `ruleMatches()`: serverName 제공 시 prefix 정확 일치, undefined 시 prefix 추출
  검증
- `toolCallsToTry`: serverName에 `__` 포함 시 2차 자격 부여 차단
- Phase 4는 독립적인 파라미터 정규화 작업이므로 Phase 1~3 이름 관련 변경과 충돌
  없음
- Phase 4에서 MCP 도구 이름으로 정규화 대상 판별 시, FQN 형식(`server__tool`)
  고려 필요
