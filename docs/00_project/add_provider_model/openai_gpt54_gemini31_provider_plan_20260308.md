# OpenAI GPT-5.4 / Gemini 3.1 계열 반영 작업계획서

- 작성일: 2026-03-08
- 대상 저장소: `/Users/junghojang/Developments/didimProject/gemini-cli`
- 목적: 최신 OpenAI/Gemini 모델 상태를 공식 문서 기준으로 재검증하고, 현재
  프로젝트의 provider/model 구성을 안전하게 갱신하기 위한 실행 계획 수립

## 1. 조사 결론

### 1.1 OpenAI

- 2026-03-05 기준 OpenAI는 `gpt-5.4` 계열을 공개했다.
- 2026-03-08 현재 공식 API 문서/가격 페이지 기준으로 확인 가능한 최신 관련
  모델은 `gpt-5.4`, `gpt-5.4-pro`, `gpt-5-mini`다.
- `gpt-5.4-mini`는 현재 공식 문서에서 확인되지 않았다.
- 현재 저장소에는 OpenAI 최신 계열로 `gpt-5.3-codex`까지만 등록되어 있으며
  `gpt-5.4*`는 아직 없다.

### 1.2 Gemini

- 2026-02-19 기준 Google은 Gemini 3.1 계열 출시를 발표했다.
- 다만 2026-03-08 현재 개발자 문서와 모델 페이지에서 실제 API 모델 표기는 아직
  `Gemini 3.1 Pro Preview` / `gemini-3.1-pro-preview`다.
- `gemini-3.1-pro` 안정 ID는 공식 개발자 문서에서 확인되지 않았다.
- 추가로 `gemini-3.1-flash-lite-preview`는 공식 모델 페이지에서 확인된다.
- 즉, 사용자 발표 관점에서는 “Gemini 3.1 출시”가 맞지만, 이 저장소에서 바로
  `gemini-3.1-pro`라는 안정 ID로 치환할 근거는 아직 부족하다.

### 1.3 Gemini의 `high` / 일반 모델 해석

- `high`는 별도 모델명이 아니라 Gemini API의 thinking 설정값이다.
- 공식 thinking 문서 기준으로 Gemini 3.1 Pro는 `low`, `high` thinking level을
  지원하며 기본값은 `high`다.
- 따라서 이번 작업에서 `high`를 새로운 provider 모델로 추가하면 안 된다.
- 현재 저장소의
  [packages/core/src/config/defaultModelConfigs.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/defaultModelConfigs.ts)
  에서 `chat-base-3`가 `ThinkingLevel.HIGH`를 사용하고 있으므로, 이 부분은 이미
  방향이 맞다.

### 1.4 현재 프로젝트에 대한 해석

- OpenAI는 즉시 반영 가능한 상태다.
- Gemini는 이미 `gemini-3.1-pro-preview`가 코드에 반영되어 있으므로, 지금 시점의
  실작업은 “안정판 ID로 교체”가 아니라 “preview 상태를 명확히 유지하고
  문서/표시명을 정리”하는 쪽이 안전하다.
- `gemini-3.1-pro` 안정 ID는 Google 개발자 문서에 실제 API 모델명으로 노출된 뒤
  별도 후속 작업으로 처리해야 한다.
- Gemini 3.1 계열에서 새 반영 후보는 `gemini-3.1-flash-lite-preview`다.
- 다만 Gemini 3 관련 `auto-gemini-3` 라우팅은 현재 코드상 구형
  `gemini-3-pro-preview`를 우선 바라보고 있어, 계획서 범위에 별도 수정 항목을
  반드시 포함해야 한다.

## 2. 저장소 현황

### 2.1 이미 반영된 상태

- [packages/core/src/config/providerModels.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/providerModels.ts)
  - Gemini 목록에 `gemini-3.1-pro-preview`가 이미 존재
  - OpenAI 기본 모델은 `gpt-5.3-codex`
- [packages/core/src/config/models.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/models.ts)
  - `PREVIEW_GEMINI_31_MODEL = 'gemini-3.1-pro-preview'`
- [packages/core/src/config/defaultModelConfigs.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/defaultModelConfigs.ts)
  - Gemini 3.1 preview alias, compression alias, Gemini 3 계열
    `ThinkingLevel.HIGH` 연결 완료
- [packages/core/src/config/config.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/config.ts)
  - quota bucket에서 `gemini-3.1-pro-preview` 접근 여부 검사 중

### 2.2 아직 반영되지 않은 상태

- OpenAI `gpt-5.4`, `gpt-5.4-pro` 미등록
- Gemini `gemini-3.1-flash-lite-preview` 미등록
- [packages/core/src/config/costEstimation.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/costEstimation.ts)
  - OpenAI 가격표가 `gpt-5.2`, `gpt-5-mini`, `gpt-4.1`, `gpt-4.1-mini`, `o3`,
    `o4-mini` 기준
- 문서 다수가 아직 `gpt-4.1` 또는 구형 OpenAI 목록을 노출
  - [docs/providers.md](/Users/junghojang/Developments/didimProject/gemini-cli/docs/providers.md)
  - [docs/cli/model.md](/Users/junghojang/Developments/didimProject/gemini-cli/docs/cli/model.md)
  - [docs/index.md](/Users/junghojang/Developments/didimProject/gemini-cli/docs/index.md)
- `auto-gemini-3` 관련 코드와 테스트가 여전히 `gemini-3-pro-preview`를 기준으로
  움직인다
  - [packages/core/src/config/models.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/models.ts)
  - [packages/core/src/availability/policyCatalog.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/availability/policyCatalog.ts)
  - [packages/core/src/config/models.test.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/models.test.ts)
  - [packages/core/src/availability/policyCatalog.test.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/availability/policyCatalog.test.ts)
  - [packages/core/src/availability/fallbackIntegration.test.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/availability/fallbackIntegration.test.ts)
  - [packages/core/src/routing/strategies/defaultStrategy.test.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/routing/strategies/defaultStrategy.test.ts)

## 3. 작업 방향

### 3.1 즉시 수행 대상

1. OpenAI provider 모델 카탈로그를 `gpt-5.4` 계열 기준으로 갱신한다.
2. OpenAI 기본 추천 모델을 `gpt-5.3-codex`에서 새 기준으로 재설정한다.
3. 가격표, 테스트, 사용자 문서를 함께 갱신한다.
4. Gemini는 `gemini-3.1-pro-preview` 유지 방침을 문서와 UI 설명에 반영한다.
5. Gemini 3.1의 `high`는 모델 추가 대상이 아닌 thinking 설정으로 명시한다.
6. `gemini-3.1-flash-lite-preview` 추가 여부를 별도 판단 항목으로 포함한다.
7. `auto-gemini-3`가 실제로 최신 Gemini 3.1 preview를 우선 바라보도록 라우팅과
   fallback 체인을 같이 보정한다.

### 3.2 지금은 하지 않을 대상

1. `gemini-3.1-pro-preview`를 `gemini-3.1-pro`로 일괄 rename
2. Gemini 기본 모델을 `gemini-2.5-pro`에서 `gemini-3.1-pro`로 교체
3. quota / token / compression 경로에 미검증 stable ID 선반영
4. `high` 또는 `general`을 독립 모델 ID처럼 레지스트리에 추가

## 4. 권장 의사결정

### 4.1 OpenAI 기본 모델

- 권장안: `gpt-5.4`를 OpenAI 기본 추천 모델로 사용
- 근거:
  - `gpt-5.4`는 최신 범용 주력 모델로 보이며, 현재 CLI가 많이 의존하는 도구 사용
    시나리오와 잘 맞는다.
  - `gpt-5.4-pro`는 고성능 추론 계열 후보이지만 일부 도구/기능 지원이 더 좁을 수
    있다.
- 비고:
  - 이 판단은 OpenAI 모델별 기능 표를 기준으로 한 구현 관점의 추론이다.
  - 팀이 “최고 추론 성능 우선”을 원하면 `gpt-5.4-pro`를 수동 선택 모델로 먼저
    노출하고, 기본값은 `gpt-5.4`로 두는 절충안이 적절하다.

### 4.1.1 OpenAI 가격 기준

- 2026-03-08 현재 공식 가격 기준:
  - `gpt-5.4`: Input $2.50 / Cached input $1.25 / Output $15.00
  - `gpt-5.4-pro`: Input $30.00 / Output $180.00
  - `gpt-5-mini`: Input $0.25 / Cached input $0.125 / Output $1.50
- 따라서 기존 리뷰 의견에 포함된 `gpt-5.4`와 `gpt-5-mini` 단가는 공식 페이지와
  일치하지 않으므로 계획서에는 반영하지 않는다.

### 4.2 Gemini 기본 모델

- 권장안: 기본값은 계속 `gemini-2.5-pro`
- 근거:
  - API 안정 ID가 아직 `gemini-3.1-pro`로 확인되지 않았다.
  - 현재 저장소는 preview 모델 접근 여부를 quota 기반으로 판별하고 있어, 무리한
    stable 전환은 회귀 위험이 크다.

### 4.3 Gemini 3.1 Flash-Lite 처리

- 권장안: `gemini-3.1-flash-lite-preview`는 선택적 추가 항목으로 분리
- 근거:
  - 공식 모델 페이지에서 존재는 확인되지만, 현재 프로젝트의 기본 모델 전략과
    직접 연결되지는 않는다.
  - 먼저 OpenAI `gpt-5.4` 반영과 Gemini 3.1 Pro preview 문구 정합성을 맞추는
    것이 우선이다.

## 5. 상세 작업 범위

### Phase 0. Gemini Auto (Gemini 3) 라우팅 정합성 수정

대상 파일:

- [packages/core/src/config/models.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/models.ts)
- [packages/core/src/availability/policyCatalog.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/availability/policyCatalog.ts)
- [packages/core/src/config/models.test.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/models.test.ts)
- [packages/core/src/availability/policyCatalog.test.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/availability/policyCatalog.test.ts)
- [packages/core/src/availability/fallbackIntegration.test.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/availability/fallbackIntegration.test.ts)
- [packages/core/src/routing/strategies/defaultStrategy.test.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/routing/strategies/defaultStrategy.test.ts)
- 관련 Gemini 문서

작업 내용:

1. `resolveModel(PREVIEW_GEMINI_MODEL_AUTO)`가 `PREVIEW_GEMINI_31_MODEL`을
   반환하도록 수정
2. preview availability chain의 1순위 모델이 `gemini-3.1-pro-preview`와
   일치하도록 `policyCatalog.ts` 검토 및 수정
3. `auto-gemini-3` 관련 단위 테스트와 fallback 테스트 기대값을 3.1 기준으로 갱신
4. 문서의 `Auto (Gemini 3)` 설명이 실제 라우팅 대상과 불일치하지 않도록 갱신

완료 조건:

- `auto-gemini-3`가 더 이상 `gemini-3-pro-preview`를 기본 대상으로 사용하지
  않는다.
- auto 경로와 availability fallback 경로가 동일한 1순위 모델을 가리킨다.

### Phase A. OpenAI 모델 레지스트리 갱신

대상 파일:

- [packages/core/src/config/providerModels.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/providerModels.ts)
- [packages/core/src/config/providerModels.test.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/providerModels.test.ts)
- [packages/core/src/providers/providerSelector.test.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/providers/providerSelector.test.ts)
- [packages/cli/src/ui/components/ModelDialog.test.tsx](/Users/junghojang/Developments/didimProject/gemini-cli/packages/cli/src/ui/components/ModelDialog.test.tsx)

작업 내용:

1. OpenAI preset을 `Recommended (gpt-5.4)`로 변경
2. Manual 목록에 `gpt-5.4`, `gpt-5.4-pro`를 추가하고 `gpt-5-mini` 유지 여부를
   함께 검토
3. `gpt-5.4`에 `isDefault: true`를 부여할 경우 기존 `gpt-5.3-codex`의
   `isDefault`는 반드시 제거
4. `gpt-5.3-codex` 유지 여부 결정
   - 유지안: 호환성 보존용으로 manual 목록 하단 잔류
   - 제거안: 최신 모델군만 노출
5. cross-provider fallback 기대값을 `gpt-5.4` 기준으로 갱신

완료 조건:

- `/model` OpenAI 화면에 `gpt-5.4` 계열이 표시된다.
- `getDefaultModelFromRegistry('openai')`가 새 기본 모델을 반환한다.
- OpenAI 모델 배열 내 `isDefault: true`가 하나만 남는다.

### Phase B. OpenAI 가격/통계 보정

대상 파일:

- [packages/core/src/config/costEstimation.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/costEstimation.ts)
- [packages/core/src/config/costEstimation.test.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/costEstimation.test.ts)

작업 내용:

1. OpenAI 공식 가격 페이지 기준으로 `gpt-5.4`, `gpt-5.4-pro`, `gpt-5-mini`
   요율을 정확히 반영
2. `gpt-5.4-pro`는 공식 가격 페이지에서 cached input 단가가 명시되지 않았으므로,
   실제 구현 시 `cachedPerMToken` 생략 여부를 공식 표기 기준으로 결정
3. `gpt-5.3-codex` 유지 시 가격표 유지 여부 결정
4. `costEstimation.test.ts`의 모델 존재/비용 계산 기대값을 새 표 기준으로 갱신
5. `/stats` 비용 추정이 새 모델 ID를 인식하도록 테스트 보강

완료 조건:

- 새 OpenAI 모델 사용량이 비용 계산에서 누락되지 않는다.

### Phase C. Gemini 3.1 문구 정리

대상 파일:

- [packages/core/src/config/providerModels.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/providerModels.ts)
- [packages/cli/src/ui/components/ModelDialog.tsx](/Users/junghojang/Developments/didimProject/gemini-cli/packages/cli/src/ui/components/ModelDialog.tsx)
- 문서 파일 전반

작업 내용:

1. Gemini 3.1 항목 설명을 “Preview API 모델” 기준으로 명확화
2. 필요 시 `displayName`을 추가해 UI에는 `Gemini 3.1 Pro Preview`를 더 명확히
   표시
3. 문서에서 “정식 출시”와 “API stable ID 사용 가능”을 혼동하지 않도록 정리
4. `high`는 모델이 아니라 thinking level이라는 점을 문서에 명시
5. `Auto (Gemini 3)`가 현재 실제로 무엇을 가리키는지 문서와 UI 설명을 일치시킴

완료 조건:

- 사용자가 `gemini-3.1-pro-preview`를 보고 stable ID로 오해하지 않는다.
- 사용자가 `high`를 별도 모델 SKU로 오해하지 않는다.
- 사용자가 `Auto (Gemini 3)`가 구형 `gemini-3-pro-preview`를 가리킨다고 오해하지
  않는다.

### Phase D. Gemini 3.1 Flash-Lite preview 추가 검토

이 Phase는 선택 사항이다.

대상 파일:

- [packages/core/src/config/providerModels.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/providerModels.ts)
- [packages/core/src/config/models.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/models.ts)
- [packages/core/src/config/defaultModelConfigs.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/defaultModelConfigs.ts)
- [packages/core/src/config/config.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/config.ts)
- [packages/core/src/core/tokenLimits.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/core/tokenLimits.ts)
- [packages/core/src/services/chatCompressionService.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/services/chatCompressionService.ts)
- [packages/cli/src/ui/components/ModelDialog.tsx](/Users/junghojang/Developments/didimProject/gemini-cli/packages/cli/src/ui/components/ModelDialog.tsx)
- [packages/core/src/config/models.test.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/models.test.ts)
- [packages/core/src/core/tokenLimits.test.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/core/tokenLimits.test.ts)
- [packages/core/src/services/chatCompressionService.test.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/services/chatCompressionService.test.ts)
- 관련 테스트 및 golden 파일

작업 내용:

1. `gemini-3.1-flash-lite-preview`의 실제 모델 코드, context, thinking 제약을
   공식 문서로 재확인
2. preview 모델로 등록할 가치가 있는지 판단
3. 등록 시 Pro preview와 동일하게 preview gating 대상에 넣을지 결정
4. quota access 판별과 ModelDialog preview 필터가 같이 갱신되는지 확인
5. `isPreviewModel()` 연동 여부와 Task 도구 preview gate 영향 범위를 같이 검증
6. 가격 정보는 공식 Google pricing 문서에서 확인 가능한 경우에만
   `costEstimation.ts`에 반영

완료 조건:

- 등록 여부와 이유가 문서에 명확히 기록된다.
- preview gate, token limit, compression alias, quota access, UI 필터가 빠짐없이
  동기화된다.

### Phase E. Gemini stable ID 전환 준비안

이 Phase는 지금 바로 구현하지 않는다. Google 개발자 문서에 `gemini-3.1-pro`가
실제 API 모델 ID로 확인된 뒤 실행한다.

예상 대상 파일:

- [packages/core/src/config/models.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/models.ts)
- [packages/core/src/config/defaultModelConfigs.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/defaultModelConfigs.ts)
- [packages/core/src/core/tokenLimits.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/core/tokenLimits.ts)
- [packages/core/src/services/chatCompressionService.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/services/chatCompressionService.ts)
- [packages/core/src/config/config.ts](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/config/config.ts)
- [packages/core/src/services/test-data/resolved-aliases.golden.json](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/services/test-data/resolved-aliases.golden.json)
- [packages/core/src/services/test-data/resolved-aliases-retry.golden.json](/Users/junghojang/Developments/didimProject/gemini-cli/packages/core/src/services/test-data/resolved-aliases-retry.golden.json)

전환 원칙:

1. 기존 `gemini-3.1-pro-preview` 저장값과 새 stable ID를 일정 기간 동시 허용
2. quota 판별, preview 필터, token limit, compression alias를 동시에 갱신
3. saved settings와 문서 예시를 함께 마이그레이션

## 6. 문서 업데이트 범위

최소 수정 대상:

- [docs/providers.md](/Users/junghojang/Developments/didimProject/gemini-cli/docs/providers.md)
- [docs/cli/model.md](/Users/junghojang/Developments/didimProject/gemini-cli/docs/cli/model.md)
- [docs/index.md](/Users/junghojang/Developments/didimProject/gemini-cli/docs/index.md)
- [docs/get-started/authentication.md](/Users/junghojang/Developments/didimProject/gemini-cli/docs/get-started/authentication.md)
- [docs/get-started/configuration.md](/Users/junghojang/Developments/didimProject/gemini-cli/docs/get-started/configuration.md)
- [docs/short_manual.md](/Users/junghojang/Developments/didimProject/gemini-cli/docs/short_manual.md)

문서 원칙:

1. OpenAI 예시는 `gpt-5.4` 기준으로 갱신
2. Gemini 예시는 계속 `gemini-3.1-pro-preview` 또는 `gemini-2.5-pro` 기준으로
   유지
3. “정식 출시”와 “CLI에서 사용하는 실제 API 모델 ID”를 분리해서 표기
4. `high`는 thinking level, 모델 ID 아님을 분리해서 표기
5. `gpt-5.4-mini` 대신 공식 확인된 `gpt-5-mini`만 사용

## 7. 검증 계획

### 7.1 단위 테스트

```bash
npm run test --workspace @didim365/agent-cli-core -- src/config/providerModels.test.ts src/providers/providerSelector.test.ts src/config/costEstimation.test.ts src/config/config.test.ts
npm run test --workspace @didim365/agent-cli-core -- src/config/models.test.ts src/availability/policyCatalog.test.ts src/availability/fallbackIntegration.test.ts src/routing/strategies/defaultStrategy.test.ts
npm run test --workspace @didim365/agent-cli -- src/ui/components/ModelDialog.test.tsx src/ui/utils/resolveActiveProvider.test.ts
```

### 7.2 정적 검증

```bash
npm run typecheck --workspace @didim365/agent-cli-core
npm run typecheck --workspace @didim365/agent-cli
npm run lint --workspace @didim365/agent-cli-core
npm run lint --workspace @didim365/agent-cli
```

### 7.3 수동 확인

1. `/model`에서 OpenAI 권장 모델이 `gpt-5.4`로 보이는지 확인
2. OpenAI provider 전환 시 stale Gemini 모델이 `gpt-5.4`로 fallback 되는지 확인
3. `auto-gemini-3` 선택 시 실제 active model이 `gemini-3.1-pro-preview` 기준으로
   동작하는지 확인
4. Gemini provider에서 preview 접근 비활성 계정은 `gemini-3.1-pro-preview`가
   계속 숨겨지는지 확인
5. `/stats` 비용 추정에서 새 OpenAI 모델이 0달러로 누락되지 않는지 확인
6. 문서와 UI에서 `high`가 모델 목록에 노출되지 않는지 확인

## 8. 리스크

1. `gemini-3.1-pro`를 성급히 등록하면 실제 API 호출 실패 가능성이 높다.
2. OpenAI 기본 모델을 `gpt-5.4-pro`로 잡으면 도구 사용 경로에서 예상과 다른
   제약이 생길 수 있다.
3. 문서만 갱신하고 테스트/가격표를 놓치면 UI와 통계가 서로 다른 모델 세트를
   보여줄 수 있다.
4. `gemini-3.1-flash-lite-preview`를 추가할 경우 preview gating, token limit,
   compression alias가 빠지면 Gemini 경로에서 불완전 상태가 된다.
5. `resolveModel()`만 수정하고 `policyCatalog.ts`를 그대로 두면
   `auto-gemini-3`의 기본 라우팅과 fallback 체인이 서로 다른 1순위 모델을
   가리키게 된다.

## 9. 최종 산출물 정의

이번 계획 기준 실제 구현 완료 상태는 아래와 같다.

1. OpenAI provider가 `gpt-5.4` 계열을 지원한다.
2. OpenAI 기본 추천 모델이 저장소 정책에 맞게 갱신된다.
3. 비용 추정과 테스트가 새 모델 ID를 인지한다.
4. `auto-gemini-3`는 `gemini-3.1-pro-preview` 기준으로 정합성 있게 동작한다.
5. Gemini 3.1은 `gemini-3.1-pro-preview` 기준으로 명확히 유지된다.
6. `high`는 thinking level이라는 점이 코드/문서에서 명확해진다.
7. Gemini stable ID 전환은 별도 조건부 후속 작업으로 분리된다.

## 10. 리뷰 의견 검증 결과

### 10.1 검증 완료 및 반영

1. `resolveModel()`의 `PREVIEW_GEMINI_MODEL_AUTO`가 현재
   `gemini-3-pro-preview`를 반환하는 것은 사실이다.
2. OpenAI 기본 모델 교체 시 기존 `gpt-5.3-codex`의 `isDefault` 제거가 필요하다는
   지적은 사실이다.
3. `providerModels.test.ts`, `providerSelector.test.ts`,
   `ModelDialog.test.tsx`에 `gpt-5.3-codex` 하드코딩 기대값이 존재하는 것은
   사실이다.
4. `gemini-3.1-flash-lite-preview`를 추가할 경우 `models.ts`, `tokenLimits.ts`,
   `defaultModelConfigs.ts`, `chatCompressionService.ts`만이 아니라 `config.ts`,
   `ModelDialog.tsx`, 관련 테스트까지 같이 묶어야 한다.

### 10.2 검증 결과 보정

1. OpenAI 공식 현재 문서 기준으로 `gpt-5.4-mini`는 확인되지 않았고, 대신
   `gpt-5-mini`가 확인된다.
2. OpenAI 가격 단가는 리뷰 의견과 일부 다르다. 계획서는 공식 가격 페이지 기준
   숫자로 보정했다.
3. `auto-gemini-3` 이슈는 `models.ts` 한 파일만의 문제가 아니라
   `policyCatalog.ts`와 auto/fallback 관련 테스트까지 함께 수정해야 한다.

## 11. 참고 소스

- OpenAI
  - https://openai.com/index/introducing-gpt-5-4/
  - https://developers.openai.com/api/docs/models/gpt-5.4
  - https://developers.openai.com/api/docs/models/gpt-5.4-pro
  - https://openai.com/api/pricing/
- Google
  - https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-pro/
  - https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-flash-lite/
  - https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview
  - https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-preview
  - https://ai.google.dev/gemini-api/docs/thinking
  - https://ai.google.dev/pricing
