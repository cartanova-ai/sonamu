---
name: sonamu-frontend
description: Sonamu 프론트엔드 연동. 자동 생성 Service, TanStack Query hook, useTypeForm. Use when calling APIs from frontend.
---

# Frontend Service

## 기본 사용

```typescript
import { UserService } from "@/services/services.generated";

// 단일 조회 (Subset 필수) - get{Entity} 형태
const user = await UserService.getUser("A", 123);

// 목록 조회 - get{Entities} 형태
const { rows, total } = await UserService.getUsers("P", { num: 20, page: 1 });

// 저장
const [userId] = await UserService.save([{ email: "new@test.com", username: "newuser" }]);

// 삭제
const count = await UserService.del([1, 2, 3]);
```

## TanStack Query Hook

### useQuery

```typescript
function UserProfile({ userId }: { userId: number }) {
  // use{Entity} 형태 (단일), use{Entities} 형태 (목록)
  const { data: user, isLoading, error } = UserService.useUser("A", userId);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <h1>{user?.username}</h1>;
}
```

### useMutation

```typescript
function EditProfile() {
  const saveMutation = UserService.useSaveMutation();

  async function handleSubmit(data: UserSaveParams) {
    saveMutation.mutate({ spa: [data] }, {
      onSuccess: ([userId]) => console.log("Saved:", userId),
      onError: (error) => console.error("Failed:", error),
    });
  }

  return <button disabled={saveMutation.isPending}>저장</button>;
}
```

### 조건부 페칭

```typescript
const { data } = UserService.useUser("A", userId!, { enabled: userId !== null });
```

### 캐시 무효화

```typescript
const queryClient = useQueryClient();
queryClient.invalidateQueries({ queryKey: ["User", "findById", "A", userId] });
```

## useTypeForm

```tsx
import { useTypeForm } from "@sonamu-kit/react-components/lib";
import { UserSaveParams } from "@/services/user/user.types";

function RegisterForm() {
  const { register, submit, errors } = useTypeForm(UserSaveParams, {
    email: "", username: "", password: "",
  });

  const handleSubmit = submit(async (form) => {
    await UserService.save([form]);
  });

  return (
    <form>
      <input {...register("email")} />
      {errors.email && <span>{errors.email.message}</span>}
      <button onClick={handleSubmit}>등록</button>
    </form>
  );
}
```

### IMPORTANT: Form Required Field Initial Values

SaveParams에 required로 정의된 필드는 form 초기값에 **반드시 포함**:

| 타입 | 초기값 |
|------|--------|
| string (required) | `""` |
| number (required) | `0` |
| Date (required) | `new Date()` |
| enum (required) | 기본값 (예: `"draft"`) |
| FK (required) | `0` |
| nullable | `null` |

```typescript
const { form, setForm, register } = useTypeForm(TaskSaveParams, {
  title: "",                    // string required
  status: "draft",              // enum required
  budget: 0,                    // number required
  begin_date: new Date(),       // Date required
  description: null,            // nullable
  institution_id: 0,            // FK required
});
```

### IMPORTANT: Accessing Relation Objects When Loading Data

스캐폴딩된 form.tsx가 relation 객체에 접근하는 경우, 해당 필드가 subset에 포함되어 있어야 합니다.

**스캐폴딩 생성 코드 예시**:
```typescript
// 스캐폴딩된 form.tsx
QuestionService.getQuestion("A", id).then((row) => {
  setForm((prev) => ({
    ...prev,
    ...row,
    collection_id: row.collection?.id,  // ← collection 객체 접근
    parent_id: row.parent?.id ?? null,
  }));
});
```

**오류 발생 시**: `Property 'collection' does not exist on type`

**해결**: Entity의 subset A에 해당 relation 필드 추가

```json
// question.entity.json
{
  "subsets": {
    "A": [
      "id",
      "content",
      "collection.id",      // ← 추가
      "collection.title",   // ← 필요시 추가
      "parent.id",
      "answer_group.id"
    ]
  }
}
```

**참고**: subset 변경은 DB 마이그레이션 불필요. Sonamu UI에서 수정 후 sync만 하면 됨.

**대안**: FK 컬럼이 이미 row에 포함되어 있다면 relation 객체 접근 대신 직접 사용

```typescript
// relation 객체 접근 없이 FK 직접 사용 (subset 수정 불필요)
setForm((prev) => ({
  ...prev,
  ...row,  // collection_id, parent_id 등 FK가 이미 포함됨
}));
```

### IMPORTANT: SD() Translation Key for FK Fields

스캐폴딩된 form은 FK 필드에 `_id` 접미사를 사용하지만, `sd.generated.ts`는 relation 이름만 생성합니다.

```tsx
// 스캐폴딩 생성 코드
{SD("entity.Task.institution_id")}  // ← _id 접미사

// sd.generated.ts 자동 생성 키
"entity.Task.institution": "소속기관"  // ← _id 없음
```

**해결**: `ko.ts`에 `_id` 키 수동 추가

```typescript
// packages/api/src/i18n/ko.ts
export default {
  // FK 필드 i18n 키 (스캐폴딩된 form용)
  "entity.Task.institution_id": "소속기관",
  "entity.Question.collection_id": "소속 모음집",
  "entity.Question.parent_id": "상위 질문",
  "entity.Question.answer_group_id": "답변그룹",
  "entity.Response.user_id": "응답자",
  "entity.Response.collection_id": "응답한 설문",
  // ...
} as const;
```

**sync 후에도 유지됨**: `ko.ts`는 api → web으로 복사되므로 한 번만 추가하면 됨.

## 에러 처리

```typescript
import { isSonamuError } from "@/lib/sonamu.shared";

try {
  await UserService.save([{ /* ... */ }]);
} catch (error) {
  if (isSonamuError(error)) {
    console.log("Status:", error.code);
    console.log("Message:", error.message);
    error.issues.forEach((issue) => {
      console.log(`${issue.path.join(".")}: ${issue.message}`);
    });
  }
}
```

## SSR

```typescript
// api/src/ssr/routes.ts
import { registerSSR } from "sonamu/ssr";

registerSSR({
  path: "/companies/:companyId",
  preload: (params) => [
    UserService.me(),
    CompanyService.findById("A", Number(params.companyId)),
  ],
});
```

## Rules

- NEVER manually modify `services.generated.ts`
- MUST specify Subset parameter when calling APIs
- Use `Promise.all([...])` for parallel requests

---

## 전체 컴포넌트 구현 예시

### 목록 페이지

```typescript
// pages/consultations/index.tsx
import { useState } from "react";
import { ConsultationService } from "@/services/services.generated";

function ConsultationListPage() {
  const [params, setParams] = useState({ num: 20, page: 1 });
  
  const { data, isLoading, error } = ConsultationService.useConsultations(
    "P",  // Subset
    params
  );
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  return (
    <div>
      <h1>상담 목록</h1>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>제목</th>
            <th>상태</th>
            <th>작성일</th>
          </tr>
        </thead>
        <tbody>
          {data?.rows.map((row) => (
            <tr key={row.id}>
              <td>{row.id}</td>
              <td>{row.title}</td>
              <td>{row.status}</td>
              <td>{row.created_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {/* 페이지네이션 */}
      <div>
        <button
          disabled={params.page === 1}
          onClick={() => setParams((p) => ({ ...p, page: p.page - 1 }))}
        >
          이전
        </button>
        <span>Page {params.page}</span>
        <button
          disabled={!data || data.rows.length < params.num}
          onClick={() => setParams((p) => ({ ...p, page: p.page + 1 }))}
        >
          다음
        </button>
      </div>
    </div>
  );
}
```

**핵심 포인트:**
- Service.useXXX hooks로 데이터 조회
- 로딩/에러 상태 처리
- 페이지네이션 구현

### 편집 페이지

```typescript
// pages/consultations/[id].tsx
import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTypeForm } from "@sonamu-kit/react-components/lib";
import { ConsultationService } from "@/services/services.generated";
import { ConsultationSaveParams } from "@/services/consultation/consultation.types";

function ConsultationFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const { form, setForm, register, submit, errors } = useTypeForm(
    ConsultationSaveParams,
    {
      title: "",
      content: "",
      status: "pending",
      user_id: 0,
    }
  );
  
  // 데이터 로드 (수정 모드)
  useEffect(() => {
    if (id) {
      ConsultationService.getConsultation("A", Number(id)).then((row) => {
        setForm((prev) => ({ ...prev, ...row }));
      });
    }
  }, [id]);
  
  const saveMutation = ConsultationService.useSaveMutation();
  
  const handleSubmit = submit(async (form) => {
    const [consultationId] = await saveMutation.mutateAsync({ spa: [form] });
    navigate(`/consultations/${consultationId}`);
  });
  
  return (
    <div>
      <h1>{id ? "상담 수정" : "상담 등록"}</h1>
      <form>
        <div>
          <label>제목</label>
          <input {...register("title")} />
          {errors.title && <span className="error">{errors.title.message}</span>}
        </div>
        
        <div>
          <label>내용</label>
          <textarea {...register("content")} />
          {errors.content && <span className="error">{errors.content.message}</span>}
        </div>
        
        <div>
          <label>상태</label>
          <select {...register("status")}>
            <option value="pending">대기중</option>
            <option value="in_progress">진행중</option>
            <option value="completed">완료</option>
          </select>
          {errors.status && <span className="error">{errors.status.message}</span>}
        </div>
        
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? "저장 중..." : "저장"}
        </button>
      </form>
    </div>
  );
}
```

**핵심 포인트:**
- useTypeForm으로 폼 관리
- Zod 기반 유효성 검증
- useMutation으로 데이터 저장
- 수정 모드 시 데이터 로드

### 커스텀 API 호출 + 캐시 무효화

```typescript
// components/ConsultationDetail.tsx
import { useQueryClient } from "@tanstack/react-query";
import { ConsultationService } from "@/services/services.generated";
import type { ConsultationStatus } from "@/services/consultation/consultation.types";

function ConsultationDetail({ id }: { id: number }) {
  const queryClient = useQueryClient();
  
  const { data: consultation } = ConsultationService.useConsultation("A", id);
  
  const handleStatusChange = async (newStatus: ConsultationStatus) => {
    // 커스텀 API 호출
    await ConsultationService.changeStatus(id, newStatus, "상태 변경");
    
    // 캐시 무효화 - 해당 상담의 데이터를 다시 가져옴
    queryClient.invalidateQueries({
      queryKey: ["Consultation", "findById", "A", id]
    });
    
    // 목록 캐시도 무효화 (옵션)
    queryClient.invalidateQueries({
      queryKey: ["Consultation", "findMany"]
    });
  };
  
  if (!consultation) return <div>Loading...</div>;
  
  return (
    <div>
      <h2>{consultation.title}</h2>
      <p>현재 상태: {consultation.status}</p>
      <div>
        <button onClick={() => handleStatusChange("in_progress")}>
          진행 시작
        </button>
        <button onClick={() => handleStatusChange("completed")}>
          완료 처리
        </button>
      </div>
    </div>
  );
}
```

**핵심 포인트:**
- Service 클래스에서 커스텀 메서드 호출
- queryClient.invalidateQueries로 캐시 무효화
- 상태 변경 후 UI 자동 업데이트
