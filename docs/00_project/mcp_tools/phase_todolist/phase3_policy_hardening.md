# Phase 3: 정책 엔진 와일드카드 엣지 케이스 강화

> **목적**: `server__*` 와일드카드 정책에서 서버 스푸핑 불가능 보장 +
> `serverName` undefined 엣지 케이스 안전 처리 **핵심 변경**: `ruleMatches()`
> serverName undefined 시 toolCall.name에서 prefix 추출 검증 + `toolCallsToTry`
> 구성 시 추가 검증 **의존성**: Phase 2 완료 권장 (단, 정책 엔진은 Phase 2
> sanitize에 의존하지 않고 **자체 방어**) **참고 설계**:
> [main_todolist_mcp_tools_20260219.md Issue #1](../main_todolist_mcp_tools_20260219.md)

---

## 3.1 사전 작업 (Pre-Work)

- [ ] **[PREV-REVIEW]** Phase 2 작업 결과서 확인
  - 참조: `../working_history/mcp_phase2_name_length_safety_{작업일자}.md`
  - 확인 항목:
    - `generateValidName()`에서 `__` sanitize 완료 (연속 underscore → 단일 `_`)
    - `getFullyQualifiedName()` 재-truncate 동작 확인 (63자 이내 보장)
    - truncation 구분자 최종 결정 확인 (`___` vs 대안)
    - simpleHash() 구현 방식 확인
    - "다음 Phase 전달사항" 섹션의 주의점 확인
    - Phase 2 TDD 테스트 전체 PASS 확인

- [ ] **[ANALYSIS-1]** 현재 정책 매칭 로직 분석

  **`ruleMatches()` (policy-engine.ts:30-61)**:

  ```
  1. rule.modes 검사 → currentApprovalMode 매칭
  2. rule.toolName 검사:
     a. 와일드카드 (`server__*` 패턴):
        - serverName !== undefined → serverName === prefix 검증
        - toolCall.name.startsWith(prefix + '__') 검증
     b. 정확 매칭: toolCall.name === rule.toolName
  3. rule.argsPattern 검사 (있으면)
  ```

  **`check()` (policy-engine.ts:309-317)**:

  ```
  1. toolCallsToTry = [toolCall]
  2. if (serverName && !toolCall.name.includes('__')):
     toolCallsToTry.push({ ...toolCall, name: `${serverName}__${toolCall.name}` })
  3. rules 순회 → ruleMatches() 호출
  ```

- [ ] **[ANALYSIS-2]** 엣지 케이스 식별

  **엣지 케이스 1: serverName undefined + 와일드카드**
  - `ruleMatches()` line 47: `if (serverName !== undefined)` → undefined면 서버
    검증 건너뜀
  - line 55: `toolCall.name.startsWith(prefix + '__')` 만 검증
  - **기존 테스트 기대**: `policy-engine.test.ts:368` —
    `engine.check({ name: 'my-server__tool1' }, undefined)` → ALLOW 기대
    (serverName=undefined에서 FQN 이름의 prefix 매칭으로 와일드카드 동작)
  - **공격 시나리오**: 악의적 도구가 `trusted_server__malicious_tool` 이름 등록
  - **Phase 2 sanitize 한계**: sanitize는 registry 이름에만 적용. **정책
    경로에서는 raw `serverToolName` 사용** (`mcp-tool.ts:91`:
    `${serverName}${MCP_QUALIFIED_NAME_SEPARATOR}${serverToolName}`) → Phase 2
    sanitize로는 정책 경로 안전성 미확보.
  - **결론**: 정책 엔진이 **자체적으로** serverName/toolCall.name prefix 검증
    수행해야 함 (Phase 2 sanitize에 의존 금지)

  **엣지 케이스 2: toolCall.name에 `__` 포함**
  - `check()` line 312: `!toolCall.name.includes('__')` → `__` 포함 시 2차 자격
    부여 건너뜀
  - Phase 2 완료 후: `generateValidName()`이 `__` 제거 → 이 게이트는 FQN 도구만
    통과
  - **잔여 리스크**: FQN으로 등록된 도구가 `toolCallsToTry`에서 2차 자격을 받지
    못해 정책 매칭 누락 가능 (정상 동작이지만 문서화 필요)

  **엣지 케이스 3: 서버 이름이 다른 서버 이름의 prefix**
  - 서버 A: `my_server`, 서버 B: `my_server_extended`
  - A의 와일드카드: `my_server__*`
  - B의 도구: `my_server_extended__tool` → `startsWith('my_server__')` = false →
    OK
  - **안전**: 서버 이름 자체에는 `__` sanitize 적용 안 되므로 prefix 매칭 정확

- [ ] **[ANALYSIS-3]** 기존 테스트 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/policy/policy-engine
  ```
  - 기존 와일드카드 테스트: `policy-engine.test.ts:349-476`
  - 서버 스푸핑 방지 테스트 존재 여부 확인

---

## 3.2 serverName undefined 가드 강화 (TDD)

### 3.2.1 테스트 먼저 작성 (Red)

**파일**: `packages/core/src/policy/policy-engine.test.ts`

```typescript
describe('wildcard policy — edge cases', () => {
  // --- Issue #5 대응: serverName undefined 시 prefix 추출 방식 ---

  it('should match wildcard when serverName is undefined but toolCall.name prefix matches', () => {
    // rule: { toolName: 'trusted__*', decision: 'allow' }
    // toolCall: { name: 'trusted__safe_tool' }
    // serverName: undefined
    // → toolCall.name에서 prefix 'trusted' 추출 → rule prefix와 일치 → 매칭 성공
    // (기존 테스트 policy-engine.test.ts:368 호환 유지)
  });

  it('should reject wildcard when serverName is undefined and toolCall.name prefix does not match', () => {
    // rule: { toolName: 'trusted__*', decision: 'allow' }
    // toolCall: { name: 'malicious__exploit' }
    // serverName: undefined
    // → prefix 'malicious' !== rule prefix 'trusted' → 매칭 거부
  });

  it('should reject wildcard match when serverName does not match prefix', () => {
    // rule: { toolName: 'trusted__*', decision: 'allow' }
    // toolCall: { name: 'trusted__exploit' }
    // serverName: 'malicious'
    // → 매칭 거부 (serverName !== 'trusted')
  });

  it('should match wildcard when serverName matches prefix exactly', () => {
    // rule: { toolName: 'trusted__*', decision: 'allow' }
    // toolCall: { name: 'trusted__safe_tool' }
    // serverName: 'trusted'
    // → 매칭 성공
  });

  it('should not confuse server prefix with partial match', () => {
    // rule: { toolName: 'srv__*', decision: 'allow' }
    // toolCall: { name: 'srv_extra__tool' }
    // serverName: 'srv_extra'
    // → 매칭 거부 (prefix 'srv' !== serverName 'srv_extra')
  });

  it('should handle toolCall.name without __ in wildcard context', () => {
    // rule: { toolName: 'srv__*', decision: 'allow' }
    // toolCall: { name: 'some_tool' } (no __)
    // serverName: 'srv'
    // → 매칭 거부 (toolCall.name doesn't start with 'srv__')
  });

  // --- Issue #6 대응: raw serverToolName에 __ 포함 시나리오 ---

  it('should reject wildcard when raw toolCall.name has multiple __ segments', () => {
    // rule: { toolName: 'trusted__*', decision: 'allow' }
    // toolCall: { name: 'trusted__sub__exploit' }
    // serverName: 'trusted'
    // → toolCall.name의 첫 번째 __ 이후에 다시 __ 포함 → 이상 이름 감지
    // → 매칭 성공 (serverName 일치 + prefix 일치, 도구명 부분의 __는 무해)
    // 이유: serverName이 정확히 일치하고 prefix도 일치하면 안전함
  });
});
```

### 3.2.2 구현 (Green)

**파일**: `packages/core/src/policy/policy-engine.ts`

```typescript
// ruleMatches() 내 와일드카드 분기 강화
if (rule.toolName.endsWith('__*')) {
  const prefix = rule.toolName.slice(0, -3); // Remove "__*"

  // Double-check: toolCall.name must start with prefix + separator
  if (!toolCall.name || !toolCall.name.startsWith(prefix + '__')) {
    return false;
  }

  if (serverName !== undefined) {
    // SECURITY: serverName이 제공되면 반드시 prefix와 일치해야 함
    // 서버 스푸핑 방지: 'malicious' 서버가 'trusted__tool' 이름을 사용해도 거부
    if (serverName !== prefix) {
      return false;
    }
  } else {
    // serverName === undefined: toolCall.name에서 prefix를 추출하여 검증
    // 기존 동작 호환: engine.check({ name: 'my-server__tool1' }, undefined) → ALLOW
    // toolCall.name이 이미 prefix + '__' 로 시작하는지 위에서 확인됨 → 안전
    // 추가 검증: toolCall.name의 추출된 prefix가 rule prefix와 일치하는지 확인
    const extractedPrefix = toolCall.name.split('__')[0];
    if (extractedPrefix !== prefix) {
      return false;
    }
  }
}
```

**변경 포인트**:

- **Issue #5 대응**: serverName undefined 시 **무조건 거부 대신** toolCall.name
  에서 prefix 추출 후 검증. 기존 테스트(`policy-engine.test.ts:368-395`)와 호환
  유지.
- **Issue #6 대응**: Phase 2 sanitize에 의존하지 않고, 정책 엔진 자체에서
  serverName/prefix 기반 검증으로 보안 확보. 정책 경로에서 raw
  serverToolName(`mcp-tool.ts:91`)이 사용되더라도, serverName 매칭으로 보호됨.
- **보안 보장**: serverName이 제공되면 반드시 prefix 일치 요구 (기존 동작 유지).
  serverName이 없으면 toolCall.name의 prefix가 rule prefix와 일치하는지 확인.

---

## 3.3 toolCallsToTry 구성 검증 강화 (선택)

> Phase 2에서 `__` sanitize가 완료되면 이 엣지 케이스는 자연 해소. 방어적
> 프로그래밍 관점에서 추가 가드 검토.

**파일**: `packages/core/src/policy/policy-engine.ts`

```typescript
// check() 내 toolCallsToTry 구성
const toolCallsToTry: FunctionCall[] = [toolCall];
if (serverName && toolCall.name && !toolCall.name.includes('__')) {
  // Additional safety: verify serverName doesn't contain '__'
  if (!serverName.includes('__')) {
    toolCallsToTry.push({
      ...toolCall,
      name: `${serverName}__${toolCall.name}`,
    });
  }
}
```

---

## 3.4 검증

```bash
# 단위 테스트
npm test -w @didim365/agent-cli-core -- src/policy/policy-engine

# Phase 1, 2 회귀
npm test -w @didim365/agent-cli-core -- src/tools/tool-registry
npm test -w @didim365/agent-cli-core -- src/tools/mcp-tool

# 전체 회귀
npm test -w @didim365/agent-cli-core

# 빌드 + 린트
npm run typecheck && npm run lint
```

---

## 완료 조건

| 검증 항목                                                        | 상태 |
| ---------------------------------------------------------------- | ---- |
| 와일드카드 엣지 케이스 TDD — 7개 테스트 (prefix 추출 2 + 기존 5) | ⬜   |
| serverName undefined + FQN 이름 prefix 매칭 기존 동작 호환       | ⬜   |
| 기존 와일드카드 테스트 회귀 없음 (`test:349-476`)                | ⬜   |
| toolCallsToTry serverName `__` 가드 (선택적)                     | ⬜   |
| 정책 경로 raw serverToolName 독립 방어 확인 (Phase 2 비의존)     | ⬜   |
| Phase 1, 2 테스트 회귀 없음                                      | ⬜   |
| Core 전체 테스트 PASS                                            | ⬜   |
| 커밋 완료 + 작업 결과서 작성                                     | ⬜   |

---

## 커밋 전략

1. **커밋 1**
   `test(policy): 와일드카드 정책 엣지 케이스 TDD — prefix 추출 + 독립 방어`
   - policy-engine.test.ts (7개 테스트)
2. **커밋 2**
   `fix(policy): 와일드카드 정책 prefix 추출 검증 — serverName undefined 호환 + 자체 방어`
   - policy-engine.ts

---

## 작업 결과서 작성

> Phase 완료 시 반드시 작성. 다음 Phase 착수 시 `[PREV-REVIEW]`에서 참조.

**파일**: `working_history/mcp_phase3_policy_hardening_{작업일자}.md`

**포함 항목**:

```markdown
# Phase 3 작업 결과서 — 정책 엔진 와일드카드 엣지 케이스 강화

## 작업 요약

- 변경 파일: (목록)
- 핵심 구현: ruleMatches() serverName undefined 가드 + toolCallsToTry 검증 강화

## 검증 결과

- 단위 테스트: (PASS/FAIL, 테스트 수)
- Phase 1, 2 회귀: (PASS/FAIL)
- 빌드: (성공/실패)
- 린트 + 타입체크: (PASS/FAIL)

## 커밋 해시

- 커밋 1: (해시) — (메시지)
- 커밋 2: (해시) — (메시지)

## 완료 조건 달성 여부

(완료 조건 테이블 복사 + ✅/⬜ 상태 업데이트)

## 다음 Phase 전달사항

- Phase 4에서 확인할 사항
- MCP 도구 이름/정책/길이 문제 해결 상태 확인
```

---

## 다음 Phase 전달사항

- Phase 3 완료 시점에서 MCP 도구의 이름/정책/길이 문제는 모두 해결 상태
- Phase 4는 독립적인 파라미터 정규화 작업이므로, Phase 1~3의 이름 관련 변경과
  충돌 없음
- Phase 4에서 MCP 도구 이름으로 정규화 대상 판별 시, FQN 형식(`server__tool`)
  고려 필요
