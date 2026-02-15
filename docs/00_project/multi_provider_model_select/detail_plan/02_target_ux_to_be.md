# 02. TO-BE UX

## 2. 목표 상태 (TO-BE)

### 2.1 UX 흐름

프로바이더별로 동일한 2단계 UI 패턴을 따르되, 모델 목록은 프로바이더에 맞게
표시한다.

#### Gemini 프로바이더 (현행 유지)

```
[첫번째 화면 - Main]
Select Model

  1. Auto (Gemini 3)
     Let Didim CLI decide the best model: gemini-3-pro, gemini-3-flash
  2. Auto (Gemini 2.5)
     Let Didim CLI decide the best model: gemini-2.5-pro, gemini-2.5-flash
● 3. Manual
     Manually select a model

[두번째 화면 - Manual]
Select Model

● 1. gemini-3-pro-preview
  2. gemini-3-flash-preview
  3. gemini-2.5-pro
  4. gemini-2.5-flash
  5. gemini-2.5-flash-lite
```

#### Claude 프로바이더

```
[첫번째 화면 - Main]
Select Model

● 1. Recommended (claude-opus-4-6)
     Most intelligent model for building agents and coding
  2. Manual
     Manually select a model

[두번째 화면 - Manual]
Select Model

● 1. claude-opus-4-6
  2. claude-sonnet-4-5-20250929
  3. claude-haiku-4-5-20251001
```

#### OpenAI 프로바이더

```
[첫번째 화면 - Main]
Select Model

● 1. Recommended (gpt-4.1)
     Smartest non-reasoning model for complex tasks
  2. Manual
     Manually select a model

[두번째 화면 - Manual]
Select Model

● 1. gpt-4.1
  2. gpt-4.1-mini
  3. gpt-4.1-nano
  4. gpt-4o
  5. o3
  6. o4-mini
```

#### sLM (OpenAI-Compatible) 프로바이더

```
[단일 화면 - 텍스트 입력]
Select Model

  Current model: {LLM_MODEL 또는 'default'}
  Enter the model name your endpoint supports.

  > [text input field]

  (Press Enter to confirm, Esc to cancel)
```

#### Vertex AI 프로바이더

Gemini와 동일 (내부적으로 Gemini 모델 사용).

#### DidimAIStudio 프로바이더

```
[단일 화면 - 안내]
Select Model

  DidimAIStudio는 시나리오 기반으로 동작하므로
  개별 모델 선택을 지원하지 않습니다.

  (Press Enter or Esc to go back)
```

---
