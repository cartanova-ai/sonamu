# Puri 쿼리 빌더 - 입체적 Select 구조 및 Nullability 추론 시스템

## 1. 프로젝트 개요

### 1.1 Sonamu란?
Sonamu는 TypeScript 기반의 풀스택 프레임워크로, Entity 정의로부터 타입, API, 쿼리를 자동 생성합니다.

### 1.2 Puri란?
Puri는 Sonamu의 TypeScript-safe 쿼리 빌더로, Knex를 래핑하여 타입 안전한 SQL 쿼리를 작성할 수 있게 해줍니다.

### 1.3 핵심 파일 위치
```
sonamu/
├── modules/sonamu/src/
│   ├── database/
│   │   ├── puri.ts              # Puri 클래스 (쿼리 빌더 구현)
│   │   ├── puri.types.ts        # Puri 타입 정의 (타입 추론 로직)
│   │   └── base-model.ts        # BaseModel (hydrate 함수 포함)
│   ├── entity/
│   │   └── entity.ts            # Entity 클래스 (코드 생성 로직)
│   └── types/
│       └── types.ts             # SubsetQuery 등 공통 타입
└── examples/miomock/api/src/
    └── application/
        ├── sonamu.generated.sso.ts  # 생성된 Subset Query 파일
        ├── sonamu.generated.ts      # 생성된 타입 파일
        └── [entity]/
            ├── [entity].entity.json # Entity 정의
            └── [entity].model.ts    # 모델 구현
```

---

## 2. 해결하려던 문제

### 2.1 원래 상황 (Flat 구조)

기존에는 select 시 JOIN된 테이블의 컬럼을 `__`(더블 언더스코어)로 구분하여 flat하게 가져왔습니다:

```typescript
// 기존 생성 코드 (sonamu.generated.sso.ts)
.select({
  id: "departments.id",
  name: "departments.name",
  parent__id: "parent.id",      // flat 구조
  parent__name: "parent.name",  // flat 구조
})
```

### 2.2 문제점

#### 문제 1: 타입 추론의 혼란
```typescript
// SQL 결과 (flat)
{ id: 1, name: "개발팀", parent__id: null, parent__name: null }

// hydrate 후 (nested)
{ id: 1, name: "개발팀", parent: { id: null, name: null } }
// ↑ 문제: parent 객체가 존재하지만 내부 필드들이 null

// 원하는 결과
{ id: 1, name: "개발팀", parent: null }
// ↑ parent 자체가 null이어야 함
```

#### 문제 2: Nullable 필드와의 구분 불가
```typescript
// employee.salary는 스키마상 nullable
{ employee__id: 1, employee__salary: null }

// 이게 "employee가 없어서 null"인지 "employee는 있는데 salary가 null"인지 구분 불가
```

#### 문제 3: 타입 표현의 부정확
```typescript
// 기존 타입 (부정확)
type Result = {
  parent__id: number | null;
  parent__name: string | null;
}

// 원하는 타입 (정확)
type Result = {
  parent: {
    id: number;
    name: string;
  } | null;  // 객체 단위로 nullable
}
```

### 2.3 왜 이런 문제가 생기는가: Hydrate 타입의 한계

#### Hydrate의 역할
`Hydrate<T>` 타입은 flat한 결과를 nested 객체로 변환합니다:
```typescript
// 입력
{ parent__id: number | null; parent__name: string | null }

// Hydrate 적용 후
{ parent: { id: number | null; name: string | null } | null }
```

#### 핵심 한계: Join 정보 부재
`Hydrate`은 **키 패턴(`__`)만 보고 그룹핑**합니다. Join 정보(TTables)가 없어서:

```typescript
// Hydrate이 아는 것
"parent__id" → "parent" 그룹의 "id" 필드

// Hydrate이 모르는 것
- parent가 leftJoin인지 innerJoin인지
- id 필드가 스키마상 nullable인지, leftJoin 때문에 nullable인지
```

#### 결과: 필드 단위 nullability 유지
```typescript
// flat 구조에서 leftJoin 시 타입 추론
parent__id: number | null    // leftJoin이라서 | null 추가됨
parent__name: string | null  // leftJoin이라서 | null 추가됨

// Hydrate은 이 타입을 그대로 그룹핑만 함
parent: {
  id: number | null;    // ❌ 스키마상 non-null인데 nullable로 유지
  name: string | null;  // ❌ 스키마상 non-null인데 nullable로 유지
} | null;
```

#### ParseSelectObject가 해결할 수 있는 이유
`ParseSelectObject`는 `TTables` 타입 파라미터를 통해 Join 정보를 알고 있습니다:

```typescript
// ParseSelectObject가 아는 것
TTables = {
  departments: { id: number; name: string; ... },
  parent: { id: number; name: string; ... } & LeftJoinedMarker,  // ← Join 정보!
}

// 따라서 정확한 타입 추론 가능
parent: {
  id: number;     // ✅ 스키마 원본 타입
  name: string;   // ✅ 스키마 원본 타입
} | null;         // ✅ leftJoin이라서 객체만 nullable
```

---

## 3. 해결 방안: 입체적 Select 구조

### 3.1 새로운 Select 구조

```typescript
// 새로운 생성 코드 (sonamu.generated.sso.ts)
.select({
  id: "departments.id",
  name: "departments.name",
  parent: {                    // 입체적 구조
    id: "parent.id",
    name: "parent.name",
  },
})
```

### 3.2 작동 원리

1. **코드 생성 시**: Entity 정의로부터 입체적 select 객체 생성
2. **Puri 내부**: 입체적 객체를 flat하게 변환하여 Knex에 전달
3. **SQL 실행**: flat한 결과 반환
4. **hydrate**: flat 결과를 다시 입체적 객체로 변환
5. **타입 추론**: 입체적 구조를 기반으로 정확한 타입 추론

---

## 4. 구현 세부사항

### 4.1 LeftJoinedMarker vs InheritedLeftJoinedMarker

#### 개념
```
employees (메인 테이블)
    └─ leftJoin → department (nullable, LeftJoinedMarker)
                      └─ leftJoin → company (non-nullable, InheritedLeftJoinedMarker)
```

- **LeftJoinedMarker**: 자체적으로 nullable한 관계 (relation.nullable === true)
- **InheritedLeftJoinedMarker**: 부모가 leftJoin이라서 따라서 leftJoin이지만, 관계 자체는 non-nullable

#### 예시
```typescript
// department는 nullable (LeftJoinedMarker)
// → department: { ... } | null

// department.company는 department가 있으면 반드시 존재 (InheritedLeftJoinedMarker)
// → company: { ... } (null 아님)

// 최종 타입
{
  department: {
    id: number;
    name: string;
    company: {        // null 아님!
      name: string;
    };
  } | null;           // department 전체가 null일 수 있음
}
```

### 4.2 타입 정의 (puri.types.ts)

```typescript
// Internal Type Keys
type LeftJoinedKey = "__leftJoined__";
type InheritedLeftJoinedKey = "__inheritedLeftJoined__";
type InternalTypeKeys = FulltextKey | VirtualKey | LeftJoinedKey | InheritedLeftJoinedKey;

// Markers
export type LeftJoinedMarker = { [K in LeftJoinedKey]: true };
export type InheritedLeftJoinedMarker = { [K in InheritedLeftJoinedKey]: true };

// leftJoin 판별 (자체 nullable만 true, inherited는 false)
type IsLeftJoinedTable<TTables, TableKey> = TableKey extends keyof TTables
  ? TTables[TableKey] extends LeftJoinedMarker
    ? TTables[TableKey] extends InheritedLeftJoinedMarker
      ? false  // Inherited는 자체 nullable 아님
      : true   // 자체 nullable
    : false
  : false;

// 경로 조합 헬퍼
type JoinPath<Prefix extends string, Key extends string> = 
  Prefix extends "" ? Key : `${Prefix}__${Key}`;

// 메인 파싱 타입
export type ParseSelectObject<TTables, TSelect> = 
  ParseSelectObjectWithPath<TTables, TSelect, "">;

// 경로를 추적하며 재귀적으로 파싱
type ParseSelectObjectWithPath<TTables, TSelect, Prefix extends string> = Expand<{
  [K in keyof TSelect]: TSelect[K] extends SqlExpression<infer R>
    ? /* SqlExpression 처리 */
    : IsNestedObject<TSelect[K]> extends true
      ? TSelect[K] extends NestedSelectObject<TTables>
        ? IsLeftJoinedTable<TTables, JoinPath<Prefix, K & string>> extends true
          ? Expand<ParseSelectObjectInner<...>> | null  // 자체 leftJoin → nullable 객체
          : Expand<ParseSelectObjectInner<...>>         // inner 또는 inherited → non-null 객체
        : never
      : ExtractColumnType<TTables, TSelect[K] & string>;
}>;

// 중첩 객체 내부 파싱 (ExtractColumnTypeRaw 사용)
type ParseSelectObjectInner<TTables, TSelect, Prefix extends string> = Expand<{
  [K in keyof TSelect]: /* ... */
    : ExtractColumnTypeRaw<TTables, TSelect[K] & string>;  // leftJoin nullability 무시
}>;

// 컬럼 타입 추출 (leftJoin nullability 적용)
export type ExtractColumnType<TTables, Path extends string> = 
  /* ... TTables[Alias] extends LeftJoinedMarker이고 InheritedLeftJoinedMarker가 아니면 | null 추가 */;

// 컬럼 타입 추출 (leftJoin nullability 무시 - 내부 필드용)
type ExtractColumnTypeRaw<TTables, Path extends string> = 
  /* ... 항상 원본 타입 반환 */;
```

### 4.3 Puri 클래스 수정 (puri.ts)

```typescript
class Puri<TSchema, TTables, TResult> {
  private _nestedKeys: Set<string> = new Set();  // 중첩 객체 키 저장

  // select 메서드
  select<TSelect extends SelectObject<TTables>>(
    selectObj: TSelect,
  ): Puri<TSchema, TTables, ParseSelectObject<TTables, TSelect>> {
    const { flatSelect, nestedKeys } = this.flattenSelect(selectObj);
    this._nestedKeys = nestedKeys;
    // flatSelect를 Knex에 전달
  }

  // 입체적 객체를 flat하게 변환
  private flattenSelect(
    selectObj: Record<string, any>,
    prefix = "",
  ): { flatSelect: Record<string, any>; nestedKeys: Set<string> } {
    const flatSelect: Record<string, any> = {};
    const nestedKeys = new Set<string>();

    for (const [key, value] of Object.entries(selectObj)) {
      const fullKey = prefix ? `${prefix}__${key}` : key;

      if (typeof value === "object" && !("_type" in value)) {
        // 중첩 객체
        if (!prefix) nestedKeys.add(key);  // 최상위 중첩 키만 저장
        const nested = this.flattenSelect(value, fullKey);
        Object.assign(flatSelect, nested.flatSelect);
        nested.nestedKeys.forEach((k) => nestedKeys.add(k));
      } else {
        flatSelect[fullKey] = value;
      }
    }

    return { flatSelect, nestedKeys };
  }

  // inheritedLeftJoin 메서드 추가
  inheritedLeftJoin<TJoinTable extends keyof TSchema, TJoinAlias extends string>(
    tableSpec: { [K in TJoinAlias]: TJoinTable },
    left: AvailableColumns<TTables>,
    right: `${TJoinAlias}.${ColumnKeys<TSchema[TJoinTable]>}`,
  ): Puri<
    TSchema,
    TTables & Record<TJoinAlias, TSchema[TJoinTable] & InheritedLeftJoinedMarker>,
    TResult
  > {
    return this.__commonJoin("leftJoin", tableSpec, left, right);
  }
}
```

### 4.4 코드 생성 로직 (entity.ts)

#### SubsetQuery에 inherited 플래그 추가 (types.ts)
```typescript
export type SubsetQuery = {
  select: string[];
  virtual: string[];
  joins: ({
    as: string;
    join: "inner" | "outer";
    table: string;
    inherited?: boolean;  // 부모가 leftJoin이라서 따라서 leftJoin
  } & JoinClause)[];
  loaders: /* ... */;
};
```

#### resolveSubsetQuery에서 inherited 판별
```typescript
// entity.ts - resolveSubsetQuery 내부
const isInherited = isAlreadyOuterJoined && !relation.nullable;
r.joins.push({
  as: joinAs,
  join: innerOrOuter,
  table: relEntity.table,
  ...(isInherited && { inherited: true }),
  ...joinClause,
});
```

#### getPuriSubsetQuery에서 joinMethod 결정
```typescript
// entity.ts - getPuriSubsetQuery 내부
for (const join of subsetQuery.joins) {
  const joinMethod =
    join.join === "inner"
      ? "join"
      : join.inherited === true
        ? "inheritedLeftJoin"
        : "leftJoin";
  lines.push(`.${joinMethod}({ ${join.as}: "${join.table}" }, "${join.from}", "${join.to}")`);
}
```

#### buildNestedSelectObject - flat select를 입체적으로 변환
```typescript
private buildNestedSelectObject(
  selectItems: string[],
): Record<string, string | Record<string, any>> {
  const result: Record<string, any> = {};

  for (const selectItem of selectItems) {
    // "users.id" 또는 "parent.id as parent__id" 형태 파싱
    const match = selectItem.match(/^(.+?)(?: as (.+))?$/);
    if (!match) continue;

    const [, column, alias] = match;
    const columnValue = `"${column.trim()}"`;

    if (!alias || !alias.includes("__")) {
      // 최상위 필드
      const key = alias ?? column.split(".").pop();
      result[key] = columnValue;
    } else {
      // 입체 구조로 그룹화
      const parts = alias.split("__");
      let current = result;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current)) current[part] = {};
        current = current[part];
      }

      const lastPart = parts[parts.length - 1];
      current[lastPart] = columnValue;
    }
  }

  return result;
}
```

### 4.5 Hydrate 로직 (base-model.ts)

```typescript
hydrate<T extends UnknownDBRecord>(rows: T[]): T[] {
  return rows.map((row: T) => {
    // __로 그룹핑
    const groups = this.groupByPrefix(Object.keys(row));

    // null 객체 판별
    const nullKeys = Object.entries(groups)
      .filter(([groupKey, fields]) => {
        // id 필드가 있으면 그것으로 판별
        const idField = `${groupKey}__id`;
        if (idField in row) {
          return row[idField] === null;
        }
        // fallback: 모든 필드가 null이면 객체도 null
        return fields.every((field) => row[field] === null);
      })
      .map(([key]) => key);

    // flat → nested 변환
    // ...
  });
}
```

---

## 5. 생성되는 코드 예시

### 5.1 SubsetQuery (sonamu.generated.sso.ts)

```typescript
export const employeeSubsetQueries = {
  A: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => {
    return qbWrapper
      .from("employees")
      .join({ user: "users" }, "employees.user_id", "user.id")
      .leftJoin({ department: "departments" }, "employees.department_id", "department.id")
      .inheritedLeftJoin(
        { department__company: "companies" },
        "department.company_id",
        "department__company.id",
      )
      .select({
        id: "employees.id",
        created_at: "employees.created_at",
        employee_number: "employees.employee_number",
        salary: "employees.salary",
        user: {
          id: "user.id",
          username: "user.username",
        },
        department: {
          id: "department.id",
          name: "department.name",
          company: {
            name: "department__company.name",
          },
        },
      });
  },
};
```

### 5.2 LoaderQuery (sonamu.generated.sso.ts)

```typescript
export const departmentLoaderQueries = {
  A: [
    {
      as: "employees",
      refId: "id",
      qb: (qbWrapper: PuriWrapper<DatabaseSchemaExtend>, fromIds: number[]) => {
        return qbWrapper
          .from("employees")
          .join({ user: "users" }, "employees.user_id", "user.id")
          .whereIn("employees.department_id", fromIds)
          .select({
            id: "employees.id",
            employee_number: "employees.employee_number",
            salary: "employees.salary",
            user: {
              id: "user.id",
              email: "user.email",
            },
            refId: "employees.department_id",
          });
      },
    },
  ],
};
```

### 5.3 추론되는 타입

```typescript
// row에 마우스를 올리면 표시되는 타입
(parameter) row: {
  id: number;
  created_at: Date;
  employee_number: string;
  salary: string | null;  // 스키마상 nullable
  user: {
    id: number;
    username: string;
  };  // innerJoin → non-null
  department: {
    id: number;
    name: string;
    company: {
      name: string;
    };  // inheritedLeftJoin → non-null (부모가 null이면 여기 접근 자체가 안됨)
  } | null;  // leftJoin → nullable
}
```

---

## 6. appendSelect 동작

### 6.1 기본 동작
```typescript
appendSelect<TSelect extends SelectObject<TTables>>(
  selectObj: TSelect,
): Puri<TSchema, TTables, TResult & ParseSelectObject<TTables, TSelect>>
```

TypeScript intersection(`&`)을 사용하여 기존 타입과 새 타입을 합칩니다.

### 6.2 객체 머징
```typescript
// 단순 케이스: 동작함
qb.select({ user: { id: "user.id" } })
  .appendSelect({ name: "users.name" });
// Result: { user: { id: number }, name: string }

// 같은 객체 확장: 주의 필요
qb.select({ user: { id: "user.id" } })
  .appendSelect({ user: { name: "user.name" } });
// Result: { user: { id: number } & { name: string } }
// = { user: { id: number; name: string } }  // 동작함
```

### 6.3 주의사항
- nullability가 다른 경우 타입이 복잡해질 수 있음
- 가능하면 한 번에 select 정의 권장

---

## 7. 알려진 제한사항

### 7.1 SQL 레벨의 근본적 한계: NULL 구분 불가

**핵심 문제**: SQL 결과만으로는 "leftJoin miss"와 "필드가 NULL"을 구분할 수 없습니다.

```sql
SELECT 
  e.id,
  d.name AS department__name
FROM employees e
LEFT JOIN departments d ON e.department_id = d.id
```

| 상황 | SQL 결과 |
|------|----------|
| department 없음 (leftJoin miss) | `department__name: NULL` |
| department 있음, name이 NULL | `department__name: NULL` |

**→ 둘 다 똑같이 `NULL`이라서 구분 불가!**

#### 문제 발생 케이스

```typescript
// select에 id 없이 nullable 필드만 포함
.select({
  department: {
    name: "department.name",  // name이 nullable 컬럼이라면?
  },
})

// DB 상태: department 존재, name이 NULL
// SQL 결과: { department__name: null }

// hydrate 결과 (잘못됨!)
{ department: null }  // ❌ 객체 자체가 null로 판별

// 실제 올바른 결과
{ department: { name: null } }  // ✅ 객체 존재, name만 null
```

#### 타입-런타임 불일치

| | 타입 (ParseSelectObject) | 런타임 (hydrate) |
|---|---|---|
| department 있고 name이 null | `{ name: null }` | `null` |

```typescript
// 타입은 이렇게 접근 가능하다고 함
if (row.department) {
  console.log(row.department.name);  // string | null
}

// 런타임에서는 department가 null이라서 if문 통과 못함
```

### 7.2 해결책: 중첩 객체에 id 필드 필수

**구분하려면 PK 또는 FK를 select에 포함해야 합니다:**

```typescript
// ✅ 권장: id 필드 포함
.select({
  department: {
    id: "department.id",     // 이걸로 존재 여부 판별!
    name: "department.name",
  },
})
```

| 상황 | department__id | department__name | hydrate 결과 |
|------|----------------|------------------|-------------|
| department 없음 | `NULL` | `NULL` | `{ department: null }` ✅ |
| department 있음, name이 NULL | `100` | `NULL` | `{ department: { id: 100, name: null } }` ✅ |

```typescript
// ❌ 비권장: id 없이
.select({
  department: {
    name: "department.name",  // 모든 필드가 null이면 객체가 null로 잘못 판별됨
  },
})
```

### 7.3 hydrate의 null 판별 로직

```typescript
// base-model.ts - hydrate 내부
const idField = `${groupKey}__id`;
if (idField in row) {
  // id 필드가 있으면 → id가 null인지로 판별 (정확함)
  return row[idField] === null;
}

// id 필드가 없으면 → 모든 필드가 null인지로 판별 (부정확할 수 있음!)
return fields.every((field) => row[field] === null);
```

### 7.4 깊은 중첩에서의 hydrate

현재 hydrate는 `__`로 1단계 그룹핑만 수행. 더 깊은 중첩은 자동으로 처리되지만, 객체 경계 판별이 제한적일 수 있음.

### 7.5 수동 쿼리 작성 시 주의사항

수동으로 쿼리 작성할 때 `leftJoin` vs `inheritedLeftJoin` 선택:

| 상황 | 추천 |
|------|------|
| 잘 모르겠다 | `leftJoin` 사용 (안전함, 타입만 더 엄격) |
| 부모가 leftJoin + 관계가 확실히 non-null | `inheritedLeftJoin` 사용 |

**잘못 사용했을 때:**

| 잘못 사용 | 결과 |
|----------|------|
| nullable 관계에 `inheritedLeftJoin` | 💥 **위험** - 런타임 에러 가능 |
| non-null 관계에 `leftJoin` | 🟡 **안전** - 불필요한 null 체크만 강제됨 |

---

## 8. 테스트 및 검증

### 8.1 빌드
```bash
cd modules/sonamu && npm run build
```

### 8.2 코드 생성
```bash
cd examples/miomock/api && npx sonamu sync
```

### 8.3 타입 체크
```bash
cd examples/miomock/api && npx tsc --noEmit
```

### 8.4 테스트 스냅샷 업데이트
```bash
cd examples/miomock/api && npx vitest run src/sonamu-test/syncer.test.ts -u
```

---

## 9. 향후 개선 가능 사항

1. **DeepMerge 타입**: appendSelect에서 더 정교한 타입 머징
2. **hydrate 고도화**: 더 깊은 중첩에서도 정확한 null 판별
3. **IDE 표시 최적화**: Expand 타입으로 더 깔끔한 타입 표시

---

## 10. 관련 커밋/변경 파일

- `modules/sonamu/src/database/puri.types.ts` - 타입 추론 로직
- `modules/sonamu/src/database/puri.ts` - Puri 클래스 (flattenSelect, inheritedLeftJoin)
- `modules/sonamu/src/database/base-model.ts` - hydrate 로직
- `modules/sonamu/src/entity/entity.ts` - 코드 생성 (getPuriSubsetQuery, getPuriLoaderQuery, buildNestedSelectObject)
- `modules/sonamu/src/types/types.ts` - SubsetQuery 타입 (inherited 플래그)
