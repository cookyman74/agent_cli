# Phase C: Gemini 3.1 문구 정리 + 문서 갱신

- 작업일: 2026-03-08
- 상태: ✅ 완료

## 변경 요약

1. Gemini 3.1 Pro Preview 항목에 displayName과 "Preview API 모델" 명시
2. 전체 문서의 OpenAI 모델 참조를 `gpt-5.4` 기준으로 갱신
3. Gemini 3.1 Pro Preview 모델을 문서에 반영

## 변경 파일

### 소스 코드

| 파일                                         | 변경 내용                                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/config/providerModels.ts` | `gemini-3.1-pro-preview`에 `displayName: 'Gemini 3.1 Pro Preview'` 추가, description에 "Preview API model" 명시 |

### 문서

| 파일                                 | 변경 내용                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `docs/cli/model.md`                  | Gemini 섹션: Auto (Gemini 3) 테이블에 `gemini-3.1-pro-preview` 반영, manual 목록에 추가    |
| `docs/cli/model.md`                  | OpenAI 섹션: preset `gpt-5.4`로 갱신, manual 목록 전면 갱신                                |
| `docs/cli/model.md`                  | CLI 예시 `gpt-4.1-mini` → `gpt-5.4`, best practices 모델명 갱신                            |
| `docs/providers.md`                  | OpenAI 예시 `gpt-4o` → `gpt-5.4`, Model Resolution 테이블 갱신                             |
| `docs/index.md`                      | Provider Matrix 테이블: Gemini `gemini-3.1-pro-preview` 반영, OpenAI `gpt-5.4` 계열로 갱신 |
| `docs/get-started/authentication.md` | OpenAI 모델 목록 `gpt-5.4, gpt-5.4-pro, gpt-5-mini`로 갱신                                 |
| `docs/short_manual.md`               | 모델 지정 예시 `gpt-4.1` → `gpt-5.4`                                                       |

## 문서 원칙 준수

- [x] OpenAI 예시는 `gpt-5.4` 기준으로 갱신
- [x] Gemini 예시는 `gemini-3.1-pro-preview` 또는 `gemini-2.5-pro` 기준 유지
- [x] `gemini-3.1-pro-preview`에 _(Preview API model — not a stable ID)_ 주석
      추가
- [x] `gpt-5.4-mini` 대신 공식 확인된 `gpt-5-mini`만 사용
