# Phase3 M3.3.2 모델별 템플릿 훅 보완 작업 결과서

- 작업일: 2026-02-11
- 범위: `### 3.3.2 모델별 템플릿 훅` 리뷰 이슈 반영
- 대상 코드:
  - `packages/core/src/providers/openai-compatible/promptBuilder.ts`
  - `packages/core/src/providers/openai-compatible/promptBuilder.test.ts`
  - `packages/core/src/providers/openai-compatible/index.ts`
  - `docs/ai_adapter/todolist/phase3_provider_extension_todolist.md`

---

## 1) 리뷰 이슈 검증 결과

| #   | 이슈                                                | 심각도 | 검증 판정  | 조치                                                                                                             |
| --- | --------------------------------------------------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | PromptBuilder 프로덕션 미사용(Dead code export)     | 높음   | 정확(의도) | 코드 변경 없음. `promptBuilder.ts` JSDoc에 "extension point, 기본 chat runtime 미연결" 명시                      |
| 2   | Mistral `<<SYS>>` 형식 사용(Llama2 형식)            | 중간   | 정확       | `<<SYS>>` 제거. system 메시지를 첫 user turn에 plain prepend 방식으로 변경                                       |
| 3   | `createPromptBuilderForModel` 매칭 범위 부족/오매칭 | 중간   | 정확       | 모델 매칭 규칙 보강: `mixtral`→Mistral, `meta-llama/` 일반 매칭 제거, `llama-2`/`llama-guard`는 fallback(ChatML) |
| 4   | Mistral tool role 처리 불명확                       | 낮음   | 정확       | tool role을 assistant와 분리 처리. `Tool result:`를 사용자 컨텍스트 turn으로 삽입                                |
| 5   | 오매칭/경계 케이스 테스트 부재                      | 낮음   | 정확       | 회귀 테스트 6건 추가(LLama2, Mixtral, Llama-Guard, Llama3 vision, 대소문자 등)                                   |

---

## 2) 상세 수정 내용

### 2.1 PromptBuilder 의도 명시 (Issue 1)

- `promptBuilder.ts` 모듈 상단 주석에 다음을 명시:
  - extension point로 공개됨
  - 기본 `/v1/chat/completions` 경로에는 현재 직접 연결되지 않음

### 2.2 Mistral 템플릿 보정 (Issue 2, 4)

- 기존:
  - system 메시지 임베딩에 `<<SYS>> ... <</SYS>>` 사용
  - tool role을 assistant와 동일 branch에서 처리
- 변경:
  - system 메시지는 첫 user turn 앞에 plain text prepend
  - system-only 입력은 `<s>[INST] {system} [/INST]`
  - tool role은 `<s>[INST] Tool result:\n... [/INST]` 형태로 별도 context turn
    처리

### 2.3 모델 훅 매칭 보강 (Issue 3)

- 기존 매칭:
  - `llama-3`, `llama3`, `meta-llama/` → Llama3
  - `mistral` → Mistral
- 변경 매칭:
  - `mixtral`, `mistral` → Mistral
  - `llama-3`, `llama3` → Llama3
  - 그 외 → ChatML
- 효과:
  - `meta-llama/Llama-2-*` 오매칭 제거
  - `Mixtral-*` fallback 오매칭 제거

### 2.4 공개 API 유지

- `openai-compatible/index.ts`에서 PromptBuilder 관련 export 유지:
  - `ChatMLPromptBuilder`
  - `Llama3PromptBuilder`
  - `MistralPromptBuilder`
  - `createPromptBuilderForModel`
  - `PromptBuilder` type

---

## 3) 테스트 보강 및 결과

### 3.1 추가/수정 테스트

- 파일: `promptBuilder.test.ts`
- 총 테스트: 23건 통과
- 신규 검증 케이스:
  - `Mixtral-8x7B-Instruct` → `MistralPromptBuilder`
  - `meta-llama/Llama-2-70b-chat-hf` → `ChatMLPromptBuilder`
  - `llama-3.2-vision-instruct` → `Llama3PromptBuilder`
  - `meta-llama/Llama-Guard-3-8B` → `ChatMLPromptBuilder`
  - 대소문자 혼합(`META-LLAMA/LLAMA-3-8B`) 매칭
  - Mistral tool role 처리 시 출력 포맷 검증

### 3.2 실행 결과

```bash
npm test --workspace @google/gemini-cli-core -- src/providers/openai-compatible/promptBuilder.test.ts
# PASS: 23 tests

npm run typecheck --workspace @google/gemini-cli-core
# PASS
```

---

## 4) 계획서 반영

- `phase3_provider_extension_todolist.md`의 3.3.2 상태는 기존 완료(`✅`) 유지.
- 완료 근거가 되는 구현/테스트를 이번 보완 작업으로 확정.

---

## 5) 남은 주의사항

- PromptBuilder 훅은 현재 기본 `/v1/chat/completions` 실행 경로에 직접 연결되지
  않음.
- 향후 raw `/v1/completions` 경로를 활성화할 때, 모델별 공식 템플릿 스펙
  재검증이 필요.
