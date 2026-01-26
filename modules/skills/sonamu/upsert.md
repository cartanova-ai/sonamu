---
name: sonamu-upsert
description: Sonamu UpsertBuilder로 복잡한 관계 데이터 저장. ubRegister, ubUpsert 패턴, FK 순서. Use when saving related data with foreign key dependencies.
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

## onConflict (Upsert 충돌 처리)

`ubUpsert()`의 두 번째 인자로 onConflict 옵션 전달:

```typescript
await trx.ubUpsert("users", {
  onConflict: {
    columns: ["email"],           // 충돌 감지 컬럼
    update: ["username", "role"], // 충돌 시 업데이트할 컬럼
  },
});
```

**주의**: `ubRegister()`에는 onConflict 옵션을 전달할 수 없음

## Rules

- MUST use inside `transaction()`
- MUST call `ubUpsert()` for FK-referenced tables first (correct order)
- UBRef can ONLY be used inside `ubRegister` (not for direct DB queries)
- onConflict option is ONLY available in `ubUpsert()`, not in `ubRegister()`
