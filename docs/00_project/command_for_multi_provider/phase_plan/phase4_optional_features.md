# Phase 4: 부가 기능 (선택)

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 테스트
> 먼저 작성 → 최소 코드 구현 → 리팩터링 **리팩터링 원칙**: "Make it work → Make
> it right → Make it fast" **참고 문서**:
>
> - [99_TDD_plan.md](../../ai_adapter/template/99_TDD_plan.md) - TDD 방법론
> - [원본 수정방안 §3.4](../stats_MultiProviderSupport_plan_20260218.md) - Phase
>   4 상세
> - [메인 계획서](./00_main_plan.md)
>
> **작업 분할 규칙**: 최대 2일 이내 완료, 기능별 독립 구현 가능

---

## 📋 작업 개요

| 항목        | 내용                                                                                                                                                |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase       | Phase 4 (선택 — 각 기능 독립)                                                                                                                       |
| 목표        | `/stats --provider` 필터, 비용 추정, 프로바이더별 소계                                                                                              |
| 영향 범위   | `statsCommand.ts`, `StatsDisplay.tsx`, `uiTelemetry.ts`, 신규 파일                                                                                  |
| 위험 수준   | 🟢 Low (기존 기능 변경 없이 추가만)                                                                                                                 |
| 성능 민감도 | 🟢 Low                                                                                                                                              |
| 선행 Phase  | **Phase 1 (최소)** — F4-1/F4-3/F4-4는 Phase 1만으로 구현 가능. F4-2(비용 추정)도 Phase 1의 provider 필드만 필요. Phase 3는 쿼타 UI 연동 시에만 필요 |
| 예상 소요   | 기능당 0.5~1일, 전체 1~2일                                                                                                                          |

### 기능 목록

| 기능 ID | 기능                            | 독립 구현 | 선행 조건                 |
| ------- | ------------------------------- | --------- | ------------------------- |
| F4-1    | `/stats --provider` 필터 플래그 | ✅        | Phase 1 (provider 필드)   |
| F4-2    | 비용 추정 표시                  | ✅        | Phase 1 (provider 필드)   |
| F4-3    | 프로바이더별 소계 행            | ✅        | Phase 1 (provider 그룹핑) |
| F4-4    | ProviderSummary 집계            | ✅        | Phase 1 (provider 필드)   |

---

## 🚨 핵심 리스크

| 리스크                             | 영향      | 대응 방안                                | 상태 |
| ---------------------------------- | --------- | ---------------------------------------- | ---- |
| 가격 정보 하드코딩 (F4-2)          | 🟡 Medium | 정적 테이블로 관리, 주기적 업데이트 안내 | ⬜   |
| 프로바이더별 소계 연산 오류 (F4-3) | 🟢 Low    | TDD로 소계 로직 검증                     | ⬜   |

---

## F4-1: `/stats --provider` 필터 플래그

### F4-1.1 사전 작업 (Pre-Work)

- [ ] **[CONTEXT]** 기능 목적 확인
  - `/stats --provider claude` → Claude 모델만 필터링하여 표시
  - `/stats --provider gemini` → Gemini 모델만 표시
  - 미지정 시 기존과 동일 (전체 표시)

- [ ] **[ANALYSIS]** 현재 코드 분석
  - `packages/cli/src/ui/commands/statsCommand.ts`: 현재 인자 파싱 방식
  - CLI 플래그 전달 패턴 (기존 --provider 플래그 존재 여부)

### F4-1.2 🔴 RED Phase

- [ ] **[RED]** `--provider` 플래그 파싱 테스트

  **파일**: `packages/cli/src/ui/commands/statsCommand.test.ts`

  ```typescript
  describe('/stats --provider flag', () => {
    it('should filter models by specified provider', () => {
      // Arrange: metrics with gemini + claude models
      // Act: statsCommand with --provider claude
      // Assert: only claude models in output
    });

    it('should show all models when --provider not specified', () => {
      // Arrange: metrics with gemini + claude models
      // Act: statsCommand without --provider
      // Assert: all models in output
    });

    it('should show empty message for unknown provider', () => {
      // Act: statsCommand with --provider unknown
      // Assert: "No stats for provider: unknown" message
    });
  });
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인

### F4-1.3 🟢 GREEN Phase

- [ ] **[TASK-001]** statsCommand에 --provider 플래그 파싱 추가
  - 파일: `packages/cli/src/ui/commands/statsCommand.ts`
  - 변경: 인자에서 `--provider <name>` 추출 → 모델 필터링
  - 예상 소요: 30분

- [ ] **[GREEN-VERIFY]** 테스트 통과 확인

### F4-1.4 🔵 REFACTOR Phase

- [ ] **[REFACTOR]** 플래그 파싱 로직 분리 검토

### F4-1.5 사후 작업 (Post-Work)

- [ ] **[TEST]** 테스트 실행
- [ ] **[LINT]** 린터 검사
- [ ] **[COMMIT]**
  ```bash
  git commit -m "feat(stats): /stats --provider 필터 플래그 추가 (Phase 4-1)"
  ```

---

## F4-2: 비용 추정 표시

### F4-2.1 사전 작업 (Pre-Work)

- [ ] **[CONTEXT]** 기능 목적 확인
  - 세션 중 사용한 토큰에 대한 예상 비용을 프로바이더별로 표시
  - 형식: `Estimated Cost: $0.12 (Gemini $0.05 + Claude $0.07)`

- [ ] **[ANALYSIS]** 가격 데이터 구조 설계
  ```typescript
  interface ProviderPricing {
    provider: string;
    models: Record<
      string,
      {
        inputPerMToken: number; // USD per 1M input tokens
        outputPerMToken: number; // USD per 1M output tokens
        cachedPerMToken?: number; // USD per 1M cached tokens
      }
    >;
  }
  ```
  - 가격 정보는 정적 테이블로 관리
  - 주요 모델만 포함 (gemini-2.5-pro/flash, claude-opus/sonnet/haiku,
    gpt-5.2/4.1/o3/o4-mini)

### F4-2.2 🔴 RED Phase

- [ ] **[RED]** 비용 계산 로직 테스트

  **파일**: `packages/core/src/telemetry/costEstimation.test.ts` (신규)

  ```typescript
  describe('estimateSessionCost', () => {
    it('should calculate cost based on input/output tokens and pricing', () => {
      const metrics = {
        'gemini::gemini-2.5-pro': { provider: 'gemini', tokens: { input: 50000, candidates: 3000, ... } },
        'claude::claude-sonnet-4': { provider: 'claude', tokens: { input: 30000, candidates: 2000, ... } },
      };
      const cost = estimateSessionCost(metrics);
      expect(cost.total).toBeGreaterThan(0);
      expect(cost.byProvider['gemini']).toBeGreaterThan(0);
      expect(cost.byProvider['claude']).toBeGreaterThan(0);
    });

    it('should return zero cost for unknown model pricing', () => {
      const metrics = {
        'openai-compatible::custom-model': { provider: 'openai-compatible', tokens: { ... } },
      };
      const cost = estimateSessionCost(metrics);
      expect(cost.total).toBe(0);
    });
  });
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인

### F4-2.3 🟢 GREEN Phase

- [ ] **[TASK-001]** 가격 테이블 정의
  - 파일: `packages/core/src/telemetry/costEstimation.ts` (신규)
  - 변경: `PROVIDER_PRICING` 상수 + `estimateSessionCost()` 함수
  - 예상 소요: 45분

- [ ] **[TASK-002]** StatsDisplay에 비용 표시 추가
  - 파일: `packages/cli/src/ui/components/StatsDisplay.tsx`
  - 변경: 비용 > 0일 때 `Estimated Cost` 행 추가
  - 예상 소요: 30분

- [ ] **[GREEN-VERIFY]** 테스트 통과 확인

### F4-2.4 🔵 REFACTOR Phase

- [ ] **[REFACTOR]** 가격 테이블 외부화 검토 (config 파일?)

### F4-2.5 사후 작업 (Post-Work)

- [ ] **[TEST]** 테스트 실행
- [ ] **[LINT]** 린터 검사
- [ ] **[COMMIT]**
  ```bash
  git commit -m "feat(stats): 세션 비용 추정 표시 추가 (Phase 4-2)"
  ```

---

## F4-3: 프로바이더별 소계 행

### F4-3.1 사전 작업 (Pre-Work)

- [ ] **[CONTEXT]** 기능 목적 확인
  - 프로바이더 그룹 하단에 소계 행 표시
  - 예: Gemini 그룹 하단에 "Gemini Subtotal" 행

### F4-3.2 🔴 RED Phase

- [ ] **[RED]** 프로바이더 소계 행 렌더링 테스트

  **파일**: `packages/cli/src/ui/components/StatsDisplay.test.tsx`

  ```typescript
  it('should render subtotal row for each provider group', () => {
    // Arrange: multiple models per provider
    // Assert: "Gemini Subtotal", "Claude Subtotal" 행 존재
  });

  it('should not render subtotal when provider has single model', () => {
    // Arrange: each provider with single model
    // Assert: subtotal 행 미렌더
  });
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인

### F4-3.3 🟢 GREEN Phase

- [ ] **[TASK-001]** 소계 연산 + 행 렌더링
  - 파일: `packages/cli/src/ui/components/StatsDisplay.tsx`
  - 변경: 그룹별 토큰/요청 합산 → 소계 행 렌더링 (2+ 모델일 때만)
  - 예상 소요: 45분

- [ ] **[GREEN-VERIFY]** 테스트 통과 확인

### F4-3.4 🔵 REFACTOR Phase

- [ ] **[REFACTOR]** 소계 계산 로직을 별도 함수로 추출

### F4-3.5 사후 작업 (Post-Work)

- [ ] **[TEST]** 테스트 실행
- [ ] **[LINT]** 린터 검사
- [ ] **[COMMIT]**
  ```bash
  git commit -m "feat(stats): 프로바이더별 소계 행 추가 (Phase 4-3)"
  ```

---

## F4-4: ProviderSummary 집계

### F4-4.1 사전 작업 (Pre-Work)

- [ ] **[CONTEXT]** 기능 목적 확인
  - `SessionMetrics`에 프로바이더 레벨 집계 추가
  - `/stats session`에서 프로바이더별 총 요청/토큰 요약 표시

### F4-4.2 🔴 RED Phase

- [ ] **[RED]** ProviderSummary 집계 테스트

  **파일**: `packages/core/src/telemetry/uiTelemetry.test.ts`

  ```typescript
  describe('ProviderSummary', () => {
    it('should aggregate metrics by provider', () => {
      // Arrange: multiple models across providers
      // Act: getProviderSummary()
      // Assert: provider-level totalRequests, totalTokens
    });
  });
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인

### F4-4.3 🟢 GREEN Phase

- [ ] **[TASK-001]** ProviderSummary 인터페이스 + 집계 함수
  - 파일: `packages/core/src/telemetry/uiTelemetry.ts`
  - 변경: `getProviderSummary(): Record<string, ProviderSummary>` 메서드
  - 예상 소요: 30분

- [ ] **[GREEN-VERIFY]** 테스트 통과 확인

### F4-4.4 🔵 REFACTOR Phase

- [ ] **[REFACTOR]** 캐싱 검토 (매 호출 재계산 vs 이벤트별 점진 집계)

### F4-4.5 사후 작업 (Post-Work)

- [ ] **[TEST]** 테스트 실행
- [ ] **[LINT]** 린터 검사
- [ ] **[COMMIT]**
  ```bash
  git commit -m "feat(telemetry): ProviderSummary 집계 추가 (Phase 4-4)"
  ```

---

## 사후 작업 — Phase 4 전체

- [ ] **[TEST]** 전체 테스트 실행

  ```bash
  npm run test
  ```

- [ ] **[TYPECHECK]** 타입체크

  ```bash
  npm run typecheck
  ```

- [ ] **[LINT]** 린터 검사

  ```bash
  npm run lint
  ```

- [ ] **[DOC]** 작업 결과서 작성
  - 파일: `../working_history/Phase4_OptionalFeatures_{작업일자}.md`
  - 각 기능(F4-1~F4-4)별 구현 결과 요약

---

## ⚠️ 주의사항

1. **독립 구현**: 각 기능은 독립적으로 구현/커밋 가능 — 필요한 기능만 선택 구현
2. **가격 정보 하드코딩**: F4-2의 가격 테이블은 정적 관리 — 주기적 업데이트 필요
   안내 포함
3. **소계 조건**: F4-3의 소계 행은 프로바이더 내 2개 이상 모델일 때만 표시
4. **ProviderSummary 성능**: F4-4의 집계 함수가 매 호출 재계산이면 모델 수 많을
   때 latency 고려

---

**작성일**: 2026-02-18 **작성자**: AI Assistant **상태**: ⬜ 작성 중
