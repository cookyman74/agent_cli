# Phase 1 M1.4 유틸리티/테스트 마이그레이션 계획 작업 결과

> 📅 **작업일**: 2026-02-06  
> 🎯 **목표**: 유틸리티 레이어 및 테스트 마이그레이션 상세 계획 수립

---

## 📊 진행 현황

| 구성요소                       |  상태   | 비고                 |
| ------------------------------ | :-----: | -------------------- |
| 1.4.1 유틸리티 레이어 분석     | ✅ 완료 | 3개 파일, 6개 타입   |
| 1.4.2 테스트 파일 분석         | ✅ 완료 | 30+ 파일             |
| 1.4.3 마이그레이션 계획 문서화 | ✅ 완료 | utility-migration.md |

---

## 🔍 1.4.1 유틸리티 레이어 분석

### 분석 대상 파일

| 파일                                  | @google/genai 타입                                                 | 마이그레이션 복잡도 |
| ------------------------------------- | ------------------------------------------------------------------ | :-----------------: |
| `tokenCalculation.ts`                 | `Part`, `PartListUnion`                                            |      ⭐⭐ 중간      |
| `partUtils.ts`                        | `GenerateContentResponse`, `Part`, `PartUnion`, `PartListUnion`    |     ⭐⭐⭐ 높음     |
| `generateContentResponseUtilities.ts` | `GenerateContentResponse`, `Part`, `FunctionCall`, `PartListUnion` |     ⭐⭐⭐ 높음     |

### 의존성 요약

```
@google/genai 타입:
├── Part (3개 파일)
├── PartListUnion (3개 파일)
├── PartUnion (1개 파일)
├── GenerateContentResponse (2개 파일)
└── FunctionCall (1개 파일)
```

---

## 📋 1.4.2 테스트 파일 분석

### Gemini 전용 테스트 파일 (30+개)

| 영역                                  | 파일 수 | 예상 수정 범위            |
| ------------------------------------- | :-----: | ------------------------- |
| Core                                  |  11개   | 모킹/픽스처 전면 수정     |
| Utils                                 |   4개   | 타입 import + 테스트 로직 |
| Services                              |   4개   | 타입 import + 모킹        |
| 기타 (hooks, policy, routing, agents) |  11+개  | 타입 import 위주          |

### 수정 범위 추정

- **타입 import 변경만**: 10~15개 (1일)
- **모킹/픽스처 수정**: 10~12개 (2일)
- **테스트 로직 리팩터링**: 5~8개 (2일)

---

## 📄 1.4.3 마이그레이션 계획 문서화

### 산출물

[utility-migration.md](file:///Users/junghojang/Developments/didimProject/gemini-cli/docs/ai_adapter/utility-migration.md)

### 주요 내용

1. **유틸리티 파일별 의존성 분석**
2. **프로바이더 독립 유틸리티 설계** (`providers/utils/`)
3. **마이그레이션 우선순위 정의**
4. **일정 수립**: P1 1.5일 + P2 3일 + P3 3일

---

## ✅ 검증 기준 체크리스트

- [x] 모든 유틸리티 함수의 Gemini 의존성 식별
- [x] 프로바이더 독립 유틸리티 설계 완료
- [x] 테스트 마이그레이션 우선순위 정의
- [x] Phase 2/3 작업 범위 명확화

---

## 🚀 다음 작업

**M1.4 완료** → Phase 1 Completion Checklist 확인 및 Phase 2 준비
