# Phase 4 작업 결과서 — 부가 기능 (선택)

- **작업일**: 2026-02-21
- **브랜치**: `v0.2.0/se_manager_agent`
- **상태**: ✅ 완료
- **참조 계획서**:
  `docs/00_project/command_for_multi_provider/phase_plan/phase4_optional_features.md`
- **선행 Phase**: Phase 1 (provider 필드), Phase 2 (cacheCreation 토큰)

## 작업 목표

`/stats` 명령어에 4개의 독립적 부가 기능을 추가한다:

1. **F4-4**: ProviderSummary 집계 (프로바이더 수준 메트릭 요약)
2. **F4-1**: `/stats --provider` 필터 플래그 (프로바이더별 필터링)
3. **F4-3**: 프로바이더별 소계 행 (다중 모델 그룹 소계)
4. **F4-2**: 비용 추정 표시 (정적 가격표 기반 세션 비용 산출)

## 구현 순서 및 결과

### F4-4: ProviderSummary 집계

| 순서 | TASK     | 작업 내용                                                        | 테스트 결과    |
| ---- | -------- | ---------------------------------------------------------------- | -------------- |
| 1    | RED      | uiTelemetry.test.ts: getProviderSummary() 테스트 3개 추가        | 3 FAIL (예상)  |
| 2    | GREEN    | uiTelemetry.ts: ProviderSummary interface + getProviderSummary() | 3/3 PASS       |
| 3    | REFACTOR | 코드 검토 (단순 집계 함수 — 추가 리팩터 불요)                    | —              |
| 4    | EXPORT   | core/index.ts: ProviderSummary + getProviderSummary export 추가  | TS 컴파일 통과 |

### F4-1: `/stats --provider` 필터 플래그

| 순서 | TASK     | 작업 내용                                                  | 테스트 결과    |
| ---- | -------- | ---------------------------------------------------------- | -------------- |
| 1    | RED      | statsCommand.test.ts: --provider 파싱 테스트 3개           | 3 FAIL (예상)  |
| 2    | RED      | StatsDisplay.test.tsx: providerFilter prop 테스트 2개      | 2 FAIL (예상)  |
| 3    | GREEN    | statsCommand.ts: parseProviderFlag() + providerFilter 전달 | 3/3 PASS       |
| 4    | GREEN    | types.ts: HistoryItemStats.providerFilter 필드 추가        | TS 컴파일 통과 |
| 5    | GREEN    | StatsDisplay.tsx: providerFilter prop + models 필터링      | 2/2 PASS       |
| 6    | GREEN    | HistoryItemDisplay.tsx: providerFilter prop 전달           | PASS           |
| 7    | REFACTOR | parseProviderFlag → 정규식 추출 함수 분리                  | —              |

### F4-3: 프로바이더별 소계 행

| 순서 | TASK     | 작업 내용                                                         | 테스트 결과   |
| ---- | -------- | ----------------------------------------------------------------- | ------------- |
| 1    | RED      | StatsDisplay.test.tsx: 소계 행 렌더링 테스트 3개                  | 3 FAIL (예상) |
| 2    | GREEN    | StatsDisplay.tsx: buildModelRows 소계 로직 + isSubtotal 스타일링  | 3/3 PASS      |
| 3    | REFACTOR | 소계 계산 로직을 buildModelRows 내부 인라인 유지 (별도 함수 불요) | —             |

### F4-2: 비용 추정 표시

| 순서 | TASK      | 작업 내용                                                                     | 테스트 결과    |
| ---- | --------- | ----------------------------------------------------------------------------- | -------------- |
| 1    | RED       | costEstimation.test.ts: 가격표 + estimateCost + formatCostString 12개         | 9 FAIL (예상)  |
| 2    | GREEN     | costEstimation.ts: MODEL_PRICING 테이블 + estimateCost() + formatCostString() | 12/12 PASS     |
| 3    | GREEN     | core/index.ts: costEstimation export 추가                                     | TS 컴파일 통과 |
| 4    | GREEN     | StatsDisplay.tsx: Estimated Cost 표시 섹션 추가                               | PASS           |
| 5    | RED+GREEN | StatsDisplay.test.tsx: 비용 렌더링 테스트 2개                                 | 2/2 PASS       |
| 6    | SNAPSHOT  | SessionSummaryDisplay + StatsDisplay 스냅샷 업데이트                          | 전체 PASS      |

## 변경 파일 목록

### 신규 파일 (2)

| 파일                                              | 설명                                |
| ------------------------------------------------- | ----------------------------------- |
| `packages/core/src/config/costEstimation.ts`      | 정적 가격표 + 비용 계산 + 포맷 함수 |
| `packages/core/src/config/costEstimation.test.ts` | 비용 추정 단위 테스트 (12 tests)    |

### 수정 파일 (10)

| 파일                                                                               | 변경 내용                                      | 기능             |
| ---------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------- |
| `packages/core/src/telemetry/uiTelemetry.ts`                                       | ProviderSummary interface + getProviderSummary | F4-4             |
| `packages/core/src/telemetry/uiTelemetry.test.ts`                                  | getProviderSummary 테스트 3개                  | F4-4             |
| `packages/core/src/index.ts`                                                       | ProviderSummary + costEstimation export        | F4-4, F4-2       |
| `packages/cli/src/ui/commands/statsCommand.ts`                                     | parseProviderFlag + providerFilter 전달        | F4-1             |
| `packages/cli/src/ui/commands/statsCommand.test.ts`                                | --provider 파싱 테스트 3개                     | F4-1             |
| `packages/cli/src/ui/types.ts`                                                     | HistoryItemStats.providerFilter 필드           | F4-1             |
| `packages/cli/src/ui/components/StatsDisplay.tsx`                                  | providerFilter + 소계 행 + 비용 표시           | F4-1, F4-3, F4-2 |
| `packages/cli/src/ui/components/StatsDisplay.test.tsx`                             | 필터 2개 + 소계 3개 + 비용 2개 테스트          | F4-1, F4-3, F4-2 |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`                            | providerFilter prop 전달                       | F4-1             |
| `packages/cli/src/ui/components/__snapshots__/StatsDisplay.test.tsx.snap`          | 스냅샷 갱신                                    | —                |
| `packages/cli/src/ui/components/__snapshots__/SessionSummaryDisplay.test.tsx.snap` | 스냅샷 갱신                                    | —                |

## 핵심 설계 결정

### F4-4: ProviderSummary

- `UiTelemetryService.getProviderSummary()` 매 호출 재계산 방식 채택
- 모델 수가 적어(`<20`) 캐싱 오버헤드 대비 이점 없음
- `parseCompositeKey()`로 `"provider::model"` 키에서 provider 추출 → 집계

### F4-1: --provider 필터

- `parseProviderFlag(args)` 정규식 기반 파싱 → `providerFilter` prop 전달
- `StatsDisplay` 내부에서 `parseCompositeKey` 기반 필터링 — 기존 코드 최소 변경
- 미지정 시 기존 동작 100% 유지 (undefined → 전체 표시)

### F4-3: 소계 행

- `hasMultipleProviders && entries.length >= 2` 조건으로 소계 표시
- 단일 프로바이더거나 프로바이더 내 1개 모델이면 소계 미표시
- `isSubtotal` 플래그로 dimColor 스타일 적용 → 일반 행과 시각적 구분

### F4-2: 비용 추정

- 정적 가격표 (`MODEL_PRICING`) — 주요 모델 12개 수록 (Gemini 3, Claude 3,
  OpenAI 6)
- `estimateCost()` 순수 함수: 캐시 토큰 분리 계산
  (`nonCachedInput * inputRate + cached * cachedRate`)
- `cachedPerMToken` 미정의 시 `inputPerMToken`으로 폴백
- 미등록 모델은 비용 0 (무시) — `openai-compatible` 등 커스텀 프로바이더 안전
  처리
- `formatCostString()`: 단일 프로바이더 → `$0.12`, 다중 →
  `$0.12 (Gemini $0.05 + Claude $0.07)`
- 매우 소액(`< $0.01`) → `"< $0.01"` 표시

## 가격표 (MODEL_PRICING)

| Provider | Model                      | Input/MTok | Output/MTok | Cached/MTok |
| -------- | -------------------------- | ---------- | ----------- | ----------- |
| gemini   | gemini-2.5-pro             | $1.25      | $10.00      | $0.125      |
| gemini   | gemini-2.5-flash           | $0.30      | $2.50       | $0.03       |
| gemini   | gemini-2.5-flash-lite      | $0.10      | $0.40       | $0.01       |
| claude   | claude-opus-4-6            | $5.00      | $25.00      | $0.50       |
| claude   | claude-sonnet-4-5-20250929 | $3.00      | $15.00      | $0.30       |
| claude   | claude-haiku-4-5-20251001  | $1.00      | $5.00       | $0.10       |
| openai   | gpt-5.2                    | $1.25      | $10.00      | $0.625      |
| openai   | gpt-5-mini                 | $0.40      | $1.60       | $0.10       |
| openai   | gpt-4.1                    | $2.00      | $8.00       | $0.50       |
| openai   | gpt-4.1-mini               | $0.40      | $1.60       | $0.10       |
| openai   | o3                         | $2.00      | $8.00       | —           |
| openai   | o4-mini                    | $1.10      | $4.40       | $0.275      |

## 검증 결과

```
Core:  287 test files, 5736 passed, 0 failed
CLI:   702 test files, 9594 passed, 0 failed
TS:    0 errors (core + cli)
Lint:  0 issues
```

## 이슈 및 해결

| #   | 이슈                                          | 원인                                                      | 해결                                      |
| --- | --------------------------------------------- | --------------------------------------------------------- | ----------------------------------------- |
| 1   | SessionSummaryDisplay 스냅샷 실패             | StatsDisplay 내부 렌더 변경 → 소비 컴포넌트 스냅샷 불일치 | 스냅샷 갱신 (`vitest --update`)           |
| 2   | ESLint array-type 위반 (StatsDisplay.tsx:129) | `ReturnType<typeof fn>[]` → non-simple type에 T[] 금지    | `Array<ReturnType<typeof makeActiveRow>>` |

## DoD 체크리스트

1. ✅ F4-4: ProviderSummary interface + getProviderSummary() core export
2. ✅ F4-1: `/stats --provider <name>` 플래그 파싱 + 필터링
3. ✅ F4-1: 미지정 시 기존 동작 유지 + 미등록 프로바이더 빈 테이블
4. ✅ F4-3: 프로바이더 내 2+ 모델일 때 소계 행 표시
5. ✅ F4-3: 단일 모델 프로바이더 소계 미표시
6. ✅ F4-2: MODEL_PRICING 정적 가격표 (12 모델)
7. ✅ F4-2: estimateCost() + formatCostString() core export
8. ✅ F4-2: StatsDisplay에 Estimated Cost 조건부 렌더링
9. ✅ F4-2: 캐시 토큰 분리 계산 (nonCached × inputRate + cached × cachedRate)
10. ✅ 전체 테스트 통과 (core + cli)
11. ✅ 타입체크 + 린터 통과
12. ✅ 기존 기능 미변경 (additive-only)

## 부록: 루트 빌드에 의한 소스 디렉토리 오염 이슈

### 발생 경위

Phase 4 F4-2 구현 중 `costEstimation.ts` 컴파일 확인을 위해 **프로젝트
루트에서** 다음 명령을 실행:

```bash
npx tsc --build --listEmittedFiles 2>&1 | grep "costEstimation"
```

### 결과

루트 `tsconfig.json`에 `outDir`가 미설정되어 있어 프로젝트 전체 `.ts` 파일의
빌드 아티팩트(`.js`, `.d.ts`, `.js.map`)가 소스 파일 옆에 생성됨 (4,539개).

### 원인

| 항목      |      루트 tsconfig      |  패키지 tsconfig  |
| --------- | :---------------------: | :---------------: |
| `outDir`  | **없음** (소스 옆 출력) |     `"dist"`      |
| `include` | **없음** (전체 컴파일)  | `["src/**/*.ts"]` |
| 용도      |     옵션 상속 전용      |   **빌드 대상**   |

루트 `tsconfig.json`은 빌드용이 아닌 **공유 컴파일러 옵션 상속용**이나,
`composite: true` 설정으로 인해 `tsc --build`의 빌드 대상으로 인식됨.

### 조치

1. 아티팩트 전체 삭제 (4,538개 파일)
2. `.gitignore`에 소스 디렉토리 빌드 아티팩트 패턴 추가 (재발 방지)
3. `CLAUDE.md`, `CONTRIBUTING.md`에 루트 빌드 금지 경고 추가

### 교훈

- `tsc --build`는 반드시 **패키지 디렉토리 내부에서** 또는
  `npm run build -w <패키지>`로 실행
- 루트에서 직접 `tsc`/`tsc --build` 실행 금지

## 부록 B: idle render loop 에러 수정 및 렌더 안정화

### 작업일: 2026-02-21

### 브랜치: `v0.2.0/stats_multi_provider`

### 증상

앱 기동 직후 DebugProfiler가 다음 에러를 출력:

```
5 frames rendered while the app was idle in the past second.
This likely indicates severe infinite loop React state management bugs.
```

Phase 4 변경 이전에는 발생하지 않던 에러.

### 근본 원인

`slashCommandProcessor.ts:150` — Phase 4에서 추가한 `useEffect`에 **의존성 배열
누락**.

```typescript
// Before: 매 렌더마다 실행 (React 명세상 deps 없음 = every render)
useEffect(() => {
  if (!config) return;
  const gen = config.getContentGenerator();
  if (gen !== lastBoundGeneratorRef.current) {
    if (gen && 'setProviderQuotaService' in gen) {
      (gen as ...).setProviderQuotaService(providerQuotaService);
    }
    lastBoundGeneratorRef.current = gen;
  }
});  // ← NO dependency array
```

startup 시 10~20회 렌더 발생 → 매번 effect 실행 → idle 구간(±500ms 내 action
없음)에 프레임이 누적되어 5프레임 임계값 초과.

### 수정 내용

| #   | 파일                              | 변경                                                                                                   | 성격                               |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| 1   | `slashCommandProcessor.ts:150`    | `useEffect(() => { ... })` → `useEffect(() => { ... }, [config, providerQuotaService, reloadTrigger])` | **영구적** — 실행 횟수 구조적 감소 |
| 2   | `StatsDisplay.tsx`                | `useMemo` 래핑: models 필터링, computeSessionStats, estimateCost                                       | **영구적** — 참조 안정성 보장      |
| 3   | `StatsDisplay.tsx`                | IIFE 패턴 → 직접 조건부 렌더로 단순화                                                                  | 코드 품질 개선                     |
| 4   | `loggingContentGenerator.test.ts` | `LlmEventType.MessageStart`/`Text` → `TextDelta`, `stopReason` → `finishReason`                        | 타입 호환 수정                     |

### 수정이 영구적인 이유

이 수정은 타이밍/임계값 조정이 아닌 **React 실행 규칙 변경**:

| 항목                 | Before        | After            |
| -------------------- | ------------- | ---------------- |
| effect 실행 조건     | 모든 렌더 후  | deps 변경 시에만 |
| startup 시 실행 횟수 | 10~20회       | 1~2회            |
| 시스템 부하 영향     | 받음 (확률적) | 안 받음 (결정적) |

### 전수 조사 결과 — 다른 경로 재발 가능성

CLI 전체(171+ useEffect) 조사 결과:

| 패턴                       | 발견 수 | 위험도 | 판정                  |
| -------------------------- | ------- | ------ | --------------------- |
| deps 없는 `useEffect`      | 2건     | —      | 둘 다 의도적 설계     |
| `setInterval` + state 갱신 | 7건     | —      | 모두 적절한 가드 존재 |

**deps 없는 useEffect 상세:**

| 파일                    | 라인 | 목적                                  | 판정                                       |
| ----------------------- | ---- | ------------------------------------- | ------------------------------------------ |
| `useFlickerDetector.ts` | 28   | 매 렌더마다 DOM 측정 (flicker 감지용) | 의도적 — hook 목적 자체가 매 렌더 감시     |
| `useSessionResume.ts`   | 48   | ref 최신화 (stale closure 방지 패턴)  | 의도적 — side effect 없음, React 공식 패턴 |

**결론: 현재 코드베이스에서 동일 경로의 재발 가능성 없음.**

### 검증 결과

```
loggingContentGenerator: 24/24 ✅
StatsDisplay:            28/28 ✅
slashCommandProcessor:   35/35 ✅
statsCommand:             8/8 ✅
Build (core + cli):       ✅
```

## 다음 단계

- 가격표 주기적 업데이트 필요 (API 가격 변동 시)
- 향후 `providerModels.ts`에 가격 정보 통합 검토 가능
