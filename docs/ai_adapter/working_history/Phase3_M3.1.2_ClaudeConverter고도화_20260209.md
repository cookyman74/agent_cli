# M3.1.2 작업 결과서 — Claude 메시지 변환 고도화

- **작업일**: 2026-02-09
- **브랜치**: `DID/v0.1`
- **상태**: ✅ 완료

## 작업 목표

M3.1.1에서 구현한 ClaudeConverter의 에지 케이스를 보강하고, 코드 중복을
제거한다:

1. 연속 동일 role 메시지 병합 (Anthropic API 요구사항)
2. 빈 텍스트 콘텐츠 필터링
3. RedactedThinkingBlock 처리
4. cache_creation_input_tokens 지원
5. toClaudeRequest/toCountTokensRequest DRY 리팩토링

## 사전 분석

### todolist 대비 현황

| todolist ID | 항목                      | M3.1.1 구현 여부                      |
| ----------- | ------------------------- | ------------------------------------- |
| 3.1.2.1     | toClaudeMessage() 변환    | ✅ toClaudeMessages + toClaudeContent |
| 3.1.2.2     | System 메시지 분리        | ✅ toClaudeMessages                   |
| 3.1.2.3     | 이미지 URL → base64 변환  | ⚠️ 경고 텍스트로 대체 (API 미지원)    |
| 3.1.2.4     | toClaudeTool() 변환       | ✅ toClaudeTools + toClaudeToolChoice |
| 3.1.2.5     | fromClaudeResponse() 변환 | ✅ fromClaudeResponse                 |

**결론**: 핵심 기능은 M3.1.1 완료. M3.1.2는 에지 케이스 고도화 + 리팩토링으로
재정의.

### SDK 타입 검증 결과

| 항목                        | SDK 확인 내용                                                           |
| --------------------------- | ----------------------------------------------------------------------- |
| RedactedThinkingBlock       | `{ type: 'redacted_thinking', data: string }` — ContentBlock union 포함 |
| 연속 동일 role              | 타입 비강제, API가 자동 병합 — 명시적 처리가 안전                       |
| Stream error event          | RawMessageStreamEvent에 error 타입 없음 — transport 계층에서 처리       |
| ToolResultBlockParam        | content: `string \| Array<TextBlockParam \| ImageBlockParam \| ...>`    |
| cache_creation_input_tokens | usage 내 존재, cache_read_input_tokens와 별개                           |

## 작업 순서 및 결과

| 순서 | Sub-task | 작업 내용                     | 테스트 결과      |
| ---- | -------- | ----------------------------- | ---------------- |
| 1    | RED      | converter.test.ts (+11 tests) | 8 FAIL / 51 PASS |
| 2    | GREEN    | converter.ts 5개 항목 구현    | 80/80 PASS       |
| 3    | REFACTOR | buildBaseParams DRY 추출      | 80/80 PASS       |

## 변경 파일 상세

### 수정 파일

#### `providers/claude/converter.ts`

**1. 연속 동일 role 메시지 병합** (`toClaudeMessages`):

- 이전: 매 메시지를 독립 push → 연속 user/tool 메시지가 별개 user 메시지로 전송
- 이후: 마지막 메시지와 role 비교, 같으면 content 배열에 합침
- tool→user, user→user 연속 시 단일 user 메시지로 병합

**2. 빈 텍스트 콘텐츠 필터링** (`toClaudeContent`):

- `content.text`가 falsy(빈 문자열)일 때 블록 생성 건너뜀
- API 에러 방지 + 불필요한 토큰 소비 방지

**3. RedactedThinkingBlock 처리** (`fromClaudeContentBlocks`):

- `type: 'redacted_thinking'` → `LlmThoughtContent` with
  `metadata: { provider: 'claude', redacted: true }`
- thought 텍스트: `'[redacted]'`

**4. cache_creation_input_tokens** (`extractUsage`):

- `usage.cache_creation_input_tokens` → `cacheCreationTokens` 필드 추가
- 기존 `cachedTokens` (cache_read)와 병행

**5. buildBaseParams DRY 리팩토링**:

- 이전: `toClaudeRequest`와 `toCountTokensRequest`에 system 병합 + tools +
  toolChoice 로직 중복
- 이후: `private buildBaseParams()` 추출, 두 메서드가 재사용
  - `toClaudeRequest`: buildBaseParams + max_tokens + generation params
  - `toCountTokensRequest`: buildBaseParams only

#### `providers/claude/converter.test.ts` — 49 → 60 tests (+11)

| 카테고리                      | 테스트 수 | 검증 내용                                                         |
| ----------------------------- | --------- | ----------------------------------------------------------------- |
| consecutive same-role merging | 5         | user+user, tool+tool, user+tool, alternating, assistant+assistant |
| empty text filtering          | 2         | 빈 텍스트 필터링, 전체 빈 배열                                    |
| RedactedThinkingBlock         | 1         | redacted_thinking → thought with redacted marker                  |
| cache_creation_input_tokens   | 1         | cacheCreationTokens 필드 존재                                     |
| DRY consistency               | 1         | toClaudeRequest/toCountTokensRequest system 일치                  |
| (기존 테스트)                 | 50        | M3.1.1 + 리뷰 반영 테스트 유지                                    |

## Quality Gate

| 항목          | 결과                       |
| ------------- | -------------------------- |
| TypeCheck     | ✅ PASS                    |
| ESLint        | ✅ PASS                    |
| Claude 테스트 | ✅ 4 files / 92 passed     |
| Provider 회귀 | ✅ 29 files / 535 passed   |
| Core 전체     | ✅ 266 files / 4971 passed |

**변화**: 기준선 4961 → +10 tests (converter 11신규 - 1 DRY 기존통과 = 10 순증)

## 설계 결정

### 연속 동일 role 병합 — 클라이언트 측 병합

- **결정**: converter에서 명시적으로 연속 동일 role 메시지를 병합
- **근거**: Anthropic API가 자동 병합한다고 문서화되어 있으나, tool→user 매핑 시
  예상치 못한 병합이 발생할 수 있음. 명시적 처리가 디버깅 용이하고 안전.

### RedactedThinkingBlock — thought + metadata 패턴

- **결정**: `[redacted]` 텍스트 + `metadata.redacted: true`로 변환
- **근거**: `data` 필드는 불투명 인코딩이라 사용자에게 의미 없음.
  LlmThoughtContent 타입을 유지하면서 redacted 여부를 metadata로 표시.

### URL 이미지 — 변환 미구현 (의도적)

- **결정**: M3.1.1 리뷰에서 경고 텍스트 블록으로 처리, URL→base64 변환은 미구현
- **근거**: URL→base64 변환은 HTTP fetch 의존성 + 비동기 변환 필요. converter는
  동기 메서드로 설계됨. 향후 adapter 레벨에서 필요 시 구현.

### buildBaseParams — private 메서드 추출

- **결정**: system 병합 + tools/toolChoice 로직을 `buildBaseParams()`로 추출
- **근거**: `toClaudeRequest`와 `toCountTokensRequest`에 동일 로직 중복.
  `toCountTokensRequest`는 `buildBaseParams()` 호출만으로 완결.

## 리뷰 반영

### 리뷰 이슈 및 수정 결과

| #   | 심각도 | 이슈                                                                      | 수정 내용                                                                            |
| --- | ------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | 중간   | `cacheCreationTokens`가 `LlmTokenUsage` 타입에 선언되지 않음              | `LlmTokenUsage`에 `cacheCreationTokens?: number` 옵셔널 필드 추가, intersection 제거 |
| 2   | 낮음   | `if (cacheCreation)` falsy 체크 — `cachedTokens` 처리(항상 설정)와 비일관 | `?? 0` 패턴으로 일관화, 항상 필드 설정                                               |
| 3   | 낮음   | 빈 텍스트 필터링 + 연속 role 병합 상호작용 테스트 부재                    | `[user("A"), user(""), user("B")]` 시나리오 테스트 추가                              |

### 리뷰 후 Quality Gate

| 항목          | 결과                       |
| ------------- | -------------------------- |
| TypeCheck     | ✅ PASS                    |
| ESLint        | ✅ PASS                    |
| Claude 테스트 | ✅ 60 passed               |
| Provider 회귀 | ✅ 29 files / 536 passed   |
| Core 전체     | ✅ 266 files / 4972 passed |

**변화**: 리뷰 전 59 tests → 60 tests (+1 상호작용 테스트), Core 4971 → 4972
(+1)

## 향후 작업

- M3.1.3: Claude 스트림 변환 고도화 (에러 스트림, 부분 실패, 재시도)
- M3.1.4: Claude 에러 매핑 (APIError → LlmError 계층 변환)

## 커밋

- `78b119663` feat(providers): M3.1.2 — Claude 메시지 변환 고도화
- `09383be13` fix(providers): M3.1.2 리뷰 반영 — cacheCreationTokens 타입 추가,
  falsy 체크 일관화, 상호작용 테스트
