---
name: sonamu-frontend
description: Sonamu 프론트엔드 연동. 자동 생성 Service, TanStack Query hook, useTypeForm/useListParams/useSelection, FileInput, MultiSelect, SonamuProvider (react-components v0.1.8+). Use when calling APIs, building forms, handling file uploads, or managing list/selection states.
---

# Frontend Service

## 빠른 참조

### Hooks

| Hook            | 용도                       | 주요 반환값                                      |
| --------------- | -------------------------- | ------------------------------------------------ |
| `useTypeForm`   | 폼 상태 관리 (Zod 기반)    | form, setForm, register, submit, addError, reset |
| `useListParams` | URL 동기화 리스트 파라미터 | listParams, setListParams, register              |
| `useSelection`  | 체크박스 다중 선택         | selectedKeys, toggle, selectAll, deselectAll     |
| `useModal`      | 모달 상태 관리             | open, modal                                      |
| `useToast`      | 토스트 알림                | toast                                            |

### 컴포넌트

| 컴포넌트      | 용도         | 주요 Props                                          |
| ------------- | ------------ | --------------------------------------------------- |
| `Input`       | 텍스트 입력  | value, onValueChange                                |
| `Textarea`    | 여러 줄 입력 | value, onValueChange                                |
| `Checkbox`    | 체크박스     | value (boolean), onValueChange, label               |
| `Select`      | 단일 선택    | items, value, onValueChange, placeholder, clearable |
| `MultiSelect` | 다중 선택    | options, value (array), onValueChange, maxCount     |
| `EnumSelect`  | Enum 선택    | enum, labels, value, onValueChange                  |
| `FileInput`   | 파일 업로드  | uploadMode, viewMode, multiple, maxFiles            |

### Service (자동 생성)

| 메서드            | 용도             | 예시                                |
| ----------------- | ---------------- | ----------------------------------- |
| `get{Entity}`     | 단일 조회        | `UserService.getUser("A", 123)`     |
| `get{Entities}`   | 목록 조회        | `UserService.getUsers("P", params)` |
| `save`            | 저장 (생성/수정) | `UserService.save([data])`          |
| `del`             | 삭제             | `UserService.del([1, 2, 3])`        |
| `use{Entity}`     | 단일 조회 hook   | `UserService.useUser("A", id)`      |
| `use{Entities}`   | 목록 조회 hook   | `UserService.useUsers("P", params)` |
| `useSaveMutation` | 저장 mutation    | `UserService.useSaveMutation()`     |

### 유틸리티

| 함수               | 용도                 | 예시                                              |
| ------------------ | -------------------- | ------------------------------------------------- |
| `dateF`            | 날짜 포맷            | `dateF(new Date())` → `"2024-01-15"`              |
| `datetimeF`        | 날짜시간 포맷        | `datetimeF(new Date())` → `"2024-01-15 10:30:00"` |
| `numF`             | 숫자 포맷            | `numF(1234567)` → `"1,234,567"`                   |
| `hidden`           | 조건부 hidden 클래스 | `hidden(true)` → `"hidden"`                       |
| `arrayableToArray` | 배열 변환            | `arrayableToArray("a")` → `["a"]`                 |

### 설정

| 항목             | 설명                                    | 필수 여부                           |
| ---------------- | --------------------------------------- | ----------------------------------- |
| `SonamuProvider` | 전역 설정 Provider (uploader, auth, SD) | 필수 (uploader는 FileInput 사용 시) |
| `uploader`       | 파일 업로드 함수                        | FileInput 사용 시 필수              |
| `auth`           | 인증 상태 및 함수                       | 옵션                                |
| `SD`             | 다국어 함수                             | 옵션                                |

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
const [userId] = await UserService.save([
  { email: "new@test.com", username: "newuser" },
]);

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
const { data } = UserService.useUser("A", userId!, {
  enabled: userId !== null,
});
```

### 캐시 무효화

```typescript
const queryClient = useQueryClient();
queryClient.invalidateQueries({ queryKey: ["User", "findById", "A", userId] });
```

## useTypeForm

Zod 스키마 기반 타입 안전 폼 관리 (react-components v0.1.8+)

### 반환값

```typescript
const {
  form,
  setForm,
  register,
  submit,
  addError,
  removeError,
  clearError,
  reset,
} = useTypeForm(Schema, defaultValue);
```

| 반환값        | 타입                                                | 설명                       |
| ------------- | --------------------------------------------------- | -------------------------- |
| `form`        | `z.infer<Schema>`                                   | 현재 폼 데이터             |
| `setForm`     | `React.Dispatch<SetStateAction<...>>`               | 폼 상태 업데이트 함수      |
| `register`    | `(field: string) => RegisterReturn`                 | 필드 등록 함수             |
| `submit`      | `(callback) => () => Promise<R>`                    | 제출 핸들러 생성           |
| `addError`    | `(path: string, error: string \| ErrorObj) => void` | 에러 수동 추가             |
| `removeError` | `(path: string) => void`                            | 특정 필드 에러 제거        |
| `clearError`  | `() => void`                                        | 모든 에러 제거             |
| `reset`       | `() => void`                                        | 폼을 defaultValue로 초기화 |

### register 반환 객체

```typescript
register(fieldName) // Returns:
{
  value: any,                           // 현재 필드 값
  onValueChange: (value: any) => void,  // 값 변경 핸들러
  error?: { content: string }           // 에러 객체 (있는 경우)
}
```

### 기본 사용법

```tsx
import { useTypeForm } from "@sonamu-kit/react-components/lib";
import { Input } from "@sonamu-kit/react-components/components";
import { UserSaveParams } from "@/services/user/user.types";

function RegisterForm() {
  const { form, setForm, register, submit } = useTypeForm(UserSaveParams, {
    email: "",
    username: "",
    password: "",
  });

  const handleSubmit = submit(async (form) => {
    await UserService.save([form]);
  });

  // 방법 1: spread operator (권장)
  const emailProps = register("email");

  return (
    <form>
      <Input {...emailProps} />
      {emailProps.error && (
        <span className="error">{emailProps.error.content}</span>
      )}

      {/* 방법 2: 인라인 (짧은 경우) */}
      <Input {...register("username")} />
      {register("username").error && (
        <span className="error">{register("username").error.content}</span>
      )}

      <button onClick={handleSubmit}>등록</button>
    </form>
  );
}
```

### IMPORTANT: react-components UI 컴포넌트 사용

react-components의 모든 UI 컴포넌트는 `value/onValueChange` 패턴을 따릅니다:

```tsx
import { Input, Checkbox, Select, Textarea } from "@sonamu-kit/react-components/components";

// Input (string)
<Input {...register("email")} />

// Textarea (string)
<Textarea {...register("content")} />

// Checkbox (boolean)
<Checkbox {...register("agreed")} />

// Select (items prop 사용)
<Select
  {...register("status")}
  items={[
    { value: "active", label: "활성" },
    { value: "inactive", label: "비활성" }
  ]}
  placeholder="상태 선택"
/>

// Select 간단한 형태 (string[] | number[])
<Select
  {...register("priority")}
  items={["high", "medium", "low"]}
  placeholder="우선순위"
/>
```

**Select 컴포넌트 주요 props:**

- `items`: 선택 항목 배열 (`V[]` 또는 `{ value: V, label?: ReactNode, disabled?: boolean }[]`)
- `placeholder`: 선택 전 표시 텍스트
- `clearable`: X 버튼으로 선택 해제 가능 여부
- `renderItem`: 커스텀 렌더링 함수

### IMPORTANT: Form Required Field Initial Values

SaveParams에 required로 정의된 필드는 form 초기값에 **반드시 포함**:

| 타입              | 초기값                 |
| ----------------- | ---------------------- |
| string (required) | `""`                   |
| number (required) | `0`                    |
| Date (required)   | `new Date()`           |
| enum (required)   | 기본값 (예: `"draft"`) |
| FK (required)     | `0`                    |
| nullable          | `null`                 |

```typescript
const { form, setForm, register } = useTypeForm(TaskSaveParams, {
  title: "", // string required
  status: "draft", // enum required
  budget: 0, // number required
  begin_date: new Date(), // Date required
  description: null, // nullable
  institution_id: 0, // FK required
});
```

### IMPORTANT: Accessing Relation Objects When Loading Data

스캐폴딩된 form이 `row.collection?.id` 같은 relation 객체에 접근하면, subset A에 해당 relation이 포함되어 있어야 합니다.

**오류**: `Property 'collection' does not exist on type` → entity.json subset A에 `"collection.id"` 추가

```json
// question.entity.json > subsets > A
[
  "id",
  "content",
  "collection.id",
  "collection.title",
  "parent.id",
  "answer_group.id"
]
```

**대안**: FK가 이미 row에 있으면 relation 접근 없이 `...row`만으로 충분 (subset 수정 불필요)

### IMPORTANT: SD() Translation Key for FK Fields

스캐폴딩된 form은 `SD("entity.Task.institution_id")`를 사용하지만, `sd.generated.ts`에는 `_id` 없는 키만 생성됩니다.

**해결**: `ko.ts`에 `_id` 키 수동 추가

```typescript
// packages/api/src/i18n/ko.ts
"entity.Task.institution_id": "소속기관",
"entity.Question.collection_id": "소속 모음집",
```

`ko.ts`는 api → web으로 복사되므로 한 번만 추가하면 됨.

## useListParams

URL 쿼리 파라미터와 동기화되는 리스트 파라미터 관리 (페이지네이션, 필터링)

```typescript
import { useListParams } from "@sonamu-kit/react-components/lib";
import { z } from "zod";

const ListParamsSchema = z.object({
  page: z.coerce.number().default(1),
  num: z.coerce.number().default(20),
  search: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

function UserListPage() {
  const { listParams, setListParams, register } = useListParams(
    ListParamsSchema,
    { page: 1, num: 20 }
  );

  const { data } = UserService.useUsers("P", listParams);

  return (
    <div>
      {/* 검색 (변경 시 page=1로 리셋) */}
      <Input {...register("search")} placeholder="검색" />

      {/* 필터 (변경 시 page=1로 리셋) */}
      <Select {...register("status")} items={["active", "inactive"]} />

      {/* 페이지네이션 (page만 변경) */}
      <button onClick={() => setListParams({ ...listParams, page: listParams.page - 1 })}>
        이전
      </button>
      <span>Page {listParams.page}</span>
      <button onClick={() => setListParams({ ...listParams, page: listParams.page + 1 })}>
        다음
      </button>
    </div>
  );
}
```

**핵심:**

- URL과 자동 동기화 (`?page=2&status=active`)
- `register`는 page 외 필드 변경 시 자동으로 page를 1로 리셋
- Zod 스키마로 타입 안전성 보장

## useSelection

체크박스 다중 선택 관리 (Shift 키 범위 선택 지원)

```typescript
import { useSelection } from "@sonamu-kit/react-components/lib";

function UserListPage() {
  const { data } = UserService.useUsers("P", { num: 20, page: 1 });
  const userIds = data?.rows.map(row => row.id) ?? [];

  const {
    getSelected,
    toggle,
    selectedKeys,
    selectAll,
    deselectAll,
    isAllSelected,
    handleCheckboxClick
  } = useSelection(userIds);

  const handleDelete = async () => {
    await UserService.del(selectedKeys);
    deselectAll();
  };

  return (
    <div>
      <Checkbox
        value={isAllSelected}
        onValueChange={isAllSelected ? deselectAll : selectAll}
        label="전체 선택"
      />
      <button onClick={handleDelete} disabled={selectedKeys.length === 0}>
        선택 삭제 ({selectedKeys.length})
      </button>

      {data?.rows.map((user, index) => (
        <div key={user.id} onClick={(e) => handleCheckboxClick(e, index)}>
          <Checkbox
            value={getSelected(user.id)}
            onValueChange={() => toggle(user.id)}
          />
          <span>{user.name}</span>
        </div>
      ))}
    </div>
  );
}
```

**핵심:**

- Shift 키 + 클릭으로 범위 선택
- `selectedKeys`: 현재 선택된 키 배열
- `isAllSelected`: 전체 선택 여부

## IdAsyncSelect

Entity의 레코드를 비동기로 검색하여 선택하는 컴포넌트입니다. Entity의 Primary Key 타입에 따라 제네릭 타입을 명시해야 합니다.

### 기본 사용법

IdAsyncSelect는 일반적으로 Entity별 래퍼 컴포넌트로 사용합니다:

```typescript
import { IdAsyncSelect } from "@sonamu-kit/react-components/components";
import { UserAsyncIdConfig } from "@/services/services.generated";
import type { UserSubsetKey, UserSubsetMapping } from "@/services/sonamu.generated";
import type { UserListParams } from "@/services/user/user.types";

export type UserIdAsyncSelectProps<T extends UserSubsetKey> = {
  subset: T;
  baseListParams?: UserListParams;
  displayField?: keyof UserSubsetMapping[T] & string;
  valueField?: keyof UserSubsetMapping[T] & string;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  multiple?: boolean;
  value?: number | number[] | null;  // Number PK
  onValueChange?: (value: number | number[] | undefined) => void;
};

export function UserIdAsyncSelect<T extends UserSubsetKey>({
  subset,
  value,
  onValueChange,
  baseListParams,
  displayField = "name",
  valueField = "id",
  placeholder = "사용자",
  clearable,
  disabled,
  className,
  multiple = false,
}: UserIdAsyncSelectProps<T>) {
  return (
    <IdAsyncSelect<number>  // Number PK
      config={UserAsyncIdConfig}
      subset={subset}
      baseListParams={baseListParams}
      displayField={displayField}
      valueField={valueField}
      placeholder={placeholder}
      clearable={clearable}
      disabled={disabled}
      className={className}
      multiple={multiple}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
```

**주요 Props:**

- `config`: 자동 생성된 AsyncIdConfig (EntityAsyncIdConfig 형태)
- `subset`: 조회할 Subset 키
- `baseListParams`: 목록 조회 필터 파라미터
- `displayField`: 화면에 표시할 필드명 (기본값: Entity에 따라 다름)
- `valueField`: value로 사용할 필드명 (기본값: "id")
- `multiple`: 다중 선택 여부
- `value`: 현재 선택된 값 (PK 타입에 따라 number 또는 string)
- `onValueChange`: 값 변경 핸들러

### Cascade Dropdown 패턴 (계층 선택)

부서 → 과소 → 연구실처럼 상위 선택에 따라 하위 목록이 변해야 하는 경우, `baseListParams`를 동적으로 전달하면 된다.

**핵심 동작**: `baseListParams` prop이 변경되면 `IdAsyncSelect` 내부 React Query가 새 파라미터로 자동 재조회한다. (v0.2.5+에서 수정된 버그 - 이전 버전은 초기값만 사용하고 변경을 반영하지 않았음)

```tsx
// 예시: 부서 → 과소 → 연구실 3단계 cascade
function UserForm() {
  const { form, register, setForm } = useTypeForm(UserSaveParams, {
    dept_id: null,
    division_id: null,
    lab_id: null,
  });

  return (
    <form>
      {/* 1단계: 부서 선택 (전체 목록 → preload 또는 기본 IdAsyncSelect) */}
      <DepartmentIdAsyncSelect
        subset="A"
        {...register("dept_id")}
        onValueChange={(v) => {
          // 부서 변경 시 하위 값 초기화
          setForm((prev) => ({ ...prev, dept_id: v ?? null, division_id: null, lab_id: null }));
        }}
      />

      {/* 2단계: 과소 선택 (선택된 부서의 과소만 조회) */}
      <DivisionIdAsyncSelect
        subset="A"
        baseListParams={form.dept_id ? { department_id: form.dept_id } : undefined}
        disabled={!form.dept_id}
        {...register("division_id")}
        onValueChange={(v) => {
          // 과소 변경 시 연구실 초기화
          setForm((prev) => ({ ...prev, division_id: v ?? null, lab_id: null }));
        }}
      />

      {/* 3단계: 연구실 선택 (선택된 과소의 연구실만 조회) */}
      <LabIdAsyncSelect
        subset="A"
        baseListParams={form.division_id ? { division_id: form.division_id } : undefined}
        disabled={!form.division_id}
        {...register("lab_id")}
      />
    </form>
  );
}
```

**주의사항**:
- 상위가 변경될 때 하위 값을 명시적으로 `null`로 초기화해야 한다. IdAsyncSelect는 자동으로 초기화하지 않는다.
- `disabled` prop으로 상위가 선택되지 않은 경우 하위를 비활성화하는 것이 UX에 좋다.
- `baseListParams`가 `undefined`이면 IdAsyncSelect는 enabled=false 상태로 조회하지 않는다.

**Spec에 명시할 항목** (cascade가 있는 경우 spec.json의 acceptanceCriteria에 추가 권장):
```json
"acceptanceCriteria": [
  "부서 선택 시 해당 부서의 과소만 드롭다운으로 조회된다",
  "과소 선택 시 해당 과소의 연구실만 드롭다운으로 조회된다",
  "부서 변경 시 하위 과소/연구실 선택이 초기화된다"
]
```

### IMPORTANT: String Primary Key Support

대부분 Entity는 Number PK (`IdAsyncSelect<number>`)이지만, better-auth 관련 Entity는 String PK를 사용합니다.

**String PK Entity**: User, Account, Session, Verification

**변경 포인트** (scaffolding 후 수동 수정 필요):

```typescript
// Number PK (기본)
value?: number | number[] | null;
onValueChange?: (value: number | number[] | undefined) => void;
<IdAsyncSelect<number> config={PostAsyncIdConfig} ... />

// String PK (User, Account 등) — 아래 3곳 모두 string으로 변경
value?: string | string[] | null;
onValueChange?: (value: string | string[] | undefined) => void;
<IdAsyncSelect<string> config={AccountAsyncIdConfig} ... />
```

### 폼에서 사용

```tsx
function PostForm() {
  const { form, setForm, register } = useTypeForm(PostSaveParams, {
    title: "",
    author_id: 0, // or "" for string PK
  });

  return (
    <form>
      <Input {...register("title")} />

      {/* Number PK */}
      <UserIdAsyncSelect subset="A" {...register("author_id")} />

      {/* String PK */}
      <AccountIdAsyncSelect subset="A" {...register("account_id")} />
    </form>
  );
}
```

## FileInput

파일 업로드 컴포넌트 (이미지/일반 파일, eager/lazy 모드)

```typescript
import { FileInput } from "@sonamu-kit/react-components/components";
import type { SonamuFile } from "@sonamu-kit/react-components/contexts";

function ProfileForm() {
  const { form, setForm, register, submit } = useTypeForm(ProfileSaveParams, {
    avatar: null,  // SonamuFile | File | null
    documents: [], // (SonamuFile | File)[]
  });

  return (
    <form>
      {/* 단일 이미지 - eager 업로드 */}
      <FileInput
        {...register("avatar")}
        uploadMode="eager"
        viewMode="image"
        placeholder="프로필 이미지"
        accept="image/*"
        previewSize="md"
      />

      {/* 다중 파일 - lazy 업로드 */}
      <FileInput
        {...register("documents")}
        uploadMode="lazy"
        viewMode="file"
        multiple
        maxFiles={5}
        placeholder="문서 첨부"
      />

      <button onClick={submit(async (form) => {
        // lazy 모드: submit 시 자동 업로드
        await ProfileService.save([form]);
      })}>저장</button>
    </form>
  );
}
```

**Props:**

- `uploadMode`: `"eager"` (즉시 업로드) | `"lazy"` (submit 시 업로드)
- `viewMode`: `"image"` (이미지 프리뷰) | `"file"` (파일명)
- `multiple`: 다중 파일 선택 여부
- `maxFiles`: 최대 파일 개수
- `previewSize`: `"sm" | "md" | "lg" | "xl"`
- `clearable`: X 버튼으로 제거 가능

**IMPORTANT**: SonamuProvider에 uploader 함수 필수 설정 (아래 참조)

## Select (다중 선택 모드)

`Select` 컴포넌트에 `multiple: true`를 설정하면 다중 선택 모드로 동작합니다.

```typescript
import { Select } from "@sonamu-kit/react-components/components";

function TagForm() {
  const { register } = useTypeForm(PostSaveParams, {
    tag_ids: [],  // number[]
  });

  const items = [
    { value: 1, label: "JavaScript" },
    { value: 2, label: "TypeScript" },
    { value: 3, label: "React" },
    { value: 4, label: "Vue" },
  ];

  return (
    <Select
      {...register("tag_ids")}
      items={items}
      multiple
      placeholder="태그 선택"
    />
  );
}
```

**다중 선택 전용 Props:**

- `multiple`: `true` (다중 선택 활성화)
- `maxCount`: 표시할 최대 배지 개수
- `hideSelectAll`: 전체 선택 버튼 숨기기
- `searchable`: 검색 입력 활성화

**공통 Props:**

- `items`: `SelectItemDef[]` (값만 또는 `{ value, label, disabled }` 형태)
- `placeholder`: 선택 전 표시 텍스트
- `clearable`: X 버튼으로 전체 해제
- `disabled`: 비활성화
- `renderItem`: 커스텀 렌더링 함수
- `async`: `true` 설정 시 `onSearch` 콜백으로 비동기 검색 지원

## EnumSelect

Zod enum과 연동된 Select (라벨 매핑)

```typescript
import { EnumSelect } from "@sonamu-kit/react-components/components";
import { z } from "zod";

const StatusEnum = z.enum(["draft", "published", "archived"]);

const statusLabels = {
  draft: "초안",
  published: "발행됨",
  archived: "보관됨",
} as const;

function PostForm() {
  const { register } = useTypeForm(PostSaveParams, {
    status: "draft",
  });

  return (
    <EnumSelect
      {...register("status")}
      enum={StatusEnum}
      labels={statusLabels}
      placeholder="상태 선택"
      clearable
    />
  );
}
```

**핵심:**

- Zod enum 타입 안전성
- labels 객체로 표시명 매핑
- enum.options를 자동으로 items로 변환

## SonamuProvider

react-components 전체에서 사용하는 전역 설정

```typescript
// App.tsx 또는 루트 컴포넌트
import { SonamuProvider } from "@sonamu-kit/react-components/contexts";
import type { SonamuFile } from "@sonamu-kit/react-components/contexts";

function App() {
  // 파일 업로더 함수 (FileInput, useTypeForm에서 사용)
  const uploader = async (files: File[]): Promise<SonamuFile[]> => {
    const formData = new FormData();
    files.forEach(file => formData.append("files", file));

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    return response.json();
  };

  // 인증 상태 (옵션)
  const auth = {
    user: currentUser,
    loading: isLoading,
    login: async (params) => { /* ... */ },
    logout: async () => { /* ... */ },
    refetch: async () => { /* ... */ },
  };

  // 다국어 함수 (옵션)
  const SD = (key: string) => dictionary[key] ?? key;

  return (
    <SonamuProvider uploader={uploader} auth={auth} SD={SD}>
      {children}
    </SonamuProvider>
  );
}
```

**필수 Props:**

- `uploader`: `(files: File[]) => Promise<SonamuFile[]>` - FileInput에서 사용
- `auth`: 인증 상태 및 함수 (옵션)
- `SD`: 다국어 함수 (옵션)

## 유틸리티 함수

```typescript
import {
  dateF,
  datetimeF,
  numF,
  hidden,
  arrayableToArray,
  sqlDateToDateString,
} from "@sonamu-kit/react-components/lib";

// 날짜 포매팅
dateF(new Date());           // "2024-01-15"
dateF("2024-01-15T10:30:00"); // "2024-01-15"
datetimeF(new Date());       // "2024-01-15 10:30:00"

// 숫자 포매팅
numF(1234567);  // "1,234,567"

// 조건부 hidden 클래스
<div className={hidden(isHidden)}>...</div>

// SQL date → date string
sqlDateToDateString("2024-01-15T10:30:00.000Z");  // "2024-01-15"

// 배열 변환
arrayableToArray("single");      // ["single"]
arrayableToArray(["a", "b"]);    // ["a", "b"]
arrayableToArray(undefined);     // []
```

## 에러 처리

```typescript
import { isSonamuError } from "@/lib/sonamu.shared";

try {
  await UserService.save([
    {
      /* ... */
    },
  ]);
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

## 프로젝트 초기 설정

**→ `create-sonamu.md` "프로젝트명 변경" 섹션 참조** (index.html, \_\_root.tsx, index.tsx, Sidebar.tsx 4개 파일 변경)

## Rules

- NEVER manually modify `services.generated.ts`
- MUST specify Subset parameter when calling APIs
- Use `Promise.all([...])` for parallel requests

---

## 전체 컴포넌트 구현 예시

### 목록 페이지

```typescript
function ConsultationListPage() {
  const [params, setParams] = useState({ num: 20, page: 1 });
  const { data, isLoading } = ConsultationService.useConsultations("P", params);

  return (
    <div>
      {/* useSelection으로 선택 관리 */}
      {data?.rows.map((row) => (
        <div key={row.id}>{row.title} - {row.status}</div>
      ))}
      {/* 페이지네이션: params.page 조작 */}
    </div>
  );
}
```

### 편집 페이지

```typescript
function ConsultationFormPage() {
  const { id } = useParams();
  const { form, setForm, register, submit } = useTypeForm(ConsultationSaveParams, {
    title: "", content: "", status: "pending", user_id: 0,
  });

  // 수정 모드: 데이터 로드
  useEffect(() => {
    if (id) ConsultationService.getConsultation("A", Number(id)).then((row) => setForm((prev) => ({ ...prev, ...row })));
  }, [id]);

  const saveMutation = ConsultationService.useSaveMutation();
  const handleSubmit = submit(async (form) => {
    const [cId] = await saveMutation.mutateAsync({ spa: [form] });
    navigate(`/consultations/${cId}`);
  });

  return (
    <form>
      <Input {...register("title")} />
      <Textarea {...register("content")} />
      <Select {...register("status")} items={[{value:"pending",label:"대기중"},{value:"completed",label:"완료"}]} />
      <button onClick={handleSubmit} disabled={saveMutation.isPending}>저장</button>
    </form>
  );
}
```

### 캐시 무효화

```typescript
const queryClient = useQueryClient();
await ConsultationService.changeStatus(id, newStatus, "상태 변경");
queryClient.invalidateQueries({
  queryKey: ["Consultation", "findById", "A", id],
});
queryClient.invalidateQueries({ queryKey: ["Consultation", "findMany"] });
```
