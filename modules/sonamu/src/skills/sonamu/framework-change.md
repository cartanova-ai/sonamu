---
name: sonamu-framework-change
description: Sonamu 프레임워크 소스 수정 vs. 프로젝트 레벨 우회 판단 기준. @upload 파라미터 패턴 포함. Use when a Sonamu bug or limitation is discovered during project development.
---

# Sonamu Framework 변경 판단

프레임워크 버그나 제약을 발견했을 때, 프레임워크를 직접 수정할지 프로젝트 레벨에서 우회할지 판단하는 기준.

---

## 판단 rubric

아래 4개 축을 평가한다:

| 축 | 프로젝트 우회 | 프레임워크 수정 |
|----|-------------|----------------|
| **재현 범위** | 특정 사용 패턴에서만 발생 | 어떤 사용 방식에서도 발생 |
| **우회 비용** | 프로젝트 한 곳 수정으로 해결 | 모든 프로젝트에 우회 전파 필요 |
| **영향 범위** | 프레임워크 변경 시 다른 프로젝트 파급 불확실 | 변경 범위가 격리되고 부작용 명확 |
| **소유권** | 해당 코드 작성자가 있어 논의 필요 | 버그가 명확하고 리뷰 경로 확보됨 |

**프로젝트 우회 선택 기준**: 4개 축 중 2개 이상이 "프로젝트 우회"에 해당하면 우선 우회한다.

**프레임워크 수정 선택 기준**: 재현 범위가 "어떤 사용 방식에서도"이고 우회 비용이 높으면 수정을 검토한다.

---

## 판단 불가 시 → 사용자에게 물어본다

다음 중 하나라도 해당하면 혼자 결정하지 않는다:

- 재현 범위 확인이 어려움 (다른 프로젝트의 사용 패턴을 모름)
- 프레임워크 소유자(CTO 등)가 명확히 있고, 해당 코드를 최근 작성함
- 우회 방법이 API 시맨틱을 훼손할 가능성이 있음

```
"프레임워크 버그로 보입니다. 프로젝트 레벨 우회가 가능하지만,
프레임워크 수정이 더 적절할 수 있습니다. 어떻게 할까요?"
```

---

## 프로젝트 우회 시 기록 의무

우회를 선택했으면 다음 두 곳에 기록한다:

1. **spec의 `knownIssues`**: 버그 원인, 우회 방법, 호출 패턴, 근본 원인 경로
2. **memory**: sync 등 반복 작업에서 우회가 되돌아올 가능성이 있으면 주의사항 기록

---

## 구체 패턴: `@upload` 다중 파라미터

### 문제

`@upload` 메서드에 primitive 파라미터가 여러 개이면 `services.template.ts`의 `split(':')` 버그로 `useUploadMutation`이 잘못 생성된다.

```typescript
// ❌ 이렇게 쓰면 codegen 깨짐
async upload(entity_type: string, entity_id: number, file_type: string)
```

생성 결과:
```typescript
// mutationFn이 params.params, params.files만 전달 (entity_id, file_type 누락)
mutationFn: (params: { params: string; ... }) => upload(params.params, params.files)
```

### 해결: 단일 객체로 묶는다

```typescript
// ✅ 단일 객체 파라미터
async upload(params: { entity_type: string; entity_id: number; file_type: string })
```

Sonamu 백엔드가 `qs`로 `params[entity_type]` 형태의 중첩 formData를 자동 역직렬화하므로 동작에 영향 없다.

호출부 패턴:
```typescript
uploadMutation.mutate({
  params: { entity_type, entity_id, file_type },
  files,
})
```

**규칙**: `@upload` 메서드에 파라미터가 2개 이상 필요하면 반드시 단일 객체로 묶는다.

---

## 참고

- 버그 발생 소스: `modules/sonamu/src/template/implementations/services.template.ts`
- 관련 스킬: `api.md`, `skill-contribution.md`
