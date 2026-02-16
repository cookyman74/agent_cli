# Phase 2: `.geminiignore` → `.didimignore` 전환 작업 이력

> **작업일**: 2026-02-16 **브랜치**: `v0.1.2/white_labelling` **범위**:
> GeminiIgnoreParser fallback + filesearch ignore + UI 라벨/도구 설명 **선행**:
> Phase 1 (Core 경로/Storage + 리뷰 1~4차) 완료

---

## 1. 설계 결정사항

### 1.1 클래스명/파일명 전략 — 업스트림 호환 우선

**결정**: 원본 이름 유지 + 중립 alias 추가

| 항목                                  | 결정      | 근거                      |
| ------------------------------------- | --------- | ------------------------- |
| `GeminiIgnoreParser` 클래스명         | 유지      | 업스트림 동기화 빈도 높음 |
| `GeminiIgnoreFilter` 인터페이스명     | 유지      | 동일                      |
| `geminiIgnoreParser.ts` 파일명        | 유지      | import 경로 변경 최소화   |
| `IgnoreParser` alias                  | 신규 추가 | 신규 코드용 중립 이름     |
| `IgnoreFilter` alias                  | 신규 추가 | 동일                      |
| `respectGeminiIgnore` 설정 키         | 유지      | 사용자 config 파일 호환   |
| `respect_gemini_ignore` 도구 파라미터 | 유지      | API 계약 보존             |
| `useGeminiignore` 인터페이스 필드     | 유지      | 내부 API 호환             |

향후 업스트림 동기화 빈도가 낮아지면 전체 rename 진행 예정.

### 1.2 `.didimignore` fallback 전략

- **GeminiIgnoreParser**: `.didimignore` → `.geminiignore` 순서 시도, **유의미
  패턴이 있는 첫 파일** 사용 (빈 `.didimignore`는 fall-through)
- **filesearch/ignore.ts**: `.didimignore` 존재 → 우선, 미존재 → `.geminiignore`
  fallback (**존재 기반** 우선순위, 내용 무관)
- **UI 라벨**: `.didimignore` 단독 표기 (fallback 기간 한정, 간결성 우선)

---

## 2. 커밋 전략 — Tidy First (4커밋)

### Commit 1: `1a1cd42d6` — STRUCTURAL (동작 변경 없음)

**`refactor(core): add ignore file constants and neutral aliases`**

| 파일                                            | 변경                                                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `packages/core/src/utils/paths.ts`              | `DIDIM_IGNORE_FILE = '.didimignore'`, `LEGACY_GEMINI_IGNORE_FILE = '.geminiignore'` 상수 추가 |
| `packages/core/src/utils/geminiIgnoreParser.ts` | `IgnoreFilter` type alias, `IgnoreParser` re-export 추가                                      |

검증: typecheck ✅, 기존 11 tests ✅

---

### Commit 2: `0bde65c80` — BEHAVIORAL (TDD)

**`feat(core): add .didimignore priority fallback in ignore parser`**

| 파일                         | 변경                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `geminiIgnoreParser.ts`      | `loadedIgnoreFile` 필드, `loadPatterns()` candidate loop, `getIgnoreFilePath()` / `hasPatterns()` 리팩터 |
| `geminiIgnoreParser.test.ts` | 3 describe 블록, 7 tests 신규                                                                            |

**TDD 사이클**:

- RED: 4 failed / 14 passed (`.didimignore` 패턴 미인식)
- GREEN: 18/18 passed (candidate loop + `loadedIgnoreFile` 추적)

**핵심 구현**:

```typescript
private loadedIgnoreFile: string | null = null;

private loadPatterns(): void {
  const candidates = [
    path.join(this.projectRoot, DIDIM_IGNORE_FILE),
    path.join(this.projectRoot, LEGACY_GEMINI_IGNORE_FILE),
  ];
  for (const candidatePath of candidates) {
    // ... readFileSync + parse
    if (parsed.length > 0) {
      this.patterns = parsed;
      this.loadedIgnoreFile = candidatePath;
      this.ig.add(this.patterns);
      return;
    }
  }
}
```

**테스트 시나리오**:

| describe                                            | 시나리오                        | 검증                                   |
| --------------------------------------------------- | ------------------------------- | -------------------------------------- |
| `.didimignore` exists (priority)                    | 양쪽 존재 → `.didimignore` 우선 | patterns, isIgnored, getIgnoreFilePath |
| only `.didimignore` exists                          | `.didimignore`만 로딩           | patterns, isIgnored, getIgnoreFilePath |
| `.didimignore` empty + `.geminiignore` has patterns | 빈 파일 fall-through            | patterns, isIgnored, getIgnoreFilePath |

---

### Commit 3: `79c10b4c8` — BEHAVIORAL (TDD)

**`feat(core): add .didimignore priority fallback in filesearch ignore loader`**

| 파일                        | 변경                                                                       |
| --------------------------- | -------------------------------------------------------------------------- |
| `filesearch/ignore.ts`      | `DIDIM_IGNORE_FILE`/`LEGACY_GEMINI_IGNORE_FILE` import, 존재 기반 우선순위 |
| `filesearch/ignore.test.ts` | 3 tests 신규                                                               |

**TDD 사이클**:

- RED: 2 failed / 13 passed (`.didimignore` 로딩 + 우선순위)
- GREEN: 15/15 passed

**핵심 변경**:

```typescript
if (options.useGeminiignore) {
  const didimPath = path.join(options.projectRoot, DIDIM_IGNORE_FILE);
  const geminiPath = path.join(options.projectRoot, LEGACY_GEMINI_IGNORE_FILE);
  const ignorePath = fs.existsSync(didimPath) ? didimPath : geminiPath;
  if (fs.existsSync(ignorePath)) {
    ignorer.add(fs.readFileSync(ignorePath, 'utf8'));
  }
}
```

---

### Commit 4: `0364fbc41` — UI/LABELS

**`refactor(cli): update .geminiignore UI labels to .didimignore`**

| 파일                                  | 라인         | 변경 내용                                        |
| ------------------------------------- | ------------ | ------------------------------------------------ |
| `settingsSchema.ts`                   | 918, 922     | label → `Respect .didimignore`, description 병기 |
| `settings.schema.json`                | 1014-1016    | title/description/markdownDescription 동기화     |
| `tips.ts`                             | 39           | `.geminiignore` → `.didimignore`                 |
| `atFileProcessor.ts`                  | 60           | 에러 메시지 `.didimignore`                       |
| `atFileProcessor.test.ts`             | 208          | 기대 문자열 동기화                               |
| `settings_validation_warning.test.ts` | 33-36        | mock 경로 `.gemini` → `.didim`                   |
| `ls.ts`                               | 34, 284, 294 | 도구 설명 3곳                                    |
| `read-many-files.ts`                  | 66, 491, 501 | 도구 설명 3곳                                    |
| `glob.ts`                             | 82, 296      | 도구 설명 2곳                                    |
| `ripGrep.ts`                          | 371          | 주석                                             |

**변경하지 않은 항목** (업스트림 호환):

- `respectGeminiIgnore` 설정 키
- `respect_gemini_ignore` 도구 파라미터
- `useGeminiignore` 인터페이스 필드
- `getFileFilteringRespectGeminiIgnore()` 메서드명
- `GeminiIgnoreParser` / `GeminiIgnoreFilter` 클래스/인터페이스명
- `geminiIgnoreParser.ts` 파일명

---

## 3. 품질 게이트

| 항목                 | 결과                                 |
| -------------------- | ------------------------------------ |
| Core 테스트          | 281 files, **5390 passed**, 0 failed |
| CLI 테스트           | 351 files, **4758 passed**, 0 failed |
| TypeScript typecheck | ✅ 0 errors                          |
| ESLint (core)        | ✅ 0 warnings                        |
| ESLint (cli)         | ✅ 0 warnings                        |
| Pre-commit hooks     | ✅ 4/4 커밋 모두 통과                |

---

## 4. Phase 2 잔여 항목

| 항목                                           | 상태       | 비고                         |
| ---------------------------------------------- | ---------- | ---------------------------- |
| 오류 메시지/검증 메시지 경로명 정리 (2.1)      | ⬜         | hookRegistry.ts:118 등       |
| `.env` 범위 판별 충돌 점검 (2.2)               | ⬜         | isProjectEnvFile 양쪽 체크   |
| 기존 `.gemini` 파일 존재 시 첫 저장 동작 (2.3) | ➡️ Phase 4 | 마이그레이션 도구에서 처리   |
| `docs/cli/gemini-ignore.md` 문서 전환 (2.4)    | ⬜         | Phase 문서 업데이트에서 일괄 |
| `settings.test.ts` 보강 (2.5)                  | ⬜         | settings 경로 시나리오       |
| `fileDiscoveryService.test.ts` 시나리오 (2.5)  | ⬜         | `.didimignore` 통합 테스트   |

---

## 5. Lessons Learned

- **ESLint no-unused-vars**: Commit 1 (structural only)에서
  `import { DIDIM_IGNORE_FILE }` 추가 시, 아직 사용하지 않으므로 lint 실패.
  구조적 커밋에는 사용처 없는 import 포함하지 말 것 → Commit 2 behavioral에서
  import 추가
- **Tidy First stash 분리**: `git stash push` → Commit 1 적용 →
  `git stash pop`으로 behavioral 변경 복원. conflict 없이 성공
- **filesearch vs parser fallback 차이**: GeminiIgnoreParser는 **내용 기반** (빈
  파일 fall-through), filesearch/ignore.ts는 **존재 기반** (파일 있으면 로딩).
  사용 맥락이 다르므로 의도된 차이
