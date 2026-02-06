---
name: sonamu-frontend
description: Sonamu 프론트엔드 연동. 자동 생성 Service, TanStack Query hook, useTypeForm/useListParams/useSelection, FileInput, MultiSelect, SonamuProvider (react-components v0.1.8+). Use when calling APIs, building forms, handling file uploads, or managing list/selection states.
---

# Frontend Service

## 빠른 참조

### Hooks

| Hook | 용도 | 주요 반환값 |
|------|------|------------|
| `useTypeForm` | 폼 상태 관리 (Zod 기반) | form, setForm, register, submit, addError, reset |
| `useListParams` | URL 동기화 리스트 파라미터 | listParams, setListParams, register |
| `useSelection` | 체크박스 다중 선택 | selectedKeys, toggle, selectAll, deselectAll |
| `useModal` | 모달 상태 관리 | open, modal |
| `useToast` | 토스트 알림 | toast |

### 컴포넌트

| 컴포넌트 | 용도 | 주요 Props |
|---------|------|-----------|
| `Input` | 텍스트 입력 | value, onValueChange |
| `Textarea` | 여러 줄 입력 | value, onValueChange |
| `Checkbox` | 체크박스 | value (boolean), onValueChange, label |
| `Select` | 단일 선택 | items, value, onValueChange, placeholder, clearable |
| `MultiSelect` | 다중 선택 | options, value (array), onValueChange, maxCount |
| `EnumSelect` | Enum 선택 | enum, labels, value, onValueChange |
| `FileInput` | 파일 업로드 | uploadMode, viewMode, multiple, maxFiles |

### Service (자동 생성)

| 메서드 | 용도 | 예시 |
|--------|------|------|
| `get{Entity}` | 단일 조회 | `UserService.getUser("A", 123)` |
| `get{Entities}` | 목록 조회 | `UserService.getUsers("P", params)` |
| `save` | 저장 (생성/수정) | `UserService.save([data])` |
| `del` | 삭제 | `UserService.del([1, 2, 3])` |
| `use{Entity}` | 단일 조회 hook | `UserService.useUser("A", id)` |
| `use{Entities}` | 목록 조회 hook | `UserService.useUsers("P", params)` |
| `useSaveMutation` | 저장 mutation | `UserService.useSaveMutation()` |

### 유틸리티

| 함수 | 용도 | 예시 |
|------|------|------|
| `dateF` | 날짜 포맷 | `dateF(new Date())` → `"2024-01-15"` |
| `datetimeF` | 날짜시간 포맷 | `datetimeF(new Date())` → `"2024-01-15 10:30:00"` |
| `numF` | 숫자 포맷 | `numF(1234567)` → `"1,234,567"` |
| `hidden` | 조건부 hidden 클래스 | `hidden(true)` → `"hidden"` |
| `arrayableToArray` | 배열 변환 | `arrayableToArray("a")` → `["a"]` |

### 설정

| 항목 | 설명 | 필수 여부 |
|------|------|----------|
| `SonamuProvider` | 전역 설정 Provider (uploader, auth, SD) | 필수 (uploader는 FileInput 사용 시) |
| `uploader` | 파일 업로드 함수 | FileInput 사용 시 필수 |
| `auth` | 인증 상태 및 함수 | 옵션 |
| `SD` | 다국어 함수 | 옵션 |

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
  reset
} = useTypeForm(Schema, defaultValue);
```

| 반환값 | 타입 | 설명 |
|--------|------|------|
| `form` | `z.infer<Schema>` | 현재 폼 데이터 |
| `setForm` | `React.Dispatch<SetStateAction<...>>` | 폼 상태 업데이트 함수 |
| `register` | `(field: string) => RegisterReturn` | 필드 등록 함수 |
| `submit` | `(callback) => () => Promise<R>` | 제출 핸들러 생성 |
| `addError` | `(path: string, error: string \| ErrorObj) => void` | 에러 수동 추가 |
| `removeError` | `(path: string) => void` | 특정 필드 에러 제거 |
| `clearError` | `() => void` | 모든 에러 제거 |
| `reset` | `() => void` | 폼을 defaultValue로 초기화 |

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
    email: "", username: "", password: "",
  });

  const handleSubmit = submit(async (form) => {
    await UserService.save([form]);
  });

  // 방법 1: spread operator (권장)
  const emailProps = register("email");

  return (
    <form>
      <Input {...emailProps} />
      {emailProps.error && <span className="error">{emailProps.error.content}</span>}

      {/* 방법 2: 인라인 (짧은 경우) */}
      <Input {...register("username")} />
      {register("username").error && <span className="error">{register("username").error.content}</span>}

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

### 에러 처리 메서드

```typescript
const { addError, removeError, clearError } = useTypeForm(...);

// 서버 검증 실패 시 에러 추가
try {
  await UserService.save([form]);
} catch (error) {
  if (isSonamuError(error)) {
    error.issues.forEach((issue) => {
      addError(issue.path.join("."), issue.message);
    });
  }
}

// 특정 필드 에러 제거
removeError("email");

// 모든 에러 제거
clearError();

// 폼 초기화
reset();
```

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

### IMPORTANT: String Primary Key Support

**Number PK Entity (대부분의 Entity):**
```typescript
export type PostIdAsyncSelectProps<T extends PostSubsetKey> = {
  // ...
  value?: number | number[] | null;
  onValueChange?: (value: number | number[] | undefined) => void;
};

export function PostIdAsyncSelect<T extends PostSubsetKey>({...}: PostIdAsyncSelectProps<T>) {
  return (
    <IdAsyncSelect<number>  // ← Number PK
      config={PostAsyncIdConfig}
      // ...
    />
  );
}
```

**String PK Entity (User, Account, Session, Verification 등):**
```typescript
export type AccountIdAsyncSelectProps<T extends AccountSubsetKey> = {
  // ...
  value?: string | string[] | null;  // ← String으로 변경
  onValueChange?: (value: string | string[] | undefined) => void;
};

export function AccountIdAsyncSelect<T extends AccountSubsetKey>({...}: AccountIdAsyncSelectProps<T>) {
  return (
    <IdAsyncSelect<string>  // ← String PK
      config={AccountAsyncIdConfig}
      // ...
    />
  );
}
```

**String PK를 사용하는 주요 Entity:**
- `User`: 사용자 계정 (일반적으로 UUID 또는 영문자 ID)
- `Account`: 인증 계정 정보
- `Session`: 세션 관리
- `Verification`: 인증 토큰

**scaffolding 후 수정 필요:**
- Sonamu scaffolding은 기본적으로 Number PK를 가정하고 코드를 생성합니다
- String PK Entity의 경우 생성된 IdAsyncSelect 래퍼 컴포넌트를 수동으로 수정해야 합니다
- 제네릭 타입, value 타입, onValueChange 타입을 모두 `string`으로 변경해야 합니다

### 폼에서 사용

```tsx
function PostForm() {
  const { form, setForm, register } = useTypeForm(PostSaveParams, {
    title: "",
    author_id: 0,  // or "" for string PK
  });

  return (
    <form>
      <Input {...register("title")} />

      {/* Number PK */}
      <UserIdAsyncSelect
        subset="A"
        {...register("author_id")}
      />

      {/* String PK */}
      <AccountIdAsyncSelect
        subset="A"
        {...register("account_id")}
      />
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

## MultiSelect

다중 선택 컴포넌트 (검색, 그룹, 애니메이션 지원)

```typescript
import { MultiSelect } from "@sonamu-kit/react-components/components";
import type { MultiSelectOption } from "@sonamu-kit/react-components/components";

function TagForm() {
  const { register } = useTypeForm(PostSaveParams, {
    tag_ids: [],  // number[]
  });

  const options: MultiSelectOption[] = [
    { label: "JavaScript", value: "1" },
    { label: "TypeScript", value: "2" },
    { label: "React", value: "3" },
    { label: "Vue", value: "4" },
  ];

  return (
    <MultiSelect
      {...register("tag_ids")}
      options={options}
      placeholder="태그 선택"
      emptyIndicator={<span>태그가 없습니다</span>}
    />
  );
}
```

**주요 Props:**
- `options`: `MultiSelectOption[]`
- `groups`: 옵션 그룹화
- `maxCount`: 표시할 최대 배지 개수
- `badgeAnimation`: `"bounce" | "pulse" | "wiggle" | "fade" | "slide"`
- `disabled`: 비활성화

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

## 프로젝트 초기 설정

### 프로젝트명 변경 (신규 프로젝트 생성 시)

사용자가 프로젝트 생성을 요청했을 때, 프론트엔드의 "Sonamu" 텍스트를 프로젝트명으로 변경해야 합니다.

**변경해야 할 파일 4개:**

1. **`packages/web/index.html`** - 브라우저 탭 제목
```html
<!-- 변경 전 -->
<title>Sonamu Project</title>

<!-- 변경 후 -->
<title>{프로젝트명}</title>
```

2. **`packages/web/src/routes/__root.tsx`** - TanStack Router head 설정 (가장 중요!)
```typescript
// 변경 전
head: () => ({
  meta: [
    { title: "Sonamu Project" },
  ],
}),

// 변경 후
head: () => ({
  meta: [
    { title: "{프로젝트명}" },
  ],
}),
```

**중요:** `__root.tsx`를 변경하지 않으면 HMR 시 title이 "Sonamu"로 되돌아갑니다!

3. **`packages/web/src/routes/index.tsx`** - 메인 페이지 제목
```tsx
// 변경 전
<h1 className="text-2xl font-bold mb-4">Welcome to Sonamu</h1>

// 변경 후
<h1 className="text-2xl font-bold mb-4">Welcome to {프로젝트명}</h1>
```

4. **`packages/web/src/components/Sidebar.tsx`** - 사이드바 앱 이름
```typescript
// 변경 전
const title = isAdmin ? "Admin" : "Sonamu App";

// 변경 후
const title = isAdmin ? "Admin" : "{프로젝트명}";
```

**작업 순서:**
1. 사용자가 "KOPRI 프로젝트 생성해줘" 요청
2. API 프로젝트 생성 (`pnpm create sonamu kopri`)
3. **프론트엔드 4개 파일에서 "Sonamu" → "KOPRI" 변경**
4. 개발 서버 실행 후 브라우저에서 확인

**확인 방법:**
- 브라우저 탭에 프로젝트명이 표시되는지 확인
- 파일 저장 시 HMR로 탭 제목이 변경되지 않는지 확인 (변경되면 `__root.tsx` 누락)

---

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
import { Input, Textarea, Select } from "@sonamu-kit/react-components/components";
import { ConsultationService } from "@/services/services.generated";
import { ConsultationSaveParams } from "@/services/consultation/consultation.types";

function ConsultationFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { form, setForm, register, submit } = useTypeForm(
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

  const titleProps = register("title");
  const contentProps = register("content");
  const statusProps = register("status");

  return (
    <div>
      <h1>{id ? "상담 수정" : "상담 등록"}</h1>
      <form>
        <div>
          <label>제목</label>
          <Input {...titleProps} />
          {titleProps.error && <span className="error">{titleProps.error.content}</span>}
        </div>

        <div>
          <label>내용</label>
          <Textarea {...contentProps} />
          {contentProps.error && <span className="error">{contentProps.error.content}</span>}
        </div>

        <div>
          <label>상태</label>
          <Select
            {...statusProps}
            items={[
              { value: "pending", label: "대기중" },
              { value: "in_progress", label: "진행중" },
              { value: "completed", label: "완료" }
            ]}
            placeholder="상태 선택"
          />
          {statusProps.error && <span className="error">{statusProps.error.content}</span>}
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
- useTypeForm으로 폼 관리 (form, setForm, register, submit 반환)
- register는 { value, onValueChange, error? } 객체 반환
- react-components UI 컴포넌트 사용 (Input, Textarea, Select)
- Select는 items prop으로 선택 항목 전달
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
