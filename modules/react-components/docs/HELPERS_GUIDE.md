# shadcn/ui Helpers 사용 가이드

`@sonamu-kit/react-components`의 helpers는 **semantic-ui-react와 shadcn/ui 모두 지원**하는 범용 helper입니다.

## ✨ 핵심 특징

- ✅ **semantic-ui-react와 shadcn/ui 모두 동일하게 사용 가능**
- ✅ **`{...register("field")}` 패턴으로 간단한 사용**
- ✅ **컴포넌트별 onChange 차이 자동 처리**
- ✅ **URL 쿼리 파라미터 자동 연동** (useListParams)

---

## 📦 Import

```typescript
import { useTypeForm, useListParams } from "@sonamu-kit/react-components/lib";
```

---

## 🎯 useListParams

URL 쿼리 파라미터와 자동 연동되는 리스트 파라미터 관리 Hook

### shadcn/ui 사용법

```typescript
import { useListParams } from "@sonamu-kit/react-components/lib";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Input,
} from "@sonamu-kit/react-components/components";
import { z } from "zod";

// Zod 스키마 정의
const FeedSiteListParams = z.object({
  num: z.number(),
  page: z.number(),
  orderBy: z.string(),
  search: z.string(),
  keyword: z.string().optional(),
});

function FeedSiteList() {
  const { listParams, register } = useListParams(FeedSiteListParams, {
    num: 10,
    page: 1,
    orderBy: "id-desc",
    search: "id",
    keyword: "",
  });

  return (
    <div>
      {/* 모든 컴포넌트에 register를 그대로 스프레드 */}

      {/* Search Type Select */}
      <Select {...register("search")}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="id">Search ID</SelectItem>
          <SelectItem value="title">Search Name</SelectItem>
        </SelectContent>
      </Select>

      {/* Search Input */}
      <Input {...register("keyword")} placeholder="Search..." />

      {/* Order By Select */}
      <Select {...register("orderBy")}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="id-desc">Recently</SelectItem>
          <SelectItem value="id-asc">Oldest</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
```

### semantic-ui-react 사용법

```typescript
import { useListParams } from "@sonamu-kit/react-components/lib";
import { FeedSiteSearchInput } from "src/components/feed-site/FeedSiteSearchInput";
import { FeedSiteOrderBySelect } from "src/components/feed-site/FeedSiteOrderBySelect";

function FeedSiteList() {
  const { listParams, register } = useListParams(FeedSiteListParams, {
    num: 12,
    page: 1,
    orderBy: "id-desc",
    search: "id",
  });

  return (
    <div>
      {/* semantic-ui-react도 동일하게 사용 */}
      <FeedSiteSearchInput
        input={register("keyword")}
        dropdown={register("search")}
      />

      <FeedSiteOrderBySelect {...register("orderBy")} />
    </div>
  );
}
```

### API

#### `useListParams(schema, defaultValue, options?)`

**Parameters:**

- `schema`: Zod 스키마
- `defaultValue`: 기본값
- `options`: (선택)
  - `disableSearchParams?: boolean` - URL 파라미터 연동 비활성화

**Returns:**

- `listParams`: 현재 파라미터 값
- `setListParams`: 파라미터 전체 업데이트
- `register(name)`: 컴포넌트와 연결할 props 반환
- `registerInput(name)`: Input 전용 (필요 시)
- `registerSelect(name)`: Select 전용 (필요 시)
- `registerCheckbox(name)`: Checkbox 전용 (필요 시)
- `updateParams(updates)`: 부분 업데이트

#### `register(name)` 반환 값

```typescript
{
  name: string;
  value: any;
  checked: boolean;
  // semantic-ui-react: onChange(e, { value })
  // shadcn/ui Input: onChange(e)
  onChange: (e: any, data?: { value: any; checked?: boolean }) => void;
  // shadcn/ui Select: onValueChange(value)
  onValueChange: (value: any) => void;
  // shadcn/ui Checkbox: onCheckedChange(checked)
  onCheckedChange: (checked: boolean) => void;
}
```

**핵심**: 모든 핸들러를 동시에 제공하므로, 각 컴포넌트가 자신에게 필요한 핸들러만 사용합니다.

---

## 📝 useTypeForm

Form 상태 관리 및 Validation Hook

### shadcn/ui 사용법

```typescript
import { useTypeForm } from "@sonamu-kit/react-components/lib";
import {
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Checkbox,
} from "@sonamu-kit/react-components/components";
import { z } from "zod";

// Zod 스키마 정의
const FeedSiteSchema = z.object({
  title: z.string(),
  list_url: z.string().url(),
  crawling_status: z.enum(["active", "stopped"]),
  is_enabled: z.boolean(),
});

function FeedSiteForm() {
  const { form, setForm, register, reset } = useTypeForm(FeedSiteSchema, {
    title: "",
    list_url: "",
    crawling_status: "active",
    is_enabled: true,
  });

  const handleSubmit = async () => {
    try {
      await FeedSiteService.save(form);
      reset();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <form>
      {/* 모든 컴포넌트에 register를 그대로 스프레드 */}

      {/* Input */}
      <Input {...register("title")} placeholder="Site Name" />
      <Input {...register("list_url")} placeholder="https://example.com" />

      {/* Select */}
      <Select {...register("crawling_status")}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="stopped">Stopped</SelectItem>
        </SelectContent>
      </Select>

      {/* Checkbox */}
      <Checkbox {...register("is_enabled")} />

      <Button onClick={handleSubmit}>Save</Button>
      <Button onClick={reset}>Reset</Button>
    </form>
  );
}
```

### semantic-ui-react 사용법

```typescript
import { useTypeForm } from "@sonamu-kit/react-components/lib";
import { Form, Input, Dropdown, Checkbox } from "semantic-ui-react";

function FeedSiteForm() {
  const { form, setForm, register, reset } = useTypeForm(
    FeedSiteSchema,
    defaultValue
  );

  return (
    <Form>
      {/* semantic-ui-react도 동일하게 사용 */}
      <Form.Field>
        <label>Site Name</label>
        <Input {...register("title")} />
      </Form.Field>

      <Form.Field>
        <label>Status</label>
        <Dropdown
          {...register("crawling_status")}
          options={[
            { key: "active", value: "active", text: "Active" },
            { key: "stopped", value: "stopped", text: "Stopped" },
          ]}
        />
      </Form.Field>

      <Form.Field>
        <Checkbox {...register("is_enabled")} label="Enabled" />
      </Form.Field>
    </Form>
  );
}
```

### API

#### `useTypeForm(schema, defaultValue)`

**Parameters:**

- `schema`: Zod 스키마
- `defaultValue`: 기본값

**Returns:**

- `form`: 현재 form 상태
- `setForm`: form 상태 업데이트
- `register(path)`: 컴포넌트와 연결 (범용)
- `registerInput(path)`: Input/Textarea 전용
- `registerSelect(path)`: Select/RadioGroup 전용
- `registerCheckbox(path)`: Checkbox/Switch 전용
- `addError(path, message)`: 에러 추가
- `removeError(path)`: 에러 제거
- `clearError()`: 모든 에러 제거
- `reset()`: 초기값으로 리셋

---

## 🔍 내부 동작 원리

### 문제: shadcn/ui와 semantic-ui-react의 onChange 차이

**semantic-ui-react** (통일된 패턴):

```typescript
onChange={(e, { value }) => setValue(value)}
```

**shadcn/ui** (컴포넌트별 다른 패턴):

- `Input`: `onChange={(e) => setValue(e.target.value)}`
- `Select`: `onValueChange={(value) => setValue(value)}`
- `Checkbox`: `onCheckedChange={(checked) => setChecked(checked)}`

### 해결: 모든 핸들러를 동시에 제공

`register()`가 반환하는 객체는 **모든 핸들러를 포함**합니다:

```typescript
{
  name: "field",
  value: "...",
  checked: true/false,
  onChange: (e, data?) => { /* 범용 핸들러 */ },
  onValueChange: (value) => { /* Select용 */ },
  onCheckedChange: (checked) => { /* Checkbox용 */ },
}
```

이를 `{...register("field")}`로 스프레드하면:

- `Input`은 `onChange`만 사용
- `Select`는 `onValueChange`만 사용
- `Checkbox`는 `onCheckedChange`만 사용

각 컴포넌트가 자신에게 필요한 핸들러만 선택적으로 사용하게 됩니다! 🎉

---

## 💡 사용 팁

### 1. 간단한 사용법

```typescript
// ✅ 이렇게 간단하게 사용하세요
<Input {...register("keyword")} />
<Select {...register("orderBy")}>...</Select>
<Checkbox {...register("isActive")} />

// ❌ 복잡하게 사용할 필요 없음
<Input
  value={register("keyword").value}
  onChange={(e) => register("keyword").onChange(e, { value: e.target.value })}
/>
```

### 2. semantic-ui-react 호환

```typescript
// FeedSiteSearchInput 같은 커스텀 컴포넌트
<FeedSiteSearchInput
  input={register("keyword")}
  dropdown={register("search")}
/>

// 기본 semantic-ui-react 컴포넌트
<Dropdown {...register("category")} options={options} />
```

### 3. URL 파라미터 자동 연동

```typescript
const { listParams } = useListParams(Schema, defaultValue);

// URL: /admin/feed-sites?keyword=test&search=title
console.log(listParams.keyword); // "test"
console.log(listParams.search); // "title"

// register로 Input을 변경하면 URL도 자동으로 업데이트됨
<Input {...register("keyword")} />;
```

### 4. 직접 값 업데이트

```typescript
const { listParams, updateParams } = useListParams(Schema, defaultValue);

// 페이지네이션 등에서 직접 업데이트
updateParams({ page: 2 });

// 또는
setListParams({ ...listParams, page: 2 });
```

---

## 🎯 실전 예제

### 완전한 Feed Sites 리스트 페이지

`src/pages/admin/feed-sites/index-ui.tsx` 참고

```typescript
import { useListParams } from "@sonamu-kit/react-componentslib";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Input,
} from "@sonamu-kit/react-components/components";
import { FeedSiteService } from "src/services/feed-site/feed-site.service";
import { FeedSiteListParams } from "src/services/feed-site/feed-site.types";

function FeedSiteList() {
  // 리스트 파라미터 관리
  const { listParams, register } = useListParams(FeedSiteListParams, {
    num: 10,
    page: 1,
    orderBy: "id-desc",
    search: "id",
    keyword: "",
  });

  // API 호출 (listParams가 변경되면 자동으로 재호출)
  const { data, mutate, isLoading } = FeedSiteService.useFeedSites(
    "A",
    listParams
  );
  const { rows, total } = data ?? {};

  return (
    <div>
      {/* 필터 영역 */}
      <div className="filters">
        <Select {...register("search")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="id">Search ID</SelectItem>
            <SelectItem value="title">Search Name</SelectItem>
          </SelectContent>
        </Select>

        <Input {...register("keyword")} placeholder="Search..." />

        <Select {...register("orderBy")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="id-desc">Recently</SelectItem>
            <SelectItem value="id-asc">Oldest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 테이블 */}
      <Table>
        <TableBody>
          {rows?.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.title}</TableCell>
              <TableCell>{row.list_url}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* 페이지네이션 */}
      <Pagination
        {...register("page")}
        totalPages={Math.ceil(total / listParams.num)}
      />
    </div>
  );
}
```

---

## 📚 더 알아보기

- [shadcn/ui 공식 문서](https://ui.shadcn.com)
- [MIGRATION_PLAN.md](./MIGRATION_PLAN.md) - 전체 마이그레이션 계획
- [COMPONENTS_LIST.md](./COMPONENTS_LIST.md) - 사용 가능한 컴포넌트 목록
- `src/pages/admin/feed-sites/index-ui.tsx` - 실제 구현 예제 (shadcn/ui)
- `src/pages/admin/feed-sites/index.tsx` - 실제 구현 예제 (semantic-ui-react)
