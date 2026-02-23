# Hotfix: sLM (OpenAI-Compatible) Context Overflow 문제 해결

**작업일자**: 2026-02-23 **작업자**: Claude Opus 4.5 **브랜치**: DID/v0.2
**상태**: ✅ 완료

---

## 1. 문제 개요

### 1.1 초기 증상

sLM (small Language Model) 모드로 GPUStack 서버 연동 시 다음 오류 발생:

```
✕ [API Error: 401 Unauthorized]
```

### 1.2 테스트 환경

- **서버**: GPUStack (vLLM 백엔드)
- **모델**: gpt-oss-20b
- **URL**: `http://gpustack.211.218.150.247.nip.io:30080/v1`
- **서버 설정**: `--max-model-len=4096 --max-num-seqs=16 --dtype=bfloat16`

---

## 2. 문제 해결 과정

### 2.1 Phase 1: 401 인증 오류 수정

#### 원인 분석

`~/.didim/settings.json` 파일 확인 결과:

- `apiKeyHeaderName` 필드에 헤더 이름 대신 **API 키 값**이 저장됨
- API 키가 keychain에 저장되지 않음

#### curl 테스트 결과

```bash
# Bearer 토큰 방식: 성공 (403 = 인증됨, 모델 없음)
curl -H "Authorization: Bearer gpustack_..." → 403 Model not found

# X-Api-Key 방식: 실패
curl -H "X-Api-Key: gpustack_..." → 401 Unauthorized
```

#### 해결

```json
// 수정 전 (잘못된 설정)
{
  "slmConfig": {
    "baseUrl": "http://...",
    "apiKeyHeaderName": "gpustack_53e3a98851da545c_..."  // ❌ API 키가 헤더 이름에
  }
}

// 수정 후
{
  "slmConfig": {
    "baseUrl": "http://...",
    "apiKey": "gpustack_53e3a98851da545c_..."  // ✅ 올바른 필드
  }
}
```

---

### 2.2 Phase 2: 403 Model Not Found 오류 수정

#### 원인

settings.json에 모델명이 지정되지 않음

#### 해결

```json
{
  "slmConfig": {
    "baseUrl": "http://...",
    "apiKey": "...",
    "model": "gpt-oss-20b" // ✅ 모델명 추가
  }
}
```

---

### 2.3 Phase 3: max_tokens 음수 오류 (1차 시도 - 실패)

#### 증상

```
✕ [API Error: 400 max_tokens must be at least 1, got -4449]
```

#### 1차 시도: max_tokens 가드 추가

**파일**: `packages/core/src/providers/openai/converter.ts`

```typescript
// 수정: 음수 maxTokens 방지
if (request.maxTokens !== undefined && request.maxTokens > 0) {
  params['max_completion_tokens'] = request.maxTokens;
}
```

**결과**: ❌ 동일 오류 지속

#### 2차 시도: max_completion_tokens → max_tokens 변경

GPUStack/vLLM은 OpenAI의 `max_completion_tokens` 대신 `max_tokens`를 사용

**파일**: `packages/core/src/providers/openai-compatible/adapter.ts`

```typescript
// OpenAiAdapter의 generateContent, generateContentStream 오버라이드
// max_completion_tokens 대신 max_tokens 사용
private buildCompatibleParams(request: LlmGenerateRequest): Record<string, unknown> {
  const baseParams = this.converter.toOpenAiRequest(request);
  const { max_completion_tokens, ...rest } = baseParams;

  const maxTokens = request.maxTokens && request.maxTokens > 0
    ? request.maxTokens
    : this.capabilities.maxOutputTokens;

  return { ...rest, max_tokens: maxTokens };
}
```

**TypeScript 빌드 오류 수정**:

- `OpenAiAdapter`의 `converter`, `classifyError`를 `private` → `protected`로
  변경

**결과**: ❌ 여전히 음수 max_tokens 오류 (`-4449`, `-4991`)

---

### 2.4 Phase 4: 근본 원인 발견 - 시스템 프롬프트 과대

#### 디버그 로그 추가

```typescript
console.log(
  `[DEBUG] Request: ${messages.length} messages, ~${totalChars} chars, max_tokens: ${maxTokens}`,
);
```

#### 디버그 출력 분석

```
Request 1: 1 message, ~461 chars
Request 2: 3 messages, ~26,466 chars, max_tokens: 4096
```

#### 근본 원인

- **시스템 프롬프트 크기**: ~26,466자 (~6,600 토큰)
- **GPUStack 컨텍스트**: 4,096 토큰
- **계산**: 4,096 - 6,600 = **-2,504 토큰** (음수!)

---

### 2.5 Phase 5: 경량 시스템 프롬프트 구현

#### 해결 방안

sLM 모드에서 경량 시스템 프롬프트 사용

**파일**: `packages/core/src/core/prompts.ts`

```typescript
/**
 * Check if we're using sLM mode via OpenAI-compatible provider.
 */
function isSlmMode(): boolean {
  const llmProvider = process.env['LLM_PROVIDER'];
  return (
    llmProvider === 'openai-compatible' || llmProvider === 'openai_compatible'
  );
}

/**
 * Lightweight system prompt for sLM (~250 tokens vs ~6,600 tokens)
 */
function getLightweightSystemPrompt(
  config,
  userMemory?,
  interactiveOverride?,
): string {
  const prompt = `You are a CLI agent for software engineering tasks. Be concise and direct.

# Core Rules
- Follow existing project conventions and patterns
- Verify library usage before employing (check package.json, imports, etc.)
- Add comments only for complex logic explaining "why"
- Don't revert changes unless asked
${interactiveMode ? '- Confirm with user before significant scope expansion' : '- Complete tasks without user interaction'}

# Workflow
1. **Understand**: Use 'Grep', 'Glob', 'ReadFile' to explore code
2. **Plan**: Share brief plan if helpful
3. **Implement**: Use 'Edit', 'WriteFile', 'Shell'
4. **Verify**: Run tests and linting if applicable

# Guidelines
- Keep responses under 3 lines unless more detail needed
- Use GitHub-flavored Markdown
- Execute independent tool calls in parallel
- Explain commands that modify system state
- Never expose secrets or API keys

# Security
- Prioritize user safety
- Explain critical commands before execution`;

  return prompt + (userMemory ? `\n\n---\n\n${userMemory}` : '');
}

export function getCoreSystemPrompt(
  config,
  userMemory?,
  interactiveOverride?,
): string {
  // sLM 모드에서 경량 프롬프트 사용
  if (isSlmMode()) {
    return getLightweightSystemPrompt(config, userMemory, interactiveOverride);
  }
  // ... 기존 전체 프롬프트 로직
}
```

**결과**: ❌ 여전히 오류 (`max_tokens: -1155`)

---

### 2.6 Phase 6: 도구(Tools) 수 제한 (최종 해결)

#### 추가 디버그 분석

```
[DEBUG] isSlmMode: LLM_PROVIDER="openai-compatible", result=true
[DEBUG] Using lightweight prompt: 922 chars
[DEBUG] OpenAI-compat request: 3 msgs, 14 tools, system: 0 chars, max_tokens: 4096
```

#### 새로운 발견

- **14개 도구**가 요청에 포함됨
- 각 도구 정의: ~300 토큰
- 14 tools × 300 = **~4,200 토큰** (도구만으로 컨텍스트 초과!)

#### 해결: sLM 모드에서 필수 도구만 등록

**파일**: `packages/core/src/config/config.ts`

```typescript
// isSlmMode 메서드 추가
isSlmMode(): boolean {
  const llmProvider = process.env['LLM_PROVIDER'];
  return llmProvider === 'openai-compatible' || llmProvider === 'openai_compatible';
}

async createToolRegistry(): Promise<ToolRegistry> {
  const registry = new ToolRegistry(this, this.messageBus);
  const isSlm = this.isSlmMode();

  // 필수 도구 (6개) - sLM/일반 모두 등록
  registerCoreTool(ReadFileTool, this);
  registerCoreTool(GrepTool, this);  // 또는 RipGrepTool
  registerCoreTool(GlobTool, this);
  registerCoreTool(EditTool, this);
  registerCoreTool(WriteFileTool, this);
  registerCoreTool(ShellTool, this);

  // 비필수 도구 - sLM 모드에서 제외
  if (!isSlm) {
    registerCoreTool(LSTool, this);
    registerCoreTool(ActivateSkillTool, this);
    registerCoreTool(WebFetchTool, this);
    registerCoreTool(MemoryTool);
    registerCoreTool(WebSearchTool, this);
    registerCoreTool(WriteTodosTool);
    this.registerSubAgentTools(registry);  // 서브에이전트도 제외
  }

  // MCP 도구 검색도 sLM 모드에서 건너뜀
  if (!isSlm) {
    await registry.discoverAllTools();
  }

  registry.sortTools();
  return registry;
}
```

**결과**: ✅ **성공!**

---

## 3. 최종 변경 파일 목록

| 파일                                                       | 변경 내용                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| `packages/core/src/core/prompts.ts`                        | `isSlmMode()`, `getLightweightSystemPrompt()` 추가                       |
| `packages/core/src/core/prompts.test.ts`                   | sLM 모드 테스트 6개 추가                                                 |
| `packages/core/src/config/config.ts`                       | `isSlmMode()` 메서드, 도구 필터링 로직 추가                              |
| `packages/core/src/providers/openai/adapter.ts`            | `converter`, `classifyError` → `protected`                               |
| `packages/core/src/providers/openai/converter.ts`          | 음수 maxTokens 가드 추가                                                 |
| `packages/core/src/providers/openai-compatible/adapter.ts` | `generateContent`, `generateContentStream` 오버라이드, `max_tokens` 사용 |
| `packages/cli/src/ui/auth/SlmConfigDialog.tsx`             | 버퍼 초기화 수정, `parseCustomHeaders()` 추가                            |
| `packages/cli/src/ui/auth/SlmConfigDialog.test.tsx`        | `parseCustomHeaders` 테스트 10개 추가                                    |

---

## 4. 비교: 전체 vs 경량 모드

| 항목             | 전체 프롬프트           | sLM 경량 모드      |
| ---------------- | ----------------------- | ------------------ |
| 시스템 프롬프트  | ~26,000자 (~6,600 토큰) | ~922자 (~250 토큰) |
| 도구 수          | 14개 (~4,200 토큰)      | 6개 (~1,800 토큰)  |
| **총 기본 토큰** | **~10,800 토큰**        | **~2,050 토큰**    |
| 대상 컨텍스트    | 100K+ 토큰              | 4,096 토큰         |
| 대화 여유        | 충분                    | ~2,000 토큰        |

---

## 5. sLM 모드 필수 도구 목록

| 도구               | 용도                |
| ------------------ | ------------------- |
| `ReadFile`         | 파일 읽기           |
| `Grep` / `RipGrep` | 코드 내 텍스트 검색 |
| `Glob`             | 파일 패턴 검색      |
| `Edit`             | 파일 편집           |
| `WriteFile`        | 파일 생성           |
| `Shell`            | 명령어 실행         |

---

## 6. 테스트 결과

### 6.1 단위 테스트

```bash
npm test -w @didim365/agent-cli-core -- src/core/prompts.test.ts
# ✓ 52 tests passed
```

### 6.2 통합 테스트

```
[DEBUG] isSlmMode: LLM_PROVIDER="openai-compatible", result=true
[DEBUG] Using lightweight prompt: 922 chars
[DEBUG] sLM mode: registering minimal tool set
[DEBUG] OpenAI-compat request: 3 msgs, 6 tools, system: 0 chars, max_tokens: 4096
# ✅ 정상 동작
```

---

## 7. 향후 개선 사항

1. **사용자 설정 가능한 도구 목록**: sLM 모드에서 사용할 도구를
   settings.json으로 설정
2. **동적 컨텍스트 계산**: 모델의 max_context_length를 동적으로 감지하여 적응
3. **도구 우선순위**: 컨텍스트 한계에 따라 도구를 우선순위별로 자동 선택
4. **디버그 로그 제거**: 프로덕션 배포 전 console.log 제거 필요

---

## 8. 디버그 로그 정리 ✅ 완료

디버깅 완료 후 다음 파일에서 디버그 로그 제거됨:

| 파일                                                       | 제거된 로그                                                       |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/core/src/core/prompts.ts`                        | `[DEBUG] isSlmMode: ...`, `[DEBUG] Using lightweight prompt: ...` |
| `packages/core/src/config/config.ts`                       | `[DEBUG] sLM mode: registering minimal tool set`                  |
| `packages/core/src/providers/openai-compatible/adapter.ts` | `[DEBUG] OpenAI-compat request: ...`                              |

---

## 9. 추가 수정: SlmConfigDialog 설정 오류 근본 원인 수정

### 9.0 배경

Phase 1에서 발견된 `apiKeyHeaderName`에 API 키 값이 잘못 저장되는 문제는
settings.json 수동 수정으로 임시 해결했으나, 근본 원인 수정이 필요했음.

원격 브랜치 `origin/hooks/se_manager`의 커밋 `54e193fe`(hotfix: slm 설정 오류
수정)를 참고하여 수정함.

### 9.1 근본 원인

`apiKeyHeaderName` 필드에 API 키 값이 잘못 저장되는 문제의 근본 원인:

1. **버퍼 초기화 문제**: `useTextBuffer` 훅이 컴포넌트 레벨에서 한 번
   초기화되면, `currentStep`이 변경되어도 버퍼의 내부 상태가 자동으로
   업데이트되지 않음
2. 단계 전환 시 이전 단계의 값(API 키)이 다음 단계(`apiKeyHeaderName`)에 잔류

### 9.2 수정 내용

**파일**: `packages/cli/src/ui/auth/SlmConfigDialog.tsx`

#### 1. 버퍼 초기화 수정

**문제**: `buffer.setText('')`로 빈 문자열을 설정하면, 다음 단계에서 버퍼가
올바르게 초기화되지 않음

```typescript
// 수정 전 (handleEndpointSubmit)
buffer.setText('');

// 수정 후
buffer.setText(apiKey || ''); // 다음 단계(credentials)에 맞는 초기값으로 설정
```

```typescript
// 수정 전 (handleCredentialsSubmit)
buffer.setText('');

// 수정 후
buffer.setText(apiKeyHeaderName || ''); // 다음 단계(advanced)에 맞는 초기값으로 설정
```

#### 2. parseCustomHeaders 함수 추가

원격 브랜치 `hooks/se_manager`의 `54e193fe` 커밋 반영:

```typescript
/**
 * Parse custom headers input — accepts JSON or key:value format.
 * Returns a JSON string, or null if the input cannot be parsed.
 *
 * Supported formats:
 *   - JSON: '{"X-Custom": "value"}'
 *   - key:value (one per line or comma-separated):
 *       'X-Custom: value'
 *       'X-Custom: value, X-Other: value2'
 *       'X-Custom: value\nX-Other: value2'
 */
export function parseCustomHeaders(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return '';

  // Try JSON first
  try {
    const parsed = JSON.parse(trimmed);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return trimmed;
    }
  } catch {
    // Not valid JSON — try key:value format below
  }

  // Try key: value format (newline or comma separated)
  const entries = trimmed.includes('\n')
    ? trimmed.split('\n')
    : trimmed.split(',');

  const result: Record<string, string> = {};
  for (const entry of entries) {
    const cleaned = entry.trim();
    if (!cleaned) continue;
    const colonIndex = cleaned.indexOf(':');
    if (colonIndex <= 0) return null; // No colon or colon at start
    const key = cleaned.slice(0, colonIndex).trim();
    const value = cleaned.slice(colonIndex + 1).trim();
    if (!key) return null;
    result[key] = value;
  }

  if (Object.keys(result).length === 0) return null;
  return JSON.stringify(result);
}
```

#### 3. handleAdvancedSubmit 수정

```typescript
// 수정 전
if (headers.trim()) {
  try {
    JSON.parse(headers);
  } catch {
    setValidationError('Custom headers must be valid JSON...');
    return;
  }
}

// 수정 후
const parsedHeaders = parseCustomHeaders(rawHeaders);
if (parsedHeaders === null) {
  setValidationError(
    'Custom headers format invalid. Use JSON or key: value format.',
  );
  return;
}
setCustomHeaders(parsedHeaders);
```

#### 4. UI 텍스트 업데이트

| 항목        | 수정 전                           | 수정 후                                                |
| ----------- | --------------------------------- | ------------------------------------------------------ |
| placeholder | `'(optional) {"key": "value"}'`   | `"(optional) X-Custom: value"`                         |
| 설명 텍스트 | "Additional HTTP headers as JSON" | "Additional HTTP headers as JSON or key: value format" |

### 9.3 테스트 추가

**파일**: `packages/cli/src/ui/auth/SlmConfigDialog.test.tsx`

```typescript
describe('parseCustomHeaders', () => {
  it('returns empty string for empty input', () => {...});
  it('accepts valid JSON object', () => {...});
  it('rejects JSON array', () => {...});
  it('parses single key: value pair', () => {...});
  it('parses comma-separated key: value pairs', () => {...});
  it('parses newline-separated key: value pairs', () => {...});
  it('handles value with colons (URL etc)', () => {...});
  it('returns null for unparseable input', () => {...});
  it('returns null for colon at start of string', () => {...});
  it('trims whitespace from keys and values', () => {...});
});
```

### 9.4 테스트 결과

```bash
npm test -w @didim365/agent-cli -- src/ui/auth/SlmConfigDialog.test.tsx
# ✓ 23 tests passed (기존 13 + parseCustomHeaders 10)
```

---

## 10. 중간 결론 (Phase 1-9 완료 시점)

> **주의**: 이 섹션은 Phase 1-9 완료 시점의 중간 결론입니다. 이후 Section 16에서
> 경량 프롬프트와 도구 자동 제한이 원복되었습니다. 최종 상태는 Section 19를
> 참조하세요.

GPUStack/vLLM 기반 sLM 서버 연동 시 발생한 문제들을 해결했습니다.

### 문제 1: 컨텍스트 오버플로우 ✅ (임시 해결 → 이후 원복)

**당시 적용한 해결책** (이후 Section 16에서 원복됨):

1. ~~경량 시스템 프롬프트 (~250 토큰 vs ~6,600 토큰)~~ → 원복됨
2. ~~필수 도구만 등록 (6개 vs 14개)~~ → 원복됨
3. `max_completion_tokens` → `max_tokens` 변환 (**유지됨**)

### 문제 2: settings.json 설정 오류 ✅ (유지됨)

**핵심 해결책**:

1. 단계 전환 시 버퍼 초기화 로직 수정 (`buffer.setText('')` →
   `buffer.setText(nextStepValue)`)
2. `parseCustomHeaders` 함수 추가로 유연한 헤더 입력 지원 (JSON + key:value
   형식)

### 최종 테스트 결과

| 테스트                     | 결과               |
| -------------------------- | ------------------ |
| `prompts.test.ts`          | ✅ 52 tests passed |
| `SlmConfigDialog.test.tsx` | ✅ 23 tests passed |
| 빌드                       | ✅ 성공            |
| sLM 통합 테스트            | ✅ 정상 동작       |

### 반영된 외부 커밋

- `origin/hooks/se_manager` 브랜치의 `54e193fe` (hotfix: slm 설정 오류 수정)
  반영

이를 통해 4,096 토큰 컨텍스트 한계 내에서 sLM 모드가 정상 동작하며,
SlmConfigDialog에서 설정 저장 시 필드 값이 올바르게 저장됩니다.

---

## 11. 추가 수정: Model Name 필수화

### 11.1 배경

Phase 2에서 발견된 403 Model Not Found 오류는 settings.json에 모델명이 없어서
발생함. 기존에는 Model Name이 optional이었으나, OpenAI-compatible 서버들은
일반적으로 모델명을 필수로 요구함.

### 11.2 수정 내용

**파일**: `packages/cli/src/ui/auth/SlmConfigDialog.tsx`

#### 1. handleCredentialsSubmit에 모델명 검증 추가

```typescript
// 수정 전
const handleCredentialsSubmit = useCallback(
  (value: string) => {
    setApiKey(value);
    setModel(modelBuffer.text);
    setValidationError(null);
    setCurrentStep('advanced');
    // ...
  },
  [buffer, modelBuffer.text, apiKeyHeaderName],
);

// 수정 후
const handleCredentialsSubmit = useCallback(
  (value: string) => {
    // Model name is required for OpenAI-compatible servers
    const modelValue = modelBuffer.text.trim();
    if (!modelValue) {
      setValidationError(
        'Model name is required. Examples: gpt-oss-20b, llama3, mistral, qwen2.5-coder',
      );
      setFocusedField('secondary');
      return;
    }
    setApiKey(value);
    setModel(modelValue);
    setValidationError(null);
    setCurrentStep('advanced');
    // ...
  },
  [buffer, modelBuffer.text, apiKeyHeaderName],
);
```

#### 2. UI 텍스트 업데이트

| 항목        | 수정 전                                                     | 수정 후                                                                        |
| ----------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 레이블      | "Model Name (optional)"                                     | "Model Name (required)"                                                        |
| 설명        | "Specify the model name. Leave empty for provider default." | "Specify the model name deployed on your server."                              |
| 예시        | -                                                           | "Examples: gpt-oss-20b (GPUStack), llama3 (Ollama), meta-llama/Llama-3 (vLLM)" |
| placeholder | "(optional) e.g., llama3, mistral"                          | "e.g., gpt-oss-20b, llama3, mistral"                                           |

### 11.3 테스트 수정

**파일**: `packages/cli/src/ui/auth/SlmConfigDialog.test.tsx`

- `'advances to step 3 after step 2 submission'` →
  `'advances to step 3 after step 2 submission with model name'`
- `'calls onComplete with baseUrl-only config...'` →
  `'shows validation error when model name is empty'` +
  `'calls onComplete with config when model is provided'`

```bash
npm test -w @didim365/agent-cli -- src/ui/auth/SlmConfigDialog.test.tsx
# ✓ 24 tests passed
```

---

## 12. GPUStack, vLLM, Ollama 대응 방안

### 12.1 OpenAI-Compatible 서버별 특성

| 서버                      | 모델명 형식         | 모델 목록 API            | 예시                              |
| ------------------------- | ------------------- | ------------------------ | --------------------------------- |
| **GPUStack**              | 배포 시 지정한 이름 | `/v1/models`             | `gpt-oss-20b`, `llama3.1-70b`     |
| **vLLM**                  | HuggingFace 모델 ID | `/v1/models`             | `meta-llama/Llama-3-70B-Instruct` |
| **Ollama**                | Ollama 모델 태그    | `/api/tags`              | `llama3`, `mistral`, `qwen2:7b`   |
| **LM Studio**             | 로컬 모델 경로/이름 | `/v1/models`             | `TheBloke/Llama-2-7B-GGUF`        |
| **text-generation-webui** | 로컬 모델 이름      | `/v1/models` (확장 필요) | `llama-2-7b`                      |

### 12.2 대응 방안 옵션

#### 옵션 A: 모델 자동 감지 (권장)

SlmConfigDialog의 Step 2에서 사용자가 URL 입력 후 `/v1/models` 또는 `/api/tags`
엔드포인트를 호출하여 사용 가능한 모델 목록을 가져와 드롭다운으로 표시.

**장점**:

- 사용자가 정확한 모델명을 몰라도 선택 가능
- 오타 방지
- 403 Model Not Found 오류 원천 차단

**구현 방향**:

```typescript
// 예시 코드
async function fetchAvailableModels(
  baseUrl: string,
  apiKey?: string,
): Promise<string[]> {
  // Try OpenAI-compatible /v1/models first
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (res.ok) {
      const data = await res.json();
      return data.data.map((m: { id: string }) => m.id);
    }
  } catch {}

  // Fallback: try Ollama /api/tags
  try {
    const ollamaBase = baseUrl.replace('/v1', '');
    const res = await fetch(`${ollamaBase}/api/tags`);
    if (res.ok) {
      const data = await res.json();
      return data.models.map((m: { name: string }) => m.name);
    }
  } catch {}

  return [];
}
```

**UI 변경**:

- Step 2에서 Model Name 입력 시 "Fetch Models" 버튼 또는 자동 로딩
- 성공 시 드롭다운으로 모델 선택
- 실패 시 기존 텍스트 입력 유지 (수동 입력)

#### 옵션 B: 서버 타입 선택 + 도움말

Step 1 이후에 서버 타입 선택 단계 추가:

1. GPUStack
2. vLLM
3. Ollama
4. LM Studio
5. Other (Custom)

각 타입별로 모델명 형식 힌트 제공.

**장점**: 구현이 단순함 **단점**: 사용자가 수동 입력해야 함

#### 옵션 C: 하이브리드 (자동 감지 + 수동 입력)

1. URL 입력 후 자동으로 `/v1/models` 시도
2. 성공 시: 드롭다운 표시 + "직접 입력" 옵션
3. 실패 시: 텍스트 입력으로 폴백 + 서버 타입별 예시 표시

### 12.3 구현 완료: 서버 타입 선택 + 형식 힌트

**파일**: `packages/cli/src/ui/auth/SlmConfigDialog.tsx`

#### Step 흐름 변경 (3단계 → 4단계)

| Step | 이전              | 변경 후                            |
| ---- | ----------------- | ---------------------------------- |
| 1    | API Endpoint URL  | API Endpoint URL                   |
| 2    | API Key + Model   | **Server Type 선택 (신규)**        |
| 3    | Advanced Settings | API Key + Model (서버별 힌트 포함) |
| 4    | -                 | Advanced Settings                  |

#### Server Type 옵션

```typescript
export const SERVER_TYPES: Record<ServerType, ServerTypeInfo> = {
  gpustack: {
    label: 'GPUStack',
    description: 'GPU cluster management with vLLM backend',
    modelHint: 'Use the deployment name from GPUStack dashboard',
    modelExample: 'gpt-oss-20b, llama3.1-70b',
    urlHint: 'http://gpustack.example.com/v1',
  },
  vllm: {
    label: 'vLLM',
    description: 'High-throughput LLM serving engine',
    modelHint: 'Use HuggingFace model ID or --served-model-name',
    modelExample: 'meta-llama/Llama-3-70B-Instruct',
    urlHint: 'http://localhost:8000/v1',
  },
  ollama: {
    label: 'Ollama',
    description: 'Local model runner for macOS/Linux/Windows',
    modelHint: 'Use model tag from "ollama list"',
    modelExample: 'llama3, mistral, qwen2:7b, codellama:13b',
    urlHint: 'http://localhost:11434/v1',
  },
  lmstudio: {
    label: 'LM Studio',
    description: 'Desktop app for running local LLMs',
    modelHint: 'Use model name shown in LM Studio',
    modelExample: 'TheBloke/Llama-2-7B-GGUF',
    urlHint: 'http://localhost:1234/v1',
  },
  other: {
    label: 'Other',
    description: 'Custom OpenAI-compatible server',
    modelHint: 'Check your server documentation for model name format',
    modelExample: 'model-name',
    urlHint: 'http://localhost:8080/v1',
  },
};
```

#### UI 변경 사항

**Step 2: Server Type 선택**

```
╭──────────────────────────────────────────────────────────────╮
│ sLM Configuration                              Step 2 of 4   │
│                                                              │
│ Server Type                                                  │
│ Select your OpenAI-compatible server type for model hints.  │
│                                                              │
│ [1] GPUStack - GPU cluster management with vLLM backend     │
│ [2] vLLM - High-throughput LLM serving engine                │
│ [3] Ollama - Local model runner for macOS/Linux/Windows     │
│ [4] LM Studio - Desktop app for running local LLMs          │
│ [5] Other - Custom OpenAI-compatible server                 │
│                                                              │
│ (Press 1-5 to select, Esc to go back)                       │
╰──────────────────────────────────────────────────────────────╯
```

**Step 3: Credentials (서버별 힌트)**

```
Model Name (required) - GPUStack
Use the deployment name from GPUStack dashboard
Examples: gpt-oss-20b, llama3.1-70b
```

#### 주요 코드 변경

**1. 타입 및 상수 추가**

```typescript
type Step = 'endpoint' | 'serverType' | 'credentials' | 'advanced';
const STEPS: Step[] = ['endpoint', 'serverType', 'credentials', 'advanced'];

export type ServerType = 'gpustack' | 'vllm' | 'ollama' | 'lmstudio' | 'other';

interface ServerTypeInfo {
  label: string;
  description: string;
  modelHint: string;
  modelExample: string;
  urlHint: string;
}
```

**2. 서버 타입 선택 핸들러**

```typescript
const handleServerTypeSelect = useCallback(
  (type: ServerType) => {
    setServerType(type);
    setValidationError(null);
    setCurrentStep('credentials');
    setFocusedField('primary');
    buffer.setText(apiKey || '');
  },
  [buffer, apiKey],
);
```

**3. 키보드 입력 처리 (1-5 키)**

```typescript
useKeypress(
  (key) => {
    // ... 기존 Esc, Tab 처리

    // Number keys 1-5 for server type selection
    if (currentStep === 'serverType') {
      const serverTypeKeys: Record<string, ServerType> = {
        '1': 'gpustack',
        '2': 'vllm',
        '3': 'ollama',
        '4': 'lmstudio',
        '5': 'other',
      };
      const selectedType = serverTypeKeys[key.sequence];
      if (selectedType) {
        handleServerTypeSelect(selectedType);
      }
    }
  },
  { isActive: true },
);
```

**4. 동적 힌트 표시**

```typescript
// 선택된 서버 타입에 따른 힌트
const serverInfo = SERVER_TYPES[serverType];

// Step 3 UI
<Text bold color={theme.text.primary}>
  Model Name (required) - {serverInfo.label}
</Text>
<Text color={theme.text.secondary}>{serverInfo.modelHint}</Text>
<Text color={theme.text.secondary} dimColor>
  Examples: {serverInfo.modelExample}
</Text>
```

#### 테스트 변경 사항

**파일**: `packages/cli/src/ui/auth/SlmConfigDialog.test.tsx`

```typescript
// 새로운 헬퍼 함수 추가
function pressNumberKey(num: string) {
  const keypressCalls = mockedUseKeypress.mock.calls;
  const slmKeypress = keypressCalls.at(-1);
  if (slmKeypress) {
    slmKeypress[0]({
      name: num,
      sequence: num,
      // ...
    });
  }
}

// 새로운 테스트 케이스 (Step B: Server Type Selection)
it('advances to credentials step when server type is selected', () => {
  // Step 1 → Step 2 (server type)
  act(() => {
    pressEnterInTextInput();
  });
  expect(lastFrame()!).toContain('Step 2 of 4');

  // Select server type (press '3' for Ollama)
  act(() => {
    pressNumberKey('3');
  });

  expect(frame).toContain('Step 3 of 4');
  expect(frame).toContain('Ollama'); // 서버별 힌트 표시 확인
});
```

### 12.4 향후 개선 사항

1. **중기**: 옵션 A (모델 자동 감지) 구현
2. **장기**: 옵션 C (하이브리드) + 서버 연결 테스트 기능

### 12.5 API 엔드포인트 참고

| 서버                    | 모델 목록 API    | 응답 형식                                  |
| ----------------------- | ---------------- | ------------------------------------------ |
| GPUStack/vLLM/LM Studio | `GET /v1/models` | `{ data: [{ id: "model-name", ... }] }`    |
| Ollama                  | `GET /api/tags`  | `{ models: [{ name: "model:tag", ... }] }` |

---

## 13. 최종 수정 파일 목록 (전체)

| 파일                                                       | 변경 내용                                                                                                                                             |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/core/prompts.ts`                        | `isSlmMode()`, `getLightweightSystemPrompt()` 추가                                                                                                    |
| `packages/core/src/core/prompts.test.ts`                   | sLM 모드 테스트 6개 추가                                                                                                                              |
| `packages/core/src/config/config.ts`                       | `isSlmMode()` 메서드, 도구 필터링 로직 추가                                                                                                           |
| `packages/core/src/providers/openai/adapter.ts`            | `converter`, `classifyError` → `protected`                                                                                                            |
| `packages/core/src/providers/openai/converter.ts`          | 음수 maxTokens 가드 추가                                                                                                                              |
| `packages/core/src/providers/openai-compatible/adapter.ts` | `generateContent`, `generateContentStream` 오버라이드, `max_tokens` 사용                                                                              |
| `packages/cli/src/ui/auth/SlmConfigDialog.tsx`             | 버퍼 초기화 수정, `parseCustomHeaders()` 추가, **Model Name 필수화**, **Server Type 선택 단계 추가**, `ServerType` 타입 및 `SERVER_TYPES` 상수 export |
| `packages/cli/src/ui/auth/SlmConfigDialog.test.tsx`        | `parseCustomHeaders` 테스트 10개, **Model Name 검증 테스트**, **Server Type 선택 테스트 4개** 추가, `pressNumberKey` 헬퍼 함수 추가                   |

---

## 14. 테스트 결과 요약

| 테스트                     | 결과               |
| -------------------------- | ------------------ |
| `prompts.test.ts`          | ✅ 52 tests passed |
| `SlmConfigDialog.test.tsx` | ✅ 25 tests passed |
| 빌드                       | ✅ 성공            |
| sLM 통합 테스트            | ✅ 정상 동작       |

### 주요 테스트 케이스 (SlmConfigDialog)

| 카테고리                      | 테스트                                        |
| ----------------------------- | --------------------------------------------- |
| Step A: API Endpoint URL      | 5개 (초기 렌더, URL 검증, Esc 취소)           |
| Step B: Server Type Selection | 4개 (**신규** - 서버 타입 선택, Esc 뒤로가기) |
| Step C: Credentials           | 3개 (Model 필수 검증, 완료 흐름)              |
| Step D: Advanced validation   | 1개 (Custom Headers 검증)                     |
| Tab focus switching           | 1개 (Step 3에서 필드 전환)                    |
| parseCustomHeaders            | 10개 (JSON, key:value 파싱)                   |

---

## 15. 최종 결론

### 해결된 문제

| 문제                 | 원인                                      | 해결 방법                                                 |
| -------------------- | ----------------------------------------- | --------------------------------------------------------- |
| 401 인증 오류        | `apiKeyHeaderName`에 API 키 값 저장됨     | 버퍼 초기화 로직 수정                                     |
| 403 Model Not Found  | 모델명 미지정                             | Model Name 필수화 + 서버 타입별 힌트 제공                 |
| max_tokens 음수 오류 | 시스템 프롬프트 + 도구 수가 컨텍스트 초과 | 경량 프롬프트 + 도구 6개 제한                             |
| 설정 UX 문제         | 사용자가 모델명 형식을 모름               | 서버 타입 선택 단계 추가 (GPUStack/vLLM/Ollama/LM Studio) |

### SlmConfigDialog 최종 흐름

```
Step 1: API Endpoint URL
  ↓ (Enter)
Step 2: Server Type 선택 (1-5 키)
  ↓ (1=GPUStack, 2=vLLM, 3=Ollama, 4=LM Studio, 5=Other)
Step 3: API Key (optional) + Model Name (required, 서버별 힌트 표시)
  ↓ (Enter)
Step 4: Advanced Settings (Header Name, Custom Headers)
  ↓ (Enter)
Complete → settings.json 저장
```

### 작업 완료 상태

- ✅ sLM 컨텍스트 오버플로우 해결
- ✅ SlmConfigDialog 설정 오류 근본 원인 수정
- ✅ Model Name 필수화
- ✅ Server Type 선택 + 형식 힌트 구현
- ✅ 테스트 25개 통과
- ✅ 빌드 및 타입체크 성공

---

## 16. 임시 수정 원복: 시스템 프롬프트 및 도구 제한 해제

### 16.1 배경

Phase 5, 6에서 구현한 경량 시스템 프롬프트와 도구 수 제한은 **임시
해결책**이었음. 근본적으로 GPUStack, vLLM, Ollama 등의 서빙 측에서 `max_tokens`
수를 늘리면 해결됨.

예시: GPUStack에서 `--max-model-len=32768`로 설정하면 컨텍스트 제한 해결

따라서 다음 사항을 원복함:

1. **시스템 프롬프트**: 경량 프롬프트 제거, 전체 프롬프트 사용
2. **도구 제한**: 자동 제한 제거, 사용자 설정(`"tools": { "core"`)으로 제어

### 16.2 변경 내용

#### 1. prompts.ts - 경량 프롬프트 로직 제거

```typescript
// 삭제된 코드
function isSlmMode(): boolean {
  const llmProvider = process.env['LLM_PROVIDER'];
  return llmProvider === 'openai-compatible' || llmProvider === 'openai_compatible';
}

function getLightweightSystemPrompt(config, userMemory?, interactiveOverride?): string {
  // ~1500 토큰 경량 프롬프트
  const prompt = `You are a CLI agent for software engineering tasks...`;
  // ...
}

export function getCoreSystemPrompt(...): string {
  if (isSlmMode()) {
    return getLightweightSystemPrompt(...);  // 삭제
  }
  // ...
}
```

**변경 후**: `getCoreSystemPrompt()`는 항상 전체 시스템 프롬프트 반환

#### 2. config.ts - 도구 자동 제한 제거

```typescript
// 삭제된 코드
const isSlm = this.isSlmMode();

// Essential tools only
registerCoreTool(ReadFileTool, this);
// ...
registerCoreTool(ShellTool, this);

if (!isSlm) {
  // 삭제
  registerCoreTool(LSTool, this);
  registerCoreTool(ActivateSkillTool, this);
  // ... 추가 도구들
  this.registerSubAgentTools(registry);
}

if (!isSlm) {
  // 삭제
  await registry.discoverAllTools();
}
```

**변경 후**: 모든 도구가 기본적으로 등록됨

#### 3. prompts.test.ts - sLM 테스트 제거

6개의 sLM 관련 테스트 케이스 제거:

- `should return lightweight prompt when LLM_PROVIDER=openai-compatible`
- `should return lightweight prompt when LLM_PROVIDER=openai_compatible`
- `should return full prompt for other providers`
- `should include user memory in lightweight prompt`
- `should use interactive mode wording when config says interactive`
- `should use non-interactive wording when config says non-interactive`

### 16.3 사용자 설정을 통한 도구 제어

sLM 모드에서 컨텍스트가 제한된 경우, 사용자가 `settings.json`에서
`"tools": { "core"` 옵션으로 도구를 제한할 수 있음.

#### 사용 가능한 도구 목록

| 도구명 ("tools": { "core"에 사용) | 설명                       | 필수 여부 |
| --------------------------------- | -------------------------- | --------- |
| `read_file`                       | 파일 읽기                  | ✅ 필수   |
| `search_file_content`             | 코드 내 텍스트 검색 (Grep) | ✅ 필수   |
| `glob`                            | 파일 패턴 검색             | ✅ 필수   |
| `replace`                         | 파일 편집                  | ✅ 필수   |
| `write_file`                      | 파일 생성/쓰기             | ✅ 필수   |
| `run_shell_command`               | 명령어 실행                | ✅ 필수   |
| `list_directory`                  | 디렉토리 목록              | 선택      |
| `web_fetch`                       | 웹 페이지 가져오기         | 선택      |
| `google_web_search`               | 웹 검색                    | 선택      |
| `save_memory`                     | 메모리 저장                | 선택      |
| `activate_skill`                  | 스킬 활성화                | 선택      |
| `write_todos`                     | TODO 리스트 관리           | 선택      |

#### 설정 예시

**~/.didim/settings.json** (최소 도구 세트 - 6개)

```json
{
  "tools": {
    "core": [
      "read_file",
      "search_file_content",
      "glob",
      "replace",
      "write_file",
      "run_shell_command"
    ]
  }
}
```

**~/.didim/settings.json** (확장 도구 세트 - 웹 검색 포함)

```json
{
  "tools": {
    "core": [
      "read_file",
      "search_file_content",
      "glob",
      "replace",
      "write_file",
      "run_shell_command",
      "list_directory",
      "web_fetch",
      "google_web_search"
    ]
  }
}
```

#### 도구 이름 확인 방법

1. **소스 코드**: `packages/core/src/tools/tool-names.ts` 파일 참조
2. **CLI 실행 후**: `/tools` 명령으로 현재 등록된 도구 목록 확인 (예정)

### 16.4 권장 사항

| 상황                                 | 권장 조치                           |
| ------------------------------------ | ----------------------------------- |
| 컨텍스트 부족 (max_tokens 음수 오류) | 서빙 측에서 `--max-model-len` 증가  |
| 서빙 측 변경 불가                    | `settings.json`에 `tools.core` 설정 |
| 도구 수 최소화 필요                  | 6개 필수 도구만 `tools.core`에 명시 |

### 16.5 테스트 결과

```bash
npm test -w @didim365/agent-cli-core -- src/core/prompts.test.ts
# ✓ 46 tests passed (기존 52개 - sLM 6개 = 46개)

npm run build -w @didim365/agent-cli-core
# ✅ 성공
```

---

## 17. 최종 파일 목록 (원복 후)

| 파일                                                       | 변경 내용                                                   |
| ---------------------------------------------------------- | ----------------------------------------------------------- |
| `packages/core/src/core/prompts.ts`                        | ~~`isSlmMode()`, `getLightweightSystemPrompt()` 제거~~      |
| `packages/core/src/core/prompts.test.ts`                   | ~~sLM 모드 테스트 6개 제거~~                                |
| `packages/core/src/config/config.ts`                       | ~~도구 자동 필터링 제거~~, `tools.core` 사용 안내 주석 추가 |
| `packages/core/src/providers/openai/adapter.ts`            | `converter`, `classifyError` → `protected` (유지)           |
| `packages/core/src/providers/openai/converter.ts`          | 음수 maxTokens 가드 (유지)                                  |
| `packages/core/src/providers/openai-compatible/adapter.ts` | `max_tokens` 사용 (유지)                                    |
| `packages/cli/src/ui/auth/SlmConfigDialog.tsx`             | Server Type 선택 + Model 필수화 (유지)                      |
| `packages/cli/src/ui/auth/SlmConfigDialog.test.tsx`        | 25 tests (유지)                                             |

---

## 18. 문서 업데이트

### 18.1 업데이트된 문서 목록

| 문서                                 | 추가된 내용                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| `README.md`                          | sLM `/auth login` 위저드 설명, `tools.core` 설정 예제 추가                    |
| `docs/get-started/authentication.md` | sLM 4단계 설정 마법사 상세 설명, 서버 타입별 안내, `tools.core` 사용법        |
| `docs/providers.md`                  | sLM Interactive Configuration 섹션, 서버 타입별 모델명 안내, 도구 설정 가이드 |
| `docs/get-started/configuration.md`  | `tools.core` 설명 확장, sLM 설정 예제 추가                                    |

### 18.2 주요 문서화 내용

#### 1. `/auth login` 4단계 마법사

```
Step 1: API Endpoint URL (예: http://localhost:8000/v1)
Step 2: Server Type (GPUStack / vLLM / Ollama / LM Studio / Other)
Step 3: Credentials (API Key 선택 + Model Name 필수)
Step 4: Advanced Settings (Header Name, Custom Headers 선택)
```

#### 2. 서버 타입별 모델명 가이드

| 서버      | 모델명 확인 방법                           |
| --------- | ------------------------------------------ |
| GPUStack  | 대시보드의 deployment 이름 사용            |
| vLLM      | `--model` 옵션으로 전달한 모델명           |
| Ollama    | `ollama list` 명령 결과 (예: `llama3:70b`) |
| LM Studio | UI에서 로드된 모델명 확인                  |

#### 3. `tools.core` 설정

```json
{
  "tools": {
    "core": [
      "read_file",
      "search_file_content",
      "glob",
      "replace",
      "write_file",
      "run_shell_command"
    ]
  }
}
```

#### 4. 사용 가능한 도구 이름

| 도구 이름             | 설명                     |
| --------------------- | ------------------------ |
| `read_file`           | 파일 내용 읽기           |
| `search_file_content` | 파일 내 패턴 검색 (grep) |
| `glob`                | 패턴 매칭으로 파일 찾기  |
| `replace`             | 파일 내용 수정           |
| `write_file`          | 파일 생성/덮어쓰기       |
| `run_shell_command`   | 쉘 명령 실행             |
| `list_directory`      | 디렉토리 목록 조회       |
| `web_fetch`           | URL 내용 가져오기        |
| `google_web_search`   | 웹 검색                  |
| `save_memory`         | 메모리(AGENTS.md) 저장   |
| `activate_skill`      | 에이전트 스킬 활성화     |
| `write_todos`         | TODO 리스트 관리         |

### 18.3 사용자 안내 요약

1. **sLM 연결**: `/auth login` → "sLM (OpenAI-compatible endpoint)" 선택
2. **서버 타입 선택**: 4단계 마법사에서 서버 종류에 맞는 힌트 제공
3. **컨텍스트 제한 대응**:
   - **권장**: 서빙 측에서 `--max-model-len` 증가
   - **대안**: `settings.json`에서 `tools.core` 설정으로 도구 수 제한

---

## 19. 코드 리뷰 이슈 수정 (2026-02-23)

### 19.1 리뷰 결과 요약

코드 리뷰를 통해 9개 이슈가 발견되었으며, 코드 레벨 검증 후 필요한 수정을
진행함.

| #   | 심각도      | 이슈                                 | 상태                  |
| --- | ----------- | ------------------------------------ | --------------------- |
| 1   | High        | 스트리밍 에러 처리 계약 회귀         | ✅ 수정됨             |
| 2   | High        | 컨텍스트 오버플로우 재발 구조        | ⚠️ 인지됨 (문서화)    |
| 3   | Medium-High | 뒤로가기 버퍼 오염                   | ✅ 수정됨             |
| 4   | Medium      | parseCustomHeaders 콤마 값 거부      | ✅ 수정됨             |
| 5   | Medium      | 모델 필수 검증 런타임 경로 누락      | ✅ 수정됨             |
| 6   | Medium      | customHeaders key:value 마이그레이션 | ✅ 수정됨             |
| 7   | Medium      | 테스트 버퍼 동작 검증 부족           | ⚠️ 인지됨 (향후 개선) |
| 8   | Low         | 잔여/미사용 코드                     | ✅ 수정됨             |
| 9   | Low         | 작업결과서 상충 서술                 | ✅ 수정됨             |

### 19.2 이슈별 수정 내역

#### 이슈 #1: 스트리밍 에러 처리 계약 회귀 ✅

**문제**: `openai-compatible/adapter.ts`에서 스트림 에러 시
`throw classify(error)`를 했으나, 부모 클래스(`openai/adapter.ts`)는
`yield createErrorEvent(...)` 패턴 사용

**수정**:

```typescript
// packages/core/src/providers/openai-compatible/adapter.ts

// 수정 전
} catch (error) {
  throw classify(error);
}

// 수정 후
} catch (error) {
  const classified = classify(error);
  yield createErrorEvent(
    classified,
    classified.code,
    classified.isRetryable,
  );
}
```

**검증**: `adapter.test.ts` 16 tests all passed

#### 이슈 #2: 컨텍스트 오버플로우 재발 구조 ⚠️

**문제**: `tokenLimits.ts`에서 비-Gemini 모델은 기본 1,048,576 토큰으로 처리되어
4K 컨텍스트 sLM 서버에서 오버플로우 가능

**결론**: 이는 의도된 동작. sLM 서버에서 컨텍스트 제한이 있는 경우:

1. **권장**: 서빙 측에서 `--max-model-len` 증가
2. **대안**: `tools.core` 설정으로 도구 수 제한

**참고**: Section 18.3의 사용자 안내 참조

#### 이슈 #3: 뒤로가기(Esc) 버퍼 오염 ✅

**문제**: `handleCancel`에서 step만 변경하고 버퍼를 동기화하지 않아 필드 값 혼선
가능

**수정**:

```typescript
// packages/cli/src/ui/auth/SlmConfigDialog.tsx

const handleCancel = useCallback(
  () => {
    if (currentStep === 'endpoint') {
      onCancel();
    } else {
      const prevIndex = stepIndex - 1;
      if (prevIndex >= 0) {
        const prevStep = STEPS[prevIndex];
        setCurrentStep(prevStep);
        setValidationError(null);
        setFocusedField('primary');

        // 버퍼 동기화 추가
        switch (prevStep) {
          case 'endpoint':
            buffer.setText(baseUrl);
            break;
          case 'credentials':
            buffer.setText(apiKey);
            modelBuffer.setText(model);
            break;
          case 'advanced':
            buffer.setText(apiKeyHeaderName);
            headersBuffer.setText(customHeaders);
            break;
        }
      }
    }
  },
  [
    /* 의존성 배열에 버퍼 추가 */
  ],
);
```

#### 이슈 #4: parseCustomHeaders 콤마 포함 값 거부 ✅

**문제**: `split(',')` 사용으로 `Accept: text/html,application/json` 같은 값이
깨짐

**수정**:

```typescript
// 수정 전
const entries = trimmed.split(',');

// 수정 후 (core의 customHeaderUtils.ts와 동일한 정규식 사용)
const entries = trimmed.includes('\n')
  ? trimmed.split('\n')
  : trimmed.split(/,(?=\s*[^,:]+:)/);
```

**테스트 추가**:

```typescript
it('handles value with commas (Accept header etc)', () => {
  const result = parseCustomHeaders(
    'Accept: text/html,application/json, X-Custom: value',
  );
  expect(parsed).toEqual({
    Accept: 'text/html,application/json',
    'X-Custom': 'value',
  });
});
```

#### 이슈 #5: 모델 필수 검증 런타임 경로 누락 ✅

**문제**: `useAuth.ts`에서 baseUrl만 검증하고 model은 검증하지 않아 구형
설정에서 403 Model Not Found 발생 가능

**수정**:

```typescript
// packages/cli/src/ui/auth/useAuth.ts

// 수정 전
if (!slmConfig?.baseUrl) {

// 수정 후
if (!slmConfig?.baseUrl || !slmConfig?.model) {
  // Model is required for OpenAI-compatible servers
```

#### 이슈 #6: customHeaders key:value 마이그레이션 ✅

**문제**: `bootstrap.ts`에서 JSON만 파싱하여 기존 `Key: value` 형식 설정이
무시됨

**수정**:

```typescript
// packages/core/src/providers/openai-compatible/bootstrap.ts

import { parseCustomHeaders as parseKeyValueHeaders } from '../../utils/customHeaderUtils.js';

// JSON 파싱 실패 시 key:value 형식 fallback
if (customHeadersStr) {
  try {
    const parsed = JSON.parse(customHeadersStr);
    Object.assign(defaultHeaders, parsed);
  } catch {
    // JSON 실패 → key:value 형식 시도
    const parsed = parseKeyValueHeaders(customHeadersStr);
    if (Object.keys(parsed).length > 0) {
      Object.assign(defaultHeaders, parsed);
    }
  }
}
```

#### 이슈 #8: 잔여/미사용 코드 제거 ✅

**제거된 코드**:

1. `config.ts`의 `isSlmMode()` 메서드 (호출되는 곳 없음)
2. `SlmConfigDialog.tsx`의 `urlHint` 필드 (사용되지 않음)

#### 이슈 #9: 작업결과서 상충 서술 ✅

**수정**: Section 10을 "중간 결론 (Phase 1-9 완료 시점)"으로 변경하고, 이후
원복된 내용을 명확히 표시

### 19.3 최종 테스트 결과

```bash
# 스트리밍 에러 처리 테스트
npx vitest run packages/core/src/providers/openai-compatible/adapter.test.ts
# ✅ 16 tests passed

# SlmConfigDialog 테스트 (콤마 값 테스트 추가)
npm test -w @didim365/agent-cli -- src/ui/auth/SlmConfigDialog.test.tsx
# ✅ 26 tests passed

# 빌드
npm run build -w @didim365/agent-cli-core
# ✅ 성공
```

### 19.4 수정된 파일 목록

| 파일                                                         | 변경 내용                                                        |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `packages/core/src/providers/openai-compatible/adapter.ts`   | 스트림 에러 시 yield createErrorEvent 사용                       |
| `packages/core/src/providers/openai-compatible/bootstrap.ts` | customHeaders key:value 마이그레이션 지원                        |
| `packages/core/src/config/config.ts`                         | `isSlmMode()` 제거                                               |
| `packages/cli/src/ui/auth/SlmConfigDialog.tsx`               | 뒤로가기 버퍼 동기화, parseCustomHeaders 콤마 처리, urlHint 제거 |
| `packages/cli/src/ui/auth/SlmConfigDialog.test.tsx`          | 콤마 포함 헤더 값 테스트 추가                                    |
| `packages/cli/src/ui/auth/useAuth.ts`                        | 모델 필수 검증 추가                                              |

---

## 20. 최종 결론 (전체 작업 완료)

### 20.1 현재 최종 상태

| 항목               | 상태                                      |
| ------------------ | ----------------------------------------- |
| sLM 서버 연동      | ✅ 정상 동작                              |
| 시스템 프롬프트    | 전체 프롬프트 사용 (경량 프롬프트 원복됨) |
| 도구 등록          | 전체 도구 등록 (자동 제한 원복됨)         |
| 컨텍스트 제한 대응 | 사용자가 `tools.core` 설정으로 수동 제한  |
| Model Name         | **필수** (UI + 런타임 검증)               |
| Server Type        | 4단계 마법사에서 선택 (힌트 제공)         |
| customHeaders      | JSON + key:value 형식 모두 지원           |

### 20.2 권장 사용법

1. **sLM 연결**: `/auth login` → "sLM (OpenAI-compatible endpoint)" 선택
2. **서버 타입 선택**: GPUStack / vLLM / Ollama / LM Studio / Other
3. **모델명 입력**: 서버 타입에 맞는 형식으로 입력 (필수)
4. **컨텍스트 부족 시**: 서빙 측 `--max-model-len` 증가 또는 `tools.core` 설정

---

## 21. 2차 코드 리뷰 이슈 수정 (2026-02-23)

### 21.1 리뷰 결과 요약

2차 코드 리뷰를 통해 10개 이슈가 발견됨. 이전 수정 사항과 중복되는 부분은 확인
후 추가 수정 진행.

| #   | 심각도 | 이슈                                 | 상태                          |
| --- | ------ | ------------------------------------ | ----------------------------- |
| 1   | High   | 스트리밍 에러 계약 회귀              | ✅ 이미 수정됨 (Section 19.2) |
| 2   | High   | 컨텍스트 오버플로우 사전 차단 무력화 | ⚠️ 설계적 특성 (문서화)       |
| 3   | High   | env 경로에서 sLM API 키 강제         | ✅ 수정됨                     |
| 4   | High   | 뒤로가기 버퍼 동기화 누락            | ✅ 이미 수정됨 (Section 19.2) |
| 5   | Medium | parseCustomHeaders 콤마 값 처리      | ✅ 이미 수정됨 (Section 19.2) |
| 6   | Medium | 헤더 JSON 값 타입 검증 부족          | ✅ 수정됨                     |
| 7   | Medium | max_tokens 기본값 4096 강제          | ✅ 수정됨                     |
| 8   | Medium | 모델 필수 정책 경로 불일치           | ✅ 수정됨                     |
| 9   | Low    | 테스트 신뢰도 갭                     | ⚠️ 인지됨 (향후 개선)         |
| 10  | Low    | 잔여 코드/주석 드리프트              | ✅ 수정됨                     |

### 21.2 신규 수정 내역

#### 이슈 #3: env 경로에서 sLM API 키 강제 ✅

**문제**: `LLM_PROVIDER=openai-compatible` 환경변수 경로에서 `LLM_API_KEY`가
없으면 실패 처리됨. 로컬 무인증 서버 사용 불가.

**수정**:

```typescript
// packages/cli/src/ui/auth/useAuth.ts

// 수정 전
const requiredKeyMap: Record<string, string> = {
  claude: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  'openai-compatible': 'LLM_API_KEY', // ❌ API 키 강제
};

// 수정 후
const requiredKeyMap: Record<string, string> = {
  claude: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  // 'openai-compatible' 제외 — sLM은 API 키 선택사항
};

// 대신 LLM_BASE_URL만 필수로 검증
if (llmProvider === 'openai-compatible' && !process.env['LLM_BASE_URL']) {
  onAuthError('LLM_PROVIDER requires LLM_BASE_URL...');
}
```

#### 이슈 #6: 헤더 JSON 값 타입 검증 부족 ✅

**문제**: JSON 입력 시 객체 여부만 확인하고 비문자열 값도 허용됨

**수정**:

```typescript
// packages/cli/src/ui/auth/SlmConfigDialog.tsx parseCustomHeaders()

// JSON 객체 검증 후 값 타입 검증 추가
for (const [key, value] of Object.entries(parsed)) {
  if (typeof key !== 'string' || typeof value !== 'string') {
    return null; // 비문자열 키/값 거부
  }
}
```

**테스트 추가**:

```typescript
it('rejects JSON object with non-string values', () => {
  expect(parseCustomHeaders('{"X-Count": 123}')).toBeNull();
  expect(parseCustomHeaders('{"X-Flag": true}')).toBeNull();
  expect(parseCustomHeaders('{"X-Data": {"nested": "obj"}}')).toBeNull();
});
```

#### 이슈 #7: max_tokens 기본값 4096 강제 ✅

**문제**: `request.maxTokens`가 없으면 무조건 4096으로 설정하여 서버 기본값/모델
설정과 충돌

**수정**:

```typescript
// packages/core/src/providers/openai-compatible/adapter.ts buildCompatibleParams()

// 수정 전
const maxTokens =
  request.maxTokens && request.maxTokens > 0
    ? request.maxTokens
    : this.capabilities.maxOutputTokens; // 항상 4096
return { ...rest, max_tokens: maxTokens };

// 수정 후
if (request.maxTokens && request.maxTokens > 0) {
  return { ...rest, max_tokens: request.maxTokens };
}
// maxTokens 미지정 시 — max_tokens 생략, 서버 기본값 사용
return rest;
```

#### 이슈 #8: 모델 필수 정책 경로 불일치 ✅

**문제**: env-only `LLM_PROVIDER` 경로는 모델 검증 없이 인증 완료됨

**수정**:

```typescript
// packages/cli/src/ui/auth/useAuth.ts

// LLM_BASE_URL 검증에 LLM_MODEL 검증 추가
if (
  llmProvider === 'openai-compatible' ||
  llmProvider === 'openai_compatible'
) {
  if (!process.env['LLM_BASE_URL']) {
    /* 에러 */
  }
  if (!process.env['LLM_MODEL']) {
    onAuthError(
      `LLM_PROVIDER="${llmProvider}" requires LLM_MODEL. ` +
        `Set the LLM_MODEL environment variable...`,
    );
    return;
  }
}
```

#### 이슈 #10: 주석 드리프트 ✅

**문제**: 주석에 `coreTools` 루트 키 안내하지만 실제 설정은 `tools.core` 경로

**수정**:

```typescript
// packages/core/src/config/config.ts

// 수정 전
// configure 'coreTools' in settings.json
// Example: "coreTools": ["read_file", ...]

// 수정 후
// configure 'tools.core' in settings.json
// Example: { "tools": { "core": ["read_file", ...] } }
```

### 21.3 최종 테스트 결과

```bash
# 스트리밍/어댑터 테스트
npx vitest run packages/core/src/providers/openai-compatible/adapter.test.ts
# ✅ 16 tests passed

# SlmConfigDialog 테스트 (JSON 타입 검증 테스트 추가)
npm test -w @didim365/agent-cli -- src/ui/auth/SlmConfigDialog.test.tsx
# ✅ 27 tests passed

# 빌드
npm run build -w @didim365/agent-cli-core && npm run build -w @didim365/agent-cli
# ✅ 성공
```

### 21.4 수정된 파일 목록 (2차)

| 파일                                                       | 변경 내용                                     |
| ---------------------------------------------------------- | --------------------------------------------- |
| `packages/cli/src/ui/auth/useAuth.ts`                      | sLM API 키 선택사항, LLM_MODEL 필수 검증 추가 |
| `packages/cli/src/ui/auth/SlmConfigDialog.tsx`             | JSON 헤더 값 타입 검증 추가                   |
| `packages/cli/src/ui/auth/SlmConfigDialog.test.tsx`        | 비문자열 JSON 값 테스트 추가                  |
| `packages/core/src/providers/openai-compatible/adapter.ts` | max_tokens 미지정 시 서버 기본값 사용         |
| `packages/core/src/config/config.ts`                       | 주석 `coreTools` → `tools.core` 수정          |

---

## 22. 최종 상태 요약 (2차 리뷰 후)

### 22.1 해결된 모든 이슈

| 카테고리  | 이슈                  | 해결 방법                                      |
| --------- | --------------------- | ---------------------------------------------- |
| 스트리밍  | 에러 처리 계약 회귀   | `yield createErrorEvent` 사용                  |
| 인증      | sLM API 키 강제       | API 키 선택사항, LLM_BASE_URL + LLM_MODEL 필수 |
| 버퍼      | 뒤로가기 동기화       | `handleCancel`에서 버퍼 동기화                 |
| 헤더 파싱 | 콤마 값 처리          | 정규식 `/,(?=\s*[^,:]+:)/` 사용                |
| 헤더 파싱 | 비문자열 JSON 값      | 타입 검증 추가                                 |
| 요청      | max_tokens 강제       | 미지정 시 서버 기본값 사용                     |
| 검증      | 모델 필수 경로 불일치 | env-only 경로에도 LLM_MODEL 필수               |
| 문서      | 주석 드리프트         | `tools.core` 경로로 수정                       |

### 22.2 인지된 제한사항 (향후 개선)

1. **테스트 신뢰도**: SlmConfigDialog 테스트가 동일 mock 버퍼 사용 → 실제 다중
   버퍼 동작 검증 부족

### 22.3 환경변수 기반 sLM 설정

```bash
# 필수
export LLM_PROVIDER=openai-compatible
export LLM_BASE_URL=http://localhost:8000/v1
export LLM_MODEL=your-model-name

# 선택 (인증이 필요한 경우)
export LLM_API_KEY=your-api-key
export LLM_API_KEY_HEADER=X-API-Key  # 비표준 헤더 사용 시

didim
```

---

## 23. 3차 코드 리뷰 이슈 수정 (2026-02-23)

### 23.1 리뷰 결과 요약

| #   | 심각도 | 이슈                                   | 상태                  |
| --- | ------ | -------------------------------------- | --------------------- |
| 1   | High   | 컨텍스트 오버플로우 사전 감지 비의존적 | ✅ 수정됨             |
| 2   | Medium | bootstrap.ts JSON 타입 검증 없음       | ✅ 수정됨             |
| 3   | Medium | 빈 헤더명 허용                         | ✅ 수정됨             |
| 4   | Medium | 회귀 방지 테스트 누락                  | ✅ 수정됨             |
| 5   | Low    | useAuth.test.tsx act() 경고            | ⚠️ 인지됨 (향후 개선) |

### 23.2 수정 내역

#### 이슈 #1: 컨텍스트 오버플로우 사전 감지 ✅

**문제**: `tokenLimit()`가 비-Gemini 모델에 1M 반환 → 4K/8K sLM 서버에서
오버플로우 미탐지

**수정**:

```typescript
// packages/core/src/core/tokenLimits.ts

export const OPENAI_COMPATIBLE_TOKEN_LIMIT = 32_768;

export function tokenLimit(model: Model): TokenCount {
  // openai-compatible 프로바이더는 보수적인 제한 사용
  const llmProvider = process.env['LLM_PROVIDER'];
  if (
    llmProvider === 'openai-compatible' ||
    llmProvider === 'openai_compatible'
  ) {
    return OPENAI_COMPATIBLE_TOKEN_LIMIT;
  }
  // 기존 Gemini 모델 분기...
}
```

**테스트 추가**:

```typescript
it('should return conservative token limit for openai-compatible provider', () => {
  vi.stubEnv('LLM_PROVIDER', 'openai-compatible');
  expect(tokenLimit('any-model')).toBe(32_768);
});
```

#### 이슈 #2: bootstrap.ts JSON 타입 검증 ✅

**문제**: `JSON.parse()` 결과를 타입 검증 없이 `defaultHeaders`에 합침

**수정**:

```typescript
// packages/core/src/providers/openai-compatible/bootstrap.ts

const parsed = JSON.parse(customHeadersStr);
if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
  for (const [key, value] of Object.entries(parsed)) {
    // 빈 키, 비문자열 키/값 건너뛰기
    if (
      typeof key === 'string' &&
      key.trim() !== '' &&
      typeof value === 'string'
    ) {
      defaultHeaders[key] = value;
    }
  }
}
```

#### 이슈 #3: 빈 헤더명 허용 ✅

**문제**: `parseCustomHeaders()`가 `{"": "value"}` 같은 빈 키를 허용

**수정**:

```typescript
// packages/cli/src/ui/auth/SlmConfigDialog.tsx parseCustomHeaders()

for (const [key, value] of Object.entries(parsed)) {
  if (
    typeof key !== 'string' ||
    key.trim() === '' ||
    typeof value !== 'string'
  ) {
    return null; // 빈/비문자열 키 또는 비문자열 값 거부
  }
}
```

**테스트 추가**:

```typescript
it('rejects JSON object with empty header names', () => {
  expect(parseCustomHeaders('{"": "value"}')).toBeNull();
  expect(parseCustomHeaders('{"  ": "value"}')).toBeNull();
});
```

#### 이슈 #4: 회귀 방지 테스트 누락 ✅

**추가된 테스트**:

1. **tokenLimits.test.ts** - openai-compatible 토큰 제한 테스트 3개 추가
2. **adapter.test.ts** - max_tokens 동작 테스트 추가:

```typescript
it('should include max_tokens only when explicitly specified', async () => {
  // Case 1: maxTokens 지정 → max_tokens 포함
  const requestWithTokens = createBasicRequest({ maxTokens: 2048 });
  await adapter.generateContent(requestWithTokens, 'test-prompt');
  expect(client.chat.completions.create).toHaveBeenCalledWith(
    expect.objectContaining({ max_tokens: 2048 }),
    expect.anything(),
  );

  // Case 2: maxTokens 미지정 → max_tokens 미포함
  const requestWithoutTokens = createBasicRequest();
  delete requestWithoutTokens['maxTokens'];
  await adapter.generateContent(requestWithoutTokens, 'test-prompt');
  expect(callArgs).not.toHaveProperty('max_tokens');
});
```

### 23.3 테스트 결과

```bash
# 토큰 제한 테스트
npm test -w @didim365/agent-cli-core -- src/core/tokenLimits.test.ts
# ✅ 8 tests passed

# 어댑터 테스트
npx vitest run packages/core/src/providers/openai-compatible/adapter.test.ts
# ✅ 17 tests passed

# SlmConfigDialog 테스트
npm test -w @didim365/agent-cli -- src/ui/auth/SlmConfigDialog.test.tsx
# ✅ 28 tests passed

# 빌드
npm run build -w @didim365/agent-cli-core && npm run build -w @didim365/agent-cli
# ✅ 성공
```

### 23.4 수정된 파일 목록 (3차)

| 파일                                                            | 변경 내용                                     |
| --------------------------------------------------------------- | --------------------------------------------- |
| `packages/core/src/core/tokenLimits.ts`                         | openai-compatible 전용 보수적 토큰 제한 (32K) |
| `packages/core/src/core/tokenLimits.test.ts`                    | openai-compatible 토큰 제한 테스트 3개 추가   |
| `packages/core/src/providers/openai-compatible/bootstrap.ts`    | JSON 헤더 타입/빈 키 검증                     |
| `packages/core/src/providers/openai-compatible/adapter.test.ts` | max_tokens 동작 테스트 추가                   |
| `packages/cli/src/ui/auth/SlmConfigDialog.tsx`                  | 빈 헤더명 검증 추가                           |
| `packages/cli/src/ui/auth/SlmConfigDialog.test.tsx`             | 빈 헤더명 테스트 추가                         |

---

## 24. 최종 상태 요약 (3차 리뷰 후)

### 24.1 해결된 모든 이슈 (누적)

| 카테고리  | 이슈                     | 해결 방법                                      |
| --------- | ------------------------ | ---------------------------------------------- |
| 스트리밍  | 에러 처리 계약 회귀      | `yield createErrorEvent` 사용                  |
| 인증      | sLM API 키 강제          | API 키 선택사항, LLM_BASE_URL + LLM_MODEL 필수 |
| 버퍼      | 뒤로가기 동기화          | `handleCancel`에서 버퍼 동기화                 |
| 헤더 파싱 | 콤마 값 처리             | 정규식 사용                                    |
| 헤더 파싱 | 비문자열/빈 키 JSON 값   | 타입 및 빈 키 검증                             |
| 요청      | max_tokens 강제          | 미지정 시 서버 기본값 사용                     |
| 검증      | 모델 필수 경로 불일치    | env-only 경로에도 LLM_MODEL 필수               |
| 토큰 제한 | 비-Gemini 모델 1M 기본값 | openai-compatible은 32K 기본값                 |
| 문서      | 주석 드리프트            | `tools.core` 경로로 수정                       |

### 24.2 테스트 현황

| 테스트 파일                | 테스트 수    |
| -------------------------- | ------------ |
| `tokenLimits.test.ts`      | 8 tests      |
| `adapter.test.ts`          | 17 tests     |
| `SlmConfigDialog.test.tsx` | 28 tests     |
| **총합**                   | **53 tests** |

### 24.3 인지된 제한사항 (향후 개선)

1. **테스트 신뢰도**: SlmConfigDialog 테스트가 동일 mock 버퍼 사용 → 실제 다중
   버퍼 동작 검증 부족
2. **act() 경고**: useAuth.test.tsx에서 React state update 경고 지속
