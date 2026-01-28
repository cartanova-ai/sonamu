---
name: sonamu-upsert
description: Sonamu UpsertBuilder로 복잡한 관계 데이터 저장. ubRegister, ubUpsert, insertOnly, updateBatch 패턴, FK 순서, cleanOrphans. Use when saving related data with foreign key dependencies.
---

# UpsertBuilder

## UBRef 타입

`ubRegister()`가 반환하는 참조 객체:

```typescript
type UBRef = {
  uuid: string;   // 고유 식별자
  of: string;     // 테이블명
  use?: string;   // 참조할 필드 (기본값: "id")
};
```

## 기본 패턴

```typescript
const wdb = this.getPuri("w");

// 데이터 등록 (UBRef 반환)
const userRef = wdb.ubRegister("users", { email: "john@test.com", username: "john" });

// 관계 데이터에 UBRef 사용
wdb.ubRegister("employees", { user_id: userRef, department_id: deptId });

// 트랜잭션 내에서 순서대로 저장
return wdb.transaction(async (trx) => {
  await trx.ubUpsert("users");       // 먼저 저장 (FK 참조됨)
  return trx.ubUpsert("employees");  // 나중에 저장 (FK 사용)
});
```

## 저장 순서 (중요!)

FK가 참조하는 테이블을 먼저 저장:

```typescript
await trx.ubUpsert("companies");   // 1. 의존성 없음
await trx.ubUpsert("departments"); // 2. company_id 필요
await trx.ubUpsert("users");       // 3. 의존성 없음
await trx.ubUpsert("employees");   // 4. user_id, department_id 필요
```

## Model save 패턴

```typescript
@api({ httpMethod: "POST" })
async save(spa: UserSaveParams[]): Promise<number[]> {
  const wdb = this.getPuri("w");
  spa.forEach((sp) => wdb.ubRegister("users", sp));

  return wdb.transaction(async (trx) => {
    return trx.ubUpsert("users");
  });
}
```

## 관계 데이터 저장

```typescript
await this.getPuri("w").transaction(async (trx) => {
  // User 등록
  const userRef = trx.ubRegister("users", {
    email: data.email,
    username: data.username,
    password: bcrypt.hashSync(data.password, 10),
  });

  // Employee 등록 (userRef 사용)
  trx.ubRegister("employees", {
    user_id: userRef,
    department_id: data.departmentId,
    salary: data.salary,
  });

  // 순서대로 저장
  await trx.ubUpsert("users");
  const [employeeId] = await trx.ubUpsert("employees");
  return employeeId;
});
```

## Upsert (Insert or Update)

```typescript
// id 없으면 INSERT
wdb.ubRegister("users", { email: "new@test.com", username: "new" });

// id 있으면 UPDATE
wdb.ubRegister("users", { id: 1, email: "updated@test.com" });
```

**충돌 처리**: Entity의 unique index가 있으면 자동으로 사전 조회하여 기존 레코드의 id를 채운 후 UPDATE 수행

## ManyToMany 관계

```typescript
await wdb.transaction(async (trx) => {
  const projectRef = trx.ubRegister("projects", { name: "Project A" });

  for (const empId of employeeIds) {
    trx.ubRegister("projects__employees", {
      project_id: projectRef,
      employee_id: empId,
    });
  }

  await trx.ubUpsert("projects");
  await trx.ubUpsert("projects__employees");
});
```

## 자기 참조 (Self-Reference)

계층 구조(예: 카테고리, 조직도)에서 자기 참조 관계는 자동으로 레벨별 순차 처리:

```typescript
await wdb.transaction(async (trx) => {
  // 루트 카테고리
  const rootRef = trx.ubRegister("categories", { name: "Root", parent_id: null });
  
  // 자식 카테고리 (rootRef 참조)
  const childRef = trx.ubRegister("categories", { name: "Child", parent_id: rootRef });
  
  // 손자 카테고리 (childRef 참조)
  trx.ubRegister("categories", { name: "Grandchild", parent_id: childRef });

  // 내부적으로 레벨별 순차 처리 (Root → Child → Grandchild)
  await trx.ubUpsert("categories");
});
```

## insertOnly (INSERT 전용)

UPDATE 없이 INSERT만 수행:

```typescript
await trx.insertOnly("logs", { chunkSize: 1000 });
```

## updateBatch (배치 업데이트)

대량 UPDATE 작업:

```typescript
// 여러 레코드 등록
wdb.ubRegister("users", { id: 1, status: "active" });
wdb.ubRegister("users", { id: 2, status: "active" });
wdb.ubRegister("users", { id: 3, status: "inactive" });

await wdb.transaction(async (trx) => {
  await trx.updateBatch("users", {
    chunkSize: 500,      // 배치 크기 (기본값: 500)
    where: "id",         // WHERE 조건 컬럼 (기본값: "id")
  });
});

// 복합 키로 WHERE 조건
await trx.updateBatch("user_settings", {
  where: ["user_id", "setting_key"],
});
```

## UpsertOptions

`ubUpsert()`의 옵션:

```typescript
type UpsertOptions = {
  chunkSize?: number;      // 배치 크기
  cleanOrphans?: string | string[];  // 고아 레코드 삭제 기준 FK 컬럼
  inherit?: string[];      // UPDATE 시 기존 값 유지할 컬럼
};
```

### chunkSize

대량 데이터 처리 시 배치 크기 지정:

```typescript
await trx.ubUpsert("logs", { chunkSize: 1000 });
```

### cleanOrphans

FK 기준으로 고아 레코드 자동 삭제:

```typescript
// 단일 FK
await trx.ubUpsert("order_items", {
  cleanOrphans: "order_id",  // order_id가 같고 이번에 upsert 안 된 레코드 삭제
});

// 복합 FK
await trx.ubUpsert("project_members", {
  cleanOrphans: ["project_id", "team_id"],
});
```

### inherit

UPDATE 시 특정 컬럼은 기존 값 유지:

```typescript
await trx.ubUpsert("users", {
  inherit: ["created_at", "password"],  // 이 컬럼들은 UPDATE에서 제외
});
```

## Rules

- MUST use inside `transaction()`
- MUST call `ubUpsert()` for FK-referenced tables first (correct order)
- UBRef can ONLY be used inside `ubRegister` (not for direct DB queries)
- Self-reference is auto-handled by level-based insertion
- Unique index conflicts are auto-resolved by pre-fetching existing IDs
