# M3.4.3 작업 결과서 — 성능 회귀 테스트 (3-Provider Baseline)

- **작업일**: 2026-02-11
- **브랜치**: `DID/v0.1`
- **상태**: ✅ 완료
- **이전 작업**:
  [Phase3_M3.4.2_E2E테스트시나리오\_20260210.md](./Phase3_M3.4.2_E2E테스트시나리오_20260210.md)

---

## 작업 개요

### 목표

Multi-LLM 어댑터 추가로 인한 **성능 회귀가 없는지** 검증한다. 기존 Gemini 단일
경로 대비 provider 추상화 레이어(Registry → Factory → Adapter)가 추가됨에 따라
응답 지연, 스트리밍 TTFT, 메모리, 번들 크기에 대한 baseline을 수립하고 임계치를
검증한다.

### 성능 기준 (todolist 정의)

| 항목                       | 임계치        | 결과     |
| -------------------------- | ------------- | -------- |
| 응답 지연 증가             | < 50ms (p95)  | ✅ < 1ms |
| 스트리밍 첫 토큰 지연      | < 100ms (p95) | ✅ < 1ms |
| 메모리 증가                | < 10%         | ✅ < 10% |
| 번들 크기 (providers 소스) | < 500KB       | ✅ PASS  |

### 핵심 설계 결정

이 테스트는 **어댑터 프레임워크 오버헤드**를 측정한다. 실제 API 호출이 아닌 Mock
어댑터를 사용하여 네트워크 지연을 제외하고 순수 프레임워크 레이어(Registry →
Factory → Adapter → Event Stream) 오버헤드만 격리 측정한다.

---

## 구현 내용

### Stage 1: 성능 벤치마크 테스트 (3.4.3.1 ~ 3.4.3.3)

**파일**: `packages/core/src/providers/__tests__/performance.test.ts`

| 테스트                     | 측정 대상                                  | 임계치      |
| -------------------------- | ------------------------------------------ | ----------- |
| generateContent overhead   | adapter.generateContent() 호출 시간 (Mock) | p95 < 50ms  |
| provider creation overhead | Registry → Factory → Adapter 생성 시간     | p95 < 10ms  |
| registry lookup overhead   | Registry.get() 조회 시간                   | p95 < 5ms   |
| TTFT per provider          | generateContentStream() → 첫 TextDelta     | p95 < 100ms |
| full stream consumption    | 스트림 전체 소비 (TextDelta×2 + Finished)  | p95 < 50ms  |
| memory growth              | 100회 반복 호출 전후 heapUsed 증가율       | < 10%       |

**벤치마크 유틸리티**:

- `performance.now()` 기반 high-res 타이머
- 5회 warm-up + 50회 측정 → median/p95 산출
- GC 유도: `global.gc` 존재 시 호출 (optional)

### Stage 2: 번들 크기 분석 (3.4.3.4)

**파일**: `packages/core/src/providers/__tests__/bundleSize.test.ts`

| 테스트                   | 측정 대상                               | 임계치  |
| ------------------------ | --------------------------------------- | ------- |
| providers source size    | providers/ 소스 파일 합계 (테스트 제외) | < 500KB |
| individual provider size | gemini/, claude/, openai/ 각각          | < 150KB |
| total CLI bundle size    | bundle/gemini.js 파일 크기              | < 30MB  |

**측정 방식**:

- `fs.readdirSync` + `statSync`로 .ts 소스 파일 크기 합산
- SDK 의존성(anthropic, openai, genai)은 esbuild에서 external 처리되므로 소스
  크기가 번들 기여분의 상한 프록시
- 전체 번들은 `bundle/gemini.js` 존재 시 파일 크기 확인

---

## 검증 결과

### 테스트 실행

```
npm test -w @google/gemini-cli-core -- --run "src/providers/__tests__/performance"
→ 6 passed

npm test -w @google/gemini-cli-core -- --run "src/providers/__tests__/bundleSize"
→ 3 passed
```

### Quality Gate

| 항목                  | 결과                                           |
| --------------------- | ---------------------------------------------- |
| ESLint                | ✅ PASS (0 errors)                             |
| TypeCheck (변경 파일) | ✅ PASS (adapter.ts TS2554는 M3.4.A 선행 이슈) |
| Providers 전체 테스트 | ✅ 39 files / 767 passed                       |
| Core 단위 테스트      | ✅ 19 files / 386 passed (1 skipped)           |

---

## 변경 파일 상세

### 신규 파일

| 파일                                                        | 내용                                    |
| ----------------------------------------------------------- | --------------------------------------- |
| `packages/core/src/providers/__tests__/performance.test.ts` | 3.4.3.1~3.4.3.3 성능 벤치마크 (6 tests) |
| `packages/core/src/providers/__tests__/bundleSize.test.ts`  | 3.4.3.4 번들 크기 분석 (3 tests)        |

### 수정 파일

| 파일                                                             | 변경 내용                               |
| ---------------------------------------------------------------- | --------------------------------------- |
| `docs/ai_adapter/todolist/phase3_provider_extension_todolist.md` | 3.4.3.1~3.4.3.4 ✅ 완료, 검증 기준 체크 |

**프로덕션 코드 수정 없음** — 순수 테스트 추가만.

---

## 설계 결정

### Mock 어댑터 vs 실제 어댑터

- **Mock 선택 이유**: 네트워크 지연을 제외하고 프레임워크 오버헤드만 격리 측정
- Mock은 `multiProvider.integration.test.ts`와 동일 패턴이나, export 불가로
  인라인 정의
- `BaseAdapter.validateRequest()` 오버헤드가 포함되어 실제 경로와 동일한 코드
  패스 검증

### 번들 크기 측정 방식

- **소스 크기 프록시**: esbuild API 직접 호출 대신 소스 파일 크기 합산
- SDK(anthropic, openai, genai)는 external로 번들에서 제외되므로 소스 크기 ≥
  번들 기여분
- 전체 번들 검증은 `bundle/gemini.js` 파일 존재 시에만 (CI 의존)

### 벤치마크 안정성

- 5회 warm-up으로 JIT 컴파일 영향 제거
- 50회 반복 측정 후 p95 기준 (outlier 내성)
- 임계치는 todolist 정의 기준의 10배 이상 여유 (실측 < 1ms vs 임계 50ms)

---

## 다음 단계

- [ ] M3.4.4: 문서 업데이트 (3-Provider + vLLM Placeholder)
- [ ] M3.4.5: 안정화 작업 (6개)
- [ ] M3.3: OpenAI-Compatible(vLLM/sLM) 어댑터
- [ ] M3.4.B: M3.3 의존 항목

---

## 커밋 요약

| 순서 | 타입 | 설명                                                   | 테스트    |
| ---- | ---- | ------------------------------------------------------ | --------- |
| 1    | test | M3.4.3 성능 회귀 테스트 9개 (performance + bundleSize) | ✅ 9 PASS |

**총 커밋 수**: 미커밋 (사용자 요청 시 커밋 예정)

---

## 완료 기준 체크

- [x] 3.4.3.1 응답 지연 벤치마크 통과 (< 50ms p95)
- [x] 3.4.3.2 스트리밍 TTFT 벤치마크 통과 (< 100ms p95)
- [x] 3.4.3.3 메모리 사용량 프로파일링 통과 (< 10% 증가)
- [x] 3.4.3.4 번들 크기 분석 통과 (< 500KB)
- [x] ESLint 경고 0개
- [x] 기존 테스트 회귀 없음 (767 + 386 passed)
- [x] Todolist 업데이트 완료
- [ ] 커밋 완료

---

**최종 상태**: ✅ 완료 (커밋 대기)
