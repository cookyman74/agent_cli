# Phase R: Review Fixes (2026-03-08)

## Overview

Two review teams identified 8 issues across test infrastructure, UI tests, quota
UX, documentation, and pricing accuracy. All issues resolved.

## Team 1 Issues (5 items)

### R1-1: CLI vitest.config.ts stale dist issue

- **Problem**: `server.deps.inline` only had `/@google\/gemini-cli-core/` but
  package name is `@didim365/agent-cli-core` — CLI tests resolved stale compiled
  dist instead of source
- **Fix**: Added `/@didim365\/agent-cli-core/` to `server.deps.inline` in
  `packages/cli/vitest.config.ts`

### R1-2: ModelDialog.test.tsx false positive

- **Problem**: Test expected `gpt-5.3-codex` but passed because of stale dist
  (R1-1)
- **Fix**: Updated `mockGetModel` to `'gpt-5.4'`, preset expectation to
  `'Recommended (gpt-5.4)'`, manual model list to include `gpt-5.4` and
  `gpt-5.4-pro`

### R1-3: useQuotaAndFallback missing PREVIEW_GEMINI_31_MODEL

- **Problem**: "all Pro models" message only handled `PREVIEW_GEMINI_MODEL` and
  `DEFAULT_GEMINI_MODEL`, not `PREVIEW_GEMINI_31_MODEL`
- **Fix**: Added `failedModel === PREVIEW_GEMINI_31_MODEL` condition in hook +
  test
- **Test correction**: Initial test checked `historyManager.addItem` for "all
  Pro models" but `retry_always` path outputs "Switched to fallback model..."
  instead. Fixed to check `proQuotaRequest.message` which is the dialog message

### R1-4: Documentation gaps

- **Problem**: `gpt-4.1-mini` missing from docs manual lists; `configuration.md`
  used old `gemini-3-pro-preview` example
- **Fix**: Added `gpt-4.1-mini` to `docs/providers.md` and `docs/cli/model.md`;
  updated `configuration.md` to `gemini-3.1-pro-preview`

### R1-5: Stale comment in costEstimation.ts

- **Problem**: Comment said "as of 2026-02" but prices updated in 2026-03
- **Fix**: Updated to "as of 2026-03"

## Team 2 Issues (3 items)

### R2-1: gpt-5.4 pricing error

- **Problem**: `cachedPerMToken: 0.625` and `outputPerMToken: 20.0` — official
  is `1.25` and `15.0`
- **Fix**: Corrected in `costEstimation.ts` and updated test expectations

### R2-2: gpt-5-mini pricing error

- **Problem**: `cachedPerMToken: 0.025` and `outputPerMToken: 2.0` — official is
  `0.125` and `1.5`
- **Fix**: Corrected in `costEstimation.ts` and updated test expectations

### R2-3: Plan document pricing inconsistency

- **Problem**: Plan doc had wrong pricing values
- **Fix**: Updated plan document pricing section to match corrected values

## Additional Fix

### handler.test.ts unused import

- **Problem**: `PREVIEW_GEMINI_MODEL` import became unused after Phase 0 changes
  (TS6133/ESLint error)
- **Fix**: Removed unused import from
  `packages/core/src/fallback/handler.test.ts`

## Verification Results

| Check                                      | Result |
| ------------------------------------------ | ------ |
| Core tests (293 files, 5945 tests)         | PASS   |
| Core typecheck                             | PASS   |
| Core lint                                  | PASS   |
| CLI ModelDialog.test.tsx (20 tests)        | PASS   |
| CLI useQuotaAndFallback.test.ts (19 tests) | PASS   |
| CLI ProQuotaDialog.test.tsx (19 tests)     | PASS   |

## Files Modified

| File                                                     | Change                                          |
| -------------------------------------------------------- | ----------------------------------------------- |
| `packages/cli/vitest.config.ts`                          | Added `@didim365/agent-cli-core` to inline deps |
| `packages/cli/src/ui/components/ModelDialog.test.tsx`    | Updated OpenAI expectations                     |
| `packages/cli/src/ui/hooks/useQuotaAndFallback.ts`       | Added PREVIEW_GEMINI_31_MODEL condition         |
| `packages/cli/src/ui/hooks/useQuotaAndFallback.test.ts`  | Added 3.1 test, fixed assertion target          |
| `packages/cli/src/ui/components/ProQuotaDialog.test.tsx` | Added 3.1 model test                            |
| `packages/core/src/config/costEstimation.ts`             | Fixed pricing, updated comment date             |
| `packages/core/src/config/costEstimation.test.ts`        | Updated pricing expectations                    |
| `packages/core/src/fallback/handler.test.ts`             | Removed unused import                           |
| `docs/providers.md`                                      | Added gpt-4.1-mini                              |
| `docs/cli/model.md`                                      | Added gpt-4.1-mini                              |
| `docs/get-started/configuration.md`                      | Updated model example                           |
| Plan document                                            | Corrected pricing section                       |
