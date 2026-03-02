# 종합 리뷰 수정 작업 결과서: AskUser + TaskStore 이슈 5건

> **작업일**: 2026-03-02 **브랜치**: `DID/v0.2`

---

## 1. 작업 개요

| 항목      | 내용                                                         |
| --------- | ------------------------------------------------------------ |
| 목적      | Phase 1~5 전체 작업결과서 종합 리뷰에서 발견된 이슈 5건 수정 |
| 대상 파일 | AskUserDialog.tsx, useAskUserHandler.ts, task-store.ts       |
| 위험 수준 | Medium — 직렬화 포맷 변경 + 의존성 그래프 로직 강화          |

---

## 2. 이슈별 분석 및 수정

### Issue 1. [HIGH] AskUser multi-select 응답 직렬화 — 구분자 충돌 위험

**문제**: multi-select 응답을 `answers.join(', ')`로 직렬화하여, 옵션 레이블에
`, `가 포함된 경우 파싱 시 잘못 분리되는 구분자 충돌(delimiter collision) 위험.

**조치**: JSON 배열 형식으로 변경.

| 변경 위치                    | 변경 전                | 변경 후                                     |
| ---------------------------- | ---------------------- | ------------------------------------------- |
| `buildAnswerString` (출력)   | `answers.join(', ')`   | `JSON.stringify(answers)` (multi-select 시) |
| `initialReducerState` (파싱) | `split(', ')`          | `JSON.parse()` 우선, 실패 시 `split` 폴백   |
| `initialCustomText` (파싱)   | `split(', ')`          | `JSON.parse()` 우선, 실패 시 `split` 폴백   |
| `buildAnswerString` deps     | `[questionOptions]`    | `[questionOptions, question.multiSelect]`   |
| `AskUserDialog.test.tsx`     | `'TypeScript, ESLint'` | `'["TypeScript","ESLint"]'`                 |

**하위호환**: 파싱 측에서 JSON.parse 실패 시 기존 `, ` 분리 폴백을 유지하므로,
이전 형식의 저장된 응답도 정상 처리됨.

---

### Issue 2. [MEDIUM] AskUser 동시 요청 자동 취소 (single-slot)

**문제**: 새 ASK_USER_REQUEST 도착 시 이전 요청이 자동 취소되는 동작이
의도적인지 불명확.

**판단**: **의도적 설계** — 터미널은 동시에 하나의 다이얼로그만 표시 가능하므로,
최신 요청이 우선권을 가지는 single-slot 패턴이 올바른 접근.

**조치**: `useAskUserHandler.ts`에 설계 의도를 명시하는 상세 주석 추가.

```typescript
// Issue 2: Single-slot auto-cancel — track previous request's cancel callback.
// When a new ASK_USER_REQUEST arrives, the previous dialog is programmatically cancelled
// so only one dialog is ever active. This is a deliberate design choice for terminal UIs
// that cannot render concurrent dialogs.
```

---

### Issue 3. [MEDIUM] Type-to-jump이 Space 키를 포함

**문제**: `key.sequence.charCodeAt(0) >= 32` 조건이 Space(charCode 32)를
printable로 간주하여, Space 입력 시 커스텀 옵션 입력 모드로 자동 전환됨. Space는
선택/토글 용도로 사용되는 경우가 많아 Type-to-jump 대상에서 제외해야 함.

**조치**: `>= 32` → `> 32`로 변경하여 Space를 printable 범위에서 제외.

```typescript
// Before
key.sequence.charCodeAt(0) >= 32; // includes Space (32)

// After
key.sequence.charCodeAt(0) > 32; // excludes Space (32)
```

---

### Issue 4. [MEDIUM] TaskStore — completed 대상 태스크에 의존성 추가 허용

**문제**: `addDependency()`에서 source 태스크의 completed 상태만 검사하고,
target 태스크의 completed 상태는 검사하지 않음. 이미 완료된 태스크에 의존성을
추가하는 것은 의미 없으며 blockedBy/blocks 관계를 혼란스럽게 만듦.

**조치**: target 태스크가 completed이면 해당 의존성을 무시.

```typescript
if (target.status === 'completed') continue;
```

**테스트 추가**: 2개

| 테스트명                                                   | 검증 내용                                  |
| ---------------------------------------------------------- | ------------------------------------------ |
| `should ignore addBlocks when target task is completed`    | blocks 대상이 completed면 의존성 미추가    |
| `should ignore addBlockedBy when target task is completed` | blockedBy 대상이 completed면 의존성 미추가 |

---

### Issue 5. [MEDIUM] TaskStore — 순환 의존성 감지 부재

**문제**: A→B→C→A 같은 순환 의존성(cycle)을 방지하는 로직이 없어, 순환 그래프
생성 시 getOpenBlockers 등에서 무한 루프 또는 논리적 교착 발생 가능.

**조치**: BFS 기반 `wouldCreateCycle()` 메서드를 추가하여, 의존성 추가 전에 순환
여부를 검증. 순환이 감지되면 해당 의존성을 무시(silent skip).

```typescript
private wouldCreateCycle(
  taskId: string,
  targetId: string,
  direction: 'blocks' | 'blockedBy',
): boolean {
  const visited = new Set<string>();
  const queue: string[] = [targetId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === taskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const currentTask = this.tasks.get(current);
    if (!currentTask) continue;
    for (const next of currentTask[direction]) {
      if (!visited.has(next)) queue.push(next);
    }
  }
  return false;
}
```

**테스트 추가**: 4개

| 테스트명                                              | 검증 내용                  |
| ----------------------------------------------------- | -------------------------- |
| `should prevent direct cycle: A blocks B, B blocks A` | 직접 순환 방지             |
| `should prevent indirect cycle: A→B→C→A`              | 간접 순환 (3-hop) 방지     |
| `should prevent cycle via blockedBy: A↔B`            | blockedBy 방향 순환 방지   |
| `should allow valid non-cyclic dependencies`          | 다이아몬드 DAG는 정상 허용 |

---

## 3. 검증 결과

| 검증 항목                     | 결과            |
| ----------------------------- | --------------- |
| Core typecheck                | 0 에러 ✅       |
| Lint (변경 파일 3개)          | 0 에러 ✅       |
| TaskStore 단위 테스트         | 75/75 passed ✅ |
| AskUserDialog 단위 테스트     | 29/29 passed ✅ |
| useAskUserHandler 단위 테스트 | 10/10 passed ✅ |
| Phase 5 통합 테스트           | 17/17 passed ✅ |

---

## 4. 이슈 대응 요약

| #   | 심각도 | 이슈                         | 조치                         | 상태 |
| --- | ------ | ---------------------------- | ---------------------------- | ---- |
| 1   | HIGH   | Multi-select 구분자 충돌     | JSON 배열 직렬화 + 폴백 파싱 | ✅   |
| 2   | MEDIUM | 동시 요청 자동 취소 문서화   | 상세 주석 추가 (의도적 설계) | ✅   |
| 3   | MEDIUM | Space Type-to-jump 포함      | charCode > 32 변경           | ✅   |
| 4   | MEDIUM | Completed target 의존성 허용 | completed 가드 추가          | ✅   |
| 5   | MEDIUM | 순환 의존성 미감지           | BFS 순환 탐지 + 테스트 4개   | ✅   |

---

**작성일**: 2026-03-02 **상태**: ✅ 종합 리뷰 이슈 5건 전체 수정 완료
