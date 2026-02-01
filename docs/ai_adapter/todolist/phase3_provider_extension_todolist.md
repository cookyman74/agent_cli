# Phase 3: 프로바이더 확장 및 통합

> 기간: 3-4주 | 상태: ⏳ 대기 | 의존성: Phase 2 완료
> **v0.3** - 2차 리뷰 반영 (디렉토리 구조, 테스트 파일 정정)

## System Prompt

Always follow TDD principles. For each provider adapter: write failing tests for message conversion, stream handling, and error mapping first. Implement minimum code to pass. Ensure cross-provider compatibility through integration tests.

---

# PHASE OVERVIEW

## 설계서 참조 (Design Document References)

| 설계서 | 관련 섹션 | 참조 목적 |
|--------|----------|-----------|
| [03-technical-design.md](../03-technical-design.md) | §3.3.4-3.3.6 Claude 어댑터/변환기, §3.3.7-3.3.8 OpenAI 어댑터/변환기, §3.4 vLLM 확장 | 각 프로바이더별 어댑터 구현 상세 |
| [04-integration-design.md](../04-integration-design.md) | §4.2 연동 아키텍처, §4.3 공통 타입 시스템 | DidimAIStudio 연동 시 프로바이더 통합 |
| [05-implementation-plan.md](../05-implementation-plan.md) | §5.4 Phase 3 상세, §5.5 테스트 및 검증 | 마일스톤별 상세 계획, 검증 기준 |

## 목표
- Claude 어댑터/변환기 구현
- OpenAI 어댑터/변환기 구현
- OpenAI-Compatible(vLLM/sLM) 어댑터 템플릿
- 통합 테스트 및 문서화

## 전제 조건
- [ ] Phase 2 모든 Milestone 완료
- [ ] GeminiAdapter 동등성 검증 완료
- [ ] 기능 플래그 동작 확인

## 산출물
```
packages/core/src/providers/
├── claude/
│   ├── adapter.ts
│   ├── converter.ts
│   ├── eventMapper.ts   # 🆕 일관성 확보
│   └── types.ts
├── openai/
│   ├── adapter.ts
│   ├── converter.ts
│   ├── eventMapper.ts   # 🆕 일관성 확보
│   └── types.ts
└── openai-compatible/
    ├── adapter.ts
    ├── converter.ts
    └── types.ts         # eventMapper 선택적 (OpenAI 호환)
```

---

# 3-STAGE WORK PROCESS (사전작업/본작업/사후작업)

각 Milestone 작업은 다음 3단계로 진행:

## 1️⃣ 사전작업 (Pre-work)
- [ ] 작업 개요 파악: 현재 Milestone 목표 및 세부 작업 확인
- [ ] 이전 작업 리뷰: Phase 2 완료 확인 및 작업 결과서 확인 (`working_history/` 디렉토리)
- [ ] 이슈 파악: 이전 작업에서 전달된 이슈 및 Open Questions 확인
- [ ] 설계서 참조: 관련 설계 문서 검토 (03-technical-design.md, 04-integration-design.md 등)

## 2️⃣ 본작업 (Main work) - TDD 사이클
- [ ] **Red**: 실패하는 테스트 작성
- [ ] **Green**: 최소한의 코드로 테스트 통과
- [ ] **Refactor**: 코드 개선 (테스트 통과 유지)
- [ ] 체크리스트 업데이트: 작업 완료 시 ✅ 표시

## 3️⃣ 사후작업 (Post-work)
- [ ] 체크리스트 최종 확인: 해당 Milestone 모든 항목 완료 확인
- [ ] 작업 결과서 작성: `working_history/Phase3_{Milestone}_{작업일자}.md`
- [ ] 커밋: 변경사항 커밋 및 커밋 ID 기록
- [ ] 이슈 전달: 다음 작업에 전달할 이슈 문서화

### 작업 결과서 템플릿
- 경로: `docs/ai_adapter/template/03_work_result_report_template.md`

---

# M3.1: Claude 어댑터/변환기 구현 (4-5일)

> 📚 **설계서 참조**: [03-technical-design.md §3.3.4 Claude 어댑터](../03-technical-design.md#334-claude-어댑터), [§3.3.5 Claude 타입 변환기](../03-technical-design.md#335-claude-타입-변환기-추가), [§3.3.6 Claude 어댑터 구현](../03-technical-design.md#336-claude-어댑터-추가), [05-implementation-plan.md §M3.1](../05-implementation-plan.md#m31-claude-어댑터변환기-구현-4-5일)

## 목표
Claude 메시지/툴/스트림 변환기 구현

## Claude 특화 고려사항
- System 메시지 분리 필요 (별도 파라미터)
- 이미지는 base64 필수 (URL 직접 지원 안함)
- 스트리밍 tool delta 합성 필요
- `content_block_delta` 이벤트 처리

## 작업 항목

### 3.1.1 ClaudeAdapter 구현
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 3.1.1.1 | `ClaudeAdapter` 클래스 생성 | ⬜ | `claudeAdapter.test.ts` |
| 3.1.1.2 | `BaseAdapter` 상속 구현 | ⬜ | `claudeAdapter.test.ts` |
| 3.1.1.3 | Anthropic SDK 연동 | ⬜ | `claudeAdapter.test.ts` |
| 3.1.1.4 | `generate()` 메서드 구현 | ⬜ | `claudeAdapter.test.ts` |
| 3.1.1.5 | `generateStream()` 메서드 구현 | ⬜ | `claudeAdapter.test.ts` |
| 3.1.1.6 | `getCapabilities()` 구현 | ⬜ | `claudeAdapter.test.ts` |
| 3.1.1.7 | 설정 검증 (API Key) | ⬜ | `claudeAdapter.test.ts` |

**TDD 시나리오**:
```typescript
describe('ClaudeAdapter', () => {
  it('should implement BaseAdapter interface', () => {
    const adapter = new ClaudeAdapter({
      apiKey: 'test-key',
      model: 'claude-sonnet-4-20250514'
    });

    expect(adapter).toBeInstanceOf(BaseAdapter);
  });

  it('should separate system message in API call', async () => {
    const adapter = new ClaudeAdapter(config);
    const request: LlmGenerateRequest = {
      messages: [
        { role: LlmRole.System, content: [{ type: 'text', text: 'Be helpful' }] },
        { role: LlmRole.User, content: [{ type: 'text', text: 'Hi' }] }
      ]
    };

    // Mock Anthropic SDK
    const mockCreate = vi.spyOn(anthropic.messages, 'create');
    await adapter.generate(request);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'Be helpful',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }]
      })
    );
  });
});
```

### 3.1.2 Claude 메시지 변환기
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 3.1.2.1 | `toClaudeMessage()` 변환 함수 | ⬜ | `claudeConverter.test.ts` |
| 3.1.2.2 | System 메시지 분리 로직 | ⬜ | `claudeConverter.test.ts` |
| 3.1.2.3 | 이미지 URL → base64 변환 | ⬜ | `claudeConverter.test.ts` |
| 3.1.2.4 | `toClaudeTool()` 변환 함수 | ⬜ | `claudeConverter.test.ts` |
| 3.1.2.5 | `fromClaudeResponse()` 변환 함수 | ⬜ | `claudeConverter.test.ts` |

**TDD 시나리오**:
```typescript
describe('Claude Message Converter', () => {
  it('should extract system message separately', () => {
    const messages: LlmMessage[] = [
      { role: LlmRole.System, content: [{ type: 'text', text: 'System prompt' }] },
      { role: LlmRole.User, content: [{ type: 'text', text: 'User message' }] }
    ];

    const { systemPrompt, claudeMessages } = toClaudeMessages(messages);

    expect(systemPrompt).toBe('System prompt');
    expect(claudeMessages).toHaveLength(1);
    expect(claudeMessages[0].role).toBe('user');
  });

  it('should convert image URL to base64', async () => {
    const message: LlmMessage = {
      role: LlmRole.User,
      content: [{
        type: 'image',
        source: { type: 'url', url: 'https://example.com/image.png' }
      }]
    };

    const claudeMessage = await toClaudeMessage(message);

    expect(claudeMessage.content[0].type).toBe('image');
    expect(claudeMessage.content[0].source.type).toBe('base64');
  });
});
```

### 3.1.3 Claude 스트림 변환기
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 3.1.3.1 | `fromClaudeStreamEvent()` 변환 | ⬜ | `claudeStream.test.ts` |
| 3.1.3.2 | `content_block_start` 처리 | ⬜ | `claudeStream.test.ts` |
| 3.1.3.3 | `content_block_delta` 처리 | ⬜ | `claudeStream.test.ts` |
| 3.1.3.4 | `content_block_stop` 처리 | ⬜ | `claudeStream.test.ts` |
| 3.1.3.5 | Tool delta 합성 로직 | ⬜ | `claudeStream.test.ts` |
| 3.1.3.6 | Usage 정보 추출 | ⬜ | `claudeStream.test.ts` |

**TDD 시나리오**:
```typescript
describe('Claude Stream Converter', () => {
  it('should convert text delta events', async () => {
    const claudeEvents = [
      { type: 'content_block_start', content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
      { type: 'content_block_stop' }
    ];

    const events: LlmStreamEvent[] = [];
    for (const event of claudeEvents) {
      const converted = fromClaudeStreamEvent(event);
      if (converted) events.push(converted);
    }

    expect(events[0].type).toBe('text_delta');
    expect(events[0].text).toBe('Hello');
  });

  it('should assemble tool call deltas', async () => {
    const assembler = new StreamAssembler();
    // Claude tool delta events
    assembler.push(fromClaudeStreamEvent({
      type: 'content_block_start',
      content_block: { type: 'tool_use', id: 'tool_1', name: 'read_file' }
    }));
    assembler.push(fromClaudeStreamEvent({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: '{"path":' }
    }));
    assembler.push(fromClaudeStreamEvent({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: '"/tmp"}' }
    }));

    const result = assembler.getMessage();
    expect(result.content[0].type).toBe('tool_call');
    expect(result.content[0].arguments).toEqual({ path: '/tmp' });
  });
});
```

### 3.1.4 Claude 에러 매핑
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 3.1.4.1 | Anthropic SDK 에러 분석 | ⬜ | N/A (분석) |
| 3.1.4.2 | Rate limit 에러 매핑 | ⬜ | `claudeErrors.test.ts` |
| 3.1.4.3 | Auth 에러 매핑 | ⬜ | `claudeErrors.test.ts` |
| 3.1.4.4 | Overloaded 에러 매핑 | ⬜ | `claudeErrors.test.ts` |
| 3.1.4.5 | 에러 변환 유틸 함수 | ⬜ | `claudeErrors.test.ts` |

**검증 기준**:
- [ ] Claude 기본 대화 동작
- [ ] Claude 스트리밍 동작
- [ ] Claude 도구 호출 동작
- [ ] Claude 이미지 입력 동작

---

# M3.2: OpenAI 어댑터/변환기 구현 (3-4일)

> 📚 **설계서 참조**: [03-technical-design.md §3.3.7 OpenAI 어댑터](../03-technical-design.md#337-openai-어댑터-구조-예시), [§3.3.8 OpenAI 타입 변환기](../03-technical-design.md#338-openai-타입-변환기-추가), [05-implementation-plan.md §M3.2](../05-implementation-plan.md#m32-openai-어댑터변환기-구현-3-4일)

## 목표
OpenAI 메시지/툴/스트림 변환기 구현

## OpenAI 특화 고려사항
- System 메시지 첫 번째로 위치
- JSON mode / response_format 지원
- function_call → tool_calls 전환

## 작업 항목

### 3.2.1 OpenAIAdapter 구현
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 3.2.1.1 | `OpenAIAdapter` 클래스 생성 | ⬜ | `openaiAdapter.test.ts` |
| 3.2.1.2 | `BaseAdapter` 상속 구현 | ⬜ | `openaiAdapter.test.ts` |
| 3.2.1.3 | OpenAI SDK 연동 | ⬜ | `openaiAdapter.test.ts` |
| 3.2.1.4 | `generate()` 메서드 구현 | ⬜ | `openaiAdapter.test.ts` |
| 3.2.1.5 | `generateStream()` 메서드 구현 | ⬜ | `openaiAdapter.test.ts` |
| 3.2.1.6 | `getCapabilities()` 구현 | ⬜ | `openaiAdapter.test.ts` |

**TDD 시나리오**:
```typescript
describe('OpenAIAdapter', () => {
  it('should generate response using OpenAI SDK', async () => {
    const adapter = new OpenAIAdapter({
      apiKey: 'test-key',
      model: 'gpt-4o'
    });

    const request: LlmGenerateRequest = {
      messages: [{ role: LlmRole.User, content: [{ type: 'text', text: 'Hi' }] }]
    };

    const response = await adapter.generate(request);
    expect(response.message).toBeDefined();
  });

  it('should support JSON mode', async () => {
    const adapter = new OpenAIAdapter(config);
    const request: LlmGenerateRequest = {
      messages: [...],
      responseFormat: { type: 'json_object' }
    };

    const mockCreate = vi.spyOn(openai.chat.completions, 'create');
    await adapter.generate(request);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: { type: 'json_object' }
      })
    );
  });
});
```

### 3.2.2 OpenAI 메시지 변환기
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 3.2.2.1 | `toOpenAIMessage()` 변환 함수 | ⬜ | `openaiConverter.test.ts` |
| 3.2.2.2 | System 메시지 순서 처리 | ⬜ | `openaiConverter.test.ts` |
| 3.2.2.3 | 이미지 URL 처리 | ⬜ | `openaiConverter.test.ts` |
| 3.2.2.4 | `toOpenAITool()` 변환 함수 | ⬜ | `openaiConverter.test.ts` |
| 3.2.2.5 | `fromOpenAIResponse()` 변환 함수 | ⬜ | `openaiConverter.test.ts` |
| 3.2.2.6 | JSON mode 매핑 | ⬜ | `openaiConverter.test.ts` |

**TDD 시나리오**:
```typescript
describe('OpenAI Message Converter', () => {
  it('should place system message first', () => {
    const messages: LlmMessage[] = [
      { role: LlmRole.User, content: [{ type: 'text', text: 'Hi' }] },
      { role: LlmRole.System, content: [{ type: 'text', text: 'Be helpful' }] }
    ];

    const openaiMessages = toOpenAIMessages(messages);

    expect(openaiMessages[0].role).toBe('system');
    expect(openaiMessages[1].role).toBe('user');
  });

  it('should convert image URL directly', () => {
    const message: LlmMessage = {
      role: LlmRole.User,
      content: [{
        type: 'image',
        source: { type: 'url', url: 'https://example.com/image.png' }
      }]
    };

    const openaiMessage = toOpenAIMessage(message);

    expect(openaiMessage.content[0].type).toBe('image_url');
    expect(openaiMessage.content[0].image_url.url).toBe('https://example.com/image.png');
  });
});
```

### 3.2.3 OpenAI 스트림 변환기
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 3.2.3.1 | `fromOpenAIStreamEvent()` 변환 | ⬜ | `openaiStream.test.ts` |
| 3.2.3.2 | 텍스트 델타 처리 | ⬜ | `openaiStream.test.ts` |
| 3.2.3.3 | Tool call 델타 처리 | ⬜ | `openaiStream.test.ts` |
| 3.2.3.4 | Usage 정보 추출 | ⬜ | `openaiStream.test.ts` |

### 3.2.4 OpenAI 에러 매핑
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 3.2.4.1 | OpenAI SDK 에러 분석 | ⬜ | N/A (분석) |
| 3.2.4.2 | Rate limit 에러 매핑 | ⬜ | `openaiErrors.test.ts` |
| 3.2.4.3 | Auth 에러 매핑 | ⬜ | `openaiErrors.test.ts` |
| 3.2.4.4 | 에러 변환 유틸 함수 | ⬜ | `openaiErrors.test.ts` |

**검증 기준**:
- [ ] OpenAI 기본 대화 동작
- [ ] OpenAI 스트리밍 동작
- [ ] OpenAI 도구 호출 동작
- [ ] OpenAI JSON mode 동작

---

# M3.3: OpenAI-Compatible(vLLM/sLM) 어댑터 템플릿 (3일)

> 📚 **설계서 참조**: [03-technical-design.md §3.4 vLLM 및 OpenAI 호환 프로바이더 확장](../03-technical-design.md#34-vllm-및-기타-openai-호환-프로바이더-확장), [05-implementation-plan.md §M3.3](../05-implementation-plan.md#m33-openai-compatiblevllmslm-어댑터-템플릿-3일)

## 목표
vLLM, TGI, LM Studio 등 OpenAI 호환 API 지원

## 특화 고려사항
- Custom baseUrl 지원
- Custom headers 지원
- 다양한 API Key 헤더 지원
- 모델별 ChatTemplate 훅

## 작업 항목

### 3.3.1 OpenAICompatibleAdapter 구현
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 3.3.1.1 | `OpenAICompatibleAdapter` 클래스 | ⬜ | `openaiCompatAdapter.test.ts` |
| 3.3.1.2 | `OpenAIAdapter` 상속 | ⬜ | `openaiCompatAdapter.test.ts` |
| 3.3.1.3 | `baseUrl` 설정 지원 | ⬜ | `openaiCompatAdapter.test.ts` |
| 3.3.1.4 | Custom headers 지원 | ⬜ | `openaiCompatAdapter.test.ts` |
| 3.3.1.5 | `apiKeyHeaderName` 지원 | ⬜ | `openaiCompatAdapter.test.ts` |
| 3.3.1.6 | 연결 테스트 메서드 | ⬜ | `openaiCompatAdapter.test.ts` |

**TDD 시나리오**:
```typescript
describe('OpenAICompatibleAdapter', () => {
  it('should use custom baseUrl', async () => {
    const adapter = new OpenAICompatibleAdapter({
      baseUrl: 'http://localhost:8000/v1',
      model: 'meta-llama/Llama-3.1-8B-Instruct'
    });

    const mockFetch = vi.spyOn(global, 'fetch');
    await adapter.generate(request);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('http://localhost:8000/v1'),
      expect.any(Object)
    );
  });

  it('should support custom API key header', async () => {
    const adapter = new OpenAICompatibleAdapter({
      baseUrl: 'http://localhost:8000/v1',
      apiKey: 'my-key',
      apiKeyHeaderName: 'X-Custom-Auth'
    });

    const mockFetch = vi.spyOn(global, 'fetch');
    await adapter.generate(request);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Custom-Auth': 'my-key'
        })
      })
    );
  });
});
```

### 3.3.2 모델별 템플릿 훅
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 3.3.2.1 | `PromptBuilder` 인터페이스 | ⬜ | `promptBuilder.test.ts` |
| 3.3.2.2 | Llama3 ChatTemplate | ⬜ | `promptBuilder.test.ts` |
| 3.3.2.3 | Mistral ChatTemplate | ⬜ | `promptBuilder.test.ts` |
| 3.3.2.4 | 범용 ChatML 템플릿 | ⬜ | `promptBuilder.test.ts` |

### 3.3.3 호환성 시나리오 테스트
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 3.3.3.1 | vLLM 호환성 테스트 | ⬜ | `vllmCompat.test.ts` |
| 3.3.3.2 | TGI 호환성 테스트 | ⬜ | `tgiCompat.test.ts` |
| 3.3.3.3 | LM Studio 호환성 테스트 | ⬜ | `lmstudioCompat.test.ts` |
| 3.3.3.4 | Ollama 호환성 테스트 | ⬜ | `ollamaCompat.test.ts` |

**검증 기준**:
- [ ] vLLM 기본 대화 동작
- [ ] Custom baseUrl 동작
- [ ] Custom headers 동작

---

# M3.4: 통합 테스트/문서/안정화 (5-7일)

> 📚 **설계서 참조**: [04-integration-design.md §4.2 연동 아키텍처](../04-integration-design.md#42-연동-아키텍처) (통합 테스트 시나리오), [05-implementation-plan.md §5.5 테스트 및 검증](../05-implementation-plan.md#55-테스트-및-검증), [§M3.4](../05-implementation-plan.md#m34-통합-테스트문서안정화-5-7일)

## 목표
멀티 프로바이더 통합 검증 및 문서화

## 작업 항목

### 3.4.1 멀티 프로바이더 통합 테스트
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 3.4.1.1 | 프로바이더 전환 테스트 | ⬜ | `integration.test.ts` |
| 3.4.1.2 | 동시 프로바이더 사용 테스트 | ⬜ | `integration.test.ts` |
| 3.4.1.3 | 설정 검증 통합 테스트 | ⬜ | `integration.test.ts` |
| 3.4.1.4 | 에러 처리 통합 테스트 | ⬜ | `integration.test.ts` |

### 3.4.2 E2E 테스트 시나리오
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 3.4.2.1 | Gemini E2E 테스트 | ⬜ | E2E |
| 3.4.2.2 | Claude E2E 테스트 | ⬜ | E2E |
| 3.4.2.3 | OpenAI E2E 테스트 | ⬜ | E2E |
| 3.4.2.4 | vLLM E2E 테스트 (선택) | ⬜ | E2E |

**E2E 테스트 매트릭스**:
| 시나리오 | Gemini | Claude | OpenAI | vLLM |
|----------|--------|--------|--------|------|
| 기본 대화 | ⬜ | ⬜ | ⬜ | ⬜ |
| 스트리밍 대화 | ⬜ | ⬜ | ⬜ | ⬜ |
| 도구 호출 | ⬜ | ⬜ | ⬜ | ⚠️ |
| 이미지 입력 | ⬜ | ⬜ | ⬜ | ⚠️ |
| 에러 처리 | ⬜ | ⬜ | ⬜ | ⬜ |

### 3.4.3 성능 회귀 테스트
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 3.4.3.1 | 응답 지연 벤치마크 | ⬜ | `performance.test.ts` |
| 3.4.3.2 | 스트리밍 첫 토큰 벤치마크 | ⬜ | `performance.test.ts` |
| 3.4.3.3 | 메모리 사용량 프로파일링 | ⬜ | `performance.test.ts` |
| 3.4.3.4 | 번들 크기 분석 | ⬜ | `bundleSize.test.ts` |

**성능 기준**:
- 응답 지연 증가 < 50ms
- 스트리밍 첫 토큰 지연 < 100ms
- 메모리 증가 < 10%
- 번들 크기 증가 < 500KB

### 3.4.4 문서 업데이트
| ID | 작업 | 상태 | 산출물 |
|----|------|------|--------|
| 3.4.4.1 | 사용자 가이드 작성 | ⬜ | `docs/providers.md` |
| 3.4.4.2 | API 레퍼런스 업데이트 | ⬜ | `docs/api/` |
| 3.4.4.3 | 환경변수 문서화 | ⬜ | `docs/configuration.md` |
| 3.4.4.4 | 마이그레이션 가이드 | ⬜ | `docs/migration.md` |
| 3.4.4.5 | README 업데이트 | ⬜ | `README.md` |

### 3.4.5 안정화 작업
| ID | 작업 | 상태 | 비고 |
|----|------|------|------|
| 3.4.5.1 | 버그 수정 | ⬜ | 이슈 트래킹 |
| 3.4.5.2 | 에지 케이스 처리 | ⬜ | |
| 3.4.5.3 | 에러 메시지 개선 | ⬜ | |
| 3.4.5.4 | 로깅 개선 | ⬜ | |
| 3.4.5.5 | 기능 플래그 정리 | ⬜ | |

**검증 기준**:
- [ ] 모든 E2E 테스트 통과
- [ ] 성능 회귀 없음
- [ ] 문서 완성

---

# M3.5: 테스트 마이그레이션 (3-4일) [v0.2 신규]

> 📚 **설계서 참조**: [05-implementation-plan.md §5.5 테스트 및 검증](../05-implementation-plan.md#55-테스트-및-검증) (테스트 전략), [03-technical-design.md §3.1 타입 시스템](../03-technical-design.md#31-프로바이더-독립적-타입-시스템) (Mock 타입 전환 참조)

## 목표
Gemini 특화 테스트를 프로바이더 중립적 테스트로 전환

## 배경
Phase 2에서 리팩토링된 코드에 대응하여 기존 테스트도 함께 마이그레이션 필요

## 작업 항목

### 3.5.1 테스트 파일 분석
| ID | 작업 | 상태 | 산출물 |
|----|------|------|--------|
| 3.5.1.1 | Gemini 특화 테스트 파일 식별 | ⬜ | 테스트 파일 목록 |
| 3.5.1.2 | 테스트 내 @google/genai 의존성 분석 | ⬜ | 의존성 매트릭스 |
| 3.5.1.3 | Mock 객체 Gemini 특화 여부 분석 | ⬜ | Mock 분석 문서 |
| 3.5.1.4 | 테스트 수정 범위 산정 | ⬜ | 수정 범위 문서 |

**분석 대상 테스트 파일** (실제 존재 확인됨):
```
packages/core/src/
├── core/
│   ├── contentGenerator.test.ts    # GenerateContentParameters 의존
│   ├── turn.test.ts                # GeminiEventType 의존
│   ├── geminiChat.test.ts          # Gemini 응답/스트리밍 의존 🆕
│   ├── baseLlmClient.test.ts       # 🆕 baseLlmClient 의존
│   ├── loggingContentGenerator.test.ts   # 래퍼 클래스
│   ├── recordingContentGenerator.test.ts # 래퍼 클래스
│   └── fakeContentGenerator.test.ts      # Mock 구현
├── services/
│   └── modelConfigService.test.ts  # GenerateContentConfig 의존
├── routing/
│   ├── modelRouterService.test.ts  # 🆕 라우팅 레이어
│   └── strategies/*.test.ts        # 🆕 라우팅 전략
└── utils/
    ├── tokenCalculation.test.ts    # Part, Content 타입 의존
    └── partUtils.test.ts           # Part 타입 의존
```

⚠️ **주의**: `session.test.ts`는 존재하지 않음 (원본 계획서 오류 수정됨)

### 3.5.2 테스트 마이그레이션 전략
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 3.5.2.1 | 공통 Mock Factory 설계 | ⬜ | `testUtils/mockFactory.ts` |
| 3.5.2.2 | 프로바이더 중립 Mock 구현 | ⬜ | `testUtils/mockFactory.test.ts` |
| 3.5.2.3 | 프로바이더별 Mock 어댑터 | ⬜ | `testUtils/mockAdapters.ts` |
| 3.5.2.4 | 테스트 데이터 팩토리 | ⬜ | `testUtils/testDataFactory.ts` |

**TDD 시나리오**:
```typescript
describe('MockFactory', () => {
  it('should create provider-agnostic mock message', () => {
    const mockMessage = MockFactory.createMessage({
      role: LlmRole.User,
      text: 'Hello'
    });

    expect(mockMessage.role).toBe(LlmRole.User);
    expect(mockMessage.content[0].type).toBe('text');
  });

  it('should create provider-specific response via adapter', () => {
    const genericResponse = MockFactory.createResponse({ text: 'Hi' });

    // Gemini용 변환
    const geminiResponse = MockAdapters.toGemini(genericResponse);
    expect(geminiResponse).toHaveProperty('candidates');

    // Claude용 변환
    const claudeResponse = MockAdapters.toClaude(genericResponse);
    expect(claudeResponse).toHaveProperty('content');
  });
});
```

### 3.5.3 테스트 파일 마이그레이션
| ID | 작업 | 상태 | 우선순위 |
|----|------|------|---------|
| 3.5.3.1 | `contentGenerator.test.ts` 마이그레이션 | ⬜ | 높음 |
| 3.5.3.2 | `turn.test.ts` 마이그레이션 | ⬜ | 높음 |
| 3.5.3.3 | `geminiChat.test.ts` 마이그레이션 | ⬜ | 높음 |
| 3.5.3.4 | `baseLlmClient.test.ts` 마이그레이션 | ⬜ | 중간 |
| 3.5.3.5 | `modelConfigService.test.ts` 마이그레이션 | ⬜ | 중간 |
| 3.5.3.6 | `tokenCalculation.test.ts` 마이그레이션 | ⬜ | 낮음 |
| 3.5.3.7 | `partUtils.test.ts` 마이그레이션 | ⬜ | 낮음 |
| 3.5.3.8 | `routing/*.test.ts` 마이그레이션 (7개 파일) | ⬜ | 중간 |

**마이그레이션 패턴**:
```typescript
// Before: Gemini 특화 테스트
import type { GenerateContentResponse } from '@google/genai';

const mockResponse: GenerateContentResponse = {
  candidates: [{ content: { parts: [{ text: 'Hello' }] } }]
};

// After: 프로바이더 중립 테스트
import { MockFactory } from '../../testUtils/mockFactory';

const mockResponse = MockFactory.createResponse({ text: 'Hello' });
// GeminiAdapter 테스트시 GeminiMockAdapter로 변환
```

### 3.5.4 크로스 프로바이더 테스트 수트
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 3.5.4.1 | 공통 테스트 케이스 정의 | ⬜ | `providers/__tests__/common.ts` |
| 3.5.4.2 | 파라미터화된 테스트 구현 | ⬜ | `providers/__tests__/crossProvider.test.ts` |
| 3.5.4.3 | 프로바이더별 테스트 실행 | ⬜ | CI/CD 설정 |

**TDD 시나리오**:
```typescript
describe.each([
  ['gemini', GeminiAdapter],
  ['claude', ClaudeAdapter],
  ['openai', OpenAIAdapter]
])('%s adapter', (name, AdapterClass) => {
  it('should convert user message correctly', () => {
    const adapter = new AdapterClass(testConfig);
    const message = MockFactory.createUserMessage('Hello');

    const converted = adapter.convertMessage(message);

    // 각 프로바이더별 검증
    expect(converted).toMatchProviderSchema(name);
  });

  it('should handle streaming events', async () => {
    const adapter = new AdapterClass(testConfig);
    const events: LlmStreamEvent[] = [];

    for await (const event of adapter.generateStream(request)) {
      events.push(event);
    }

    expect(events.some(e => e.type === 'text_delta')).toBe(true);
  });
});
```

**검증 기준**:
- [ ] 모든 기존 테스트 마이그레이션 완료
- [ ] 공통 Mock Factory 동작 확인
- [ ] 크로스 프로바이더 테스트 통과
- [ ] 테스트 커버리지 유지 (≥80%)

---

# PHASE 3 COMPLETION CHECKLIST

## Quality Gates
- [ ] 모든 단위 테스트 통과
- [ ] 모든 통합 테스트 통과
- [ ] 모든 E2E 테스트 통과
- [ ] TypeScript 컴파일 에러 없음
- [ ] ESLint 경고 없음

## 성능 검증
- [ ] 응답 지연 증가 < 50ms
- [ ] 스트리밍 첫 토큰 지연 < 100ms
- [ ] 메모리 사용량 증가 < 10%
- [ ] 번들 크기 증가 < 500KB

## 기능 검증
- [ ] Gemini 기존 기능 100% 동작
- [ ] Claude 핵심 기능 동작
- [ ] OpenAI 핵심 기능 동작
- [ ] OpenAI-Compatible 기본 동작

## 산출물 확인
- [ ] `packages/core/src/providers/claude/` 디렉토리 생성
- [ ] `packages/core/src/providers/openai/` 디렉토리 생성
- [ ] `packages/core/src/providers/openai-compatible/` 디렉토리 생성
- [ ] 사용자 문서 완성
- [ ] API 레퍼런스 완성

## 테스트 마이그레이션 검증 [v0.2 추가]
- [ ] 모든 기존 테스트 파일 마이그레이션 완료
- [ ] 공통 Mock Factory 구현 및 테스트 통과
- [ ] 프로바이더별 Mock 어댑터 동작 확인
- [ ] 크로스 프로바이더 테스트 수트 통과
- [ ] 테스트 커버리지 ≥80% 유지

---

# RELEASE PLAN

## 버전 출시 계획

| 버전 | 포함 내용 | 시점 |
|------|-----------|------|
| 0.28.0-alpha | GeminiAdapter + 타입 전환 | Phase 2 완료 후 |
| 0.28.0-beta | Claude/OpenAI + OpenAI-Compatible | Phase 3 일부 완료 |
| 0.28.0 | 안정화/문서/테스트 | Phase 3 종료 후 |

## 기능 플래그 관리

```typescript
// 점진적 활성화
ENABLE_MULTI_PROVIDER=false  # 기본값: 기존 동작
ENABLE_MULTI_PROVIDER=true   # 신규 아키텍처 활성화
```

## 롤백 계획

1. 문제 발생 시 `ENABLE_MULTI_PROVIDER=false` 설정
2. 기존 Gemini 전용 경로로 즉시 폴백
3. 이슈 분석 및 수정 후 재배포

---

# DEPENDENCY MANAGEMENT

## 신규 의존성

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "openai": "^4.70.0"
  }
}
```

## 번들 최적화

```typescript
// Dynamic import로 번들 크기 관리
const ClaudeAdapter = await import('./claude/adapter');
const OpenAIAdapter = await import('./openai/adapter');
```

---

# NOTES

## 프로바이더별 주의사항

### Claude
- System 메시지는 별도 파라미터로 전달
- 이미지 URL은 base64로 변환 필수
- tool delta 합성 필요

### OpenAI
- System 메시지는 첫 번째 위치
- JSON mode 지원
- 이미지 URL 직접 지원

### OpenAI-Compatible
- baseUrl 설정 필수
- 모델별 capability 차이 존재
- 일부 기능 미지원 가능

## TDD 원칙
1. 각 프로바이더별 변환 함수 테스트 우선
2. 스트리밍 합성 테스트 필수
3. 에러 매핑 테스트 필수

## 참고 문서
- [03-technical-design.md](../03-technical-design.md)
- [04-integration-design.md](../04-integration-design.md)
- [05-implementation-plan.md](../05-implementation-plan.md)

---

# CHANGE LOG

## v0.3 (2차 리뷰 반영)
- **산출물 디렉토리 구조 수정**: `eventMapper.ts` 추가로 마스터 플랜과 일관성 확보
- **테스트 파일 목록 정정**:
  - `session.test.ts` 제거 (존재하지 않는 파일)
  - `geminiChat.test.ts`, `baseLlmClient.test.ts` 추가 (실제 존재 파일)
  - `routing/*.test.ts` 7개 파일 추가
- **3.5.3 테스트 마이그레이션 작업 확대**: 6개 → 8개 항목

## v0.2 (소스코드 기반 리뷰 반영)
- **M3.5 신규 추가**: 테스트 마이그레이션 마일스톤 (3-4일)
  - 3.5.1: 테스트 파일 분석 (Gemini 특화 테스트 식별)
  - 3.5.2: 테스트 마이그레이션 전략 (Mock Factory, 어댑터)
  - 3.5.3: 테스트 파일 마이그레이션 (우선순위별)
  - 3.5.4: 크로스 프로바이더 테스트 수트
- **완료 체크리스트 보강**: 테스트 마이그레이션 검증 항목 추가
- **배경**: Phase 2 리팩토링에 따른 테스트 코드 동기화 필요성 반영

## v0.1 (초기 버전)
- M3.1: Claude 어댑터/변환기 구현 (4-5일)
- M3.2: OpenAI 어댑터/변환기 구현 (3-4일)
- M3.3: OpenAI-Compatible 어댑터 템플릿 (3일)
- M3.4: 통합 테스트/문서/안정화 (5-7일)
