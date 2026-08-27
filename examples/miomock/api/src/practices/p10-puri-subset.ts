import { Sonamu } from "sonamu";
import { type DatabaseSchemaExtend, type Puri } from "sonamu";

import {
  type CompanyBaseSchema,
  type DepartmentBaseSchema,
  type EmployeeBaseSchema,
  type UserBaseSchema,
  type UserSubsetKey,
} from "../application/sonamu.generated";
// 사용 예제
async function examples() {
  await Sonamu.init(true, false);

  //

  const mixins = [
    builder(["P"], (qb) => {
      // qb type: UserSubsetPuriTypes["P"] = { users, employee, employee__department }
      // ✅ OK: employee table available
      qb.where("employee.salary", ">", "50000");
      // ✅ OK: employee__department table available
      qb.where("employee__department.name", "=", "test");
      return qb;
    }),
    builder(["A", "P"], (qb) => {
      // qb type: Puri<..., { users }, ...> (intersection = { users })
      // ✅ OK: users table available
      qb.where("users.role", "=", "admin");
      // ✅ OK: companies table available
      qb.where("companies.name", "=", "test");
      // ❌ Type Error: employee table NOT available (only in P, not in A)
      // qb.where("employee.salary", ">", "50000");
      return qb;
    }),

    builder(["A", "SS"], (qb) => {
      // qb type: Puri<..., { users }, ...> (intersection = { users })
      qb.where("users.is_verified", true);
      // ❌ Type Error: employee table NOT available (only in P, not in A or SS)
      // qb.where("employee.salary", ">", "50000");
      return qb;
    }),
  ];

  // 이 예제는 믹스인별 쿼리 타입 추론만 검증하며 실제 쿼리를 실행하지 않습니다.
  console.log("Validated " + mixins.length + " subset mixin types");
}

examples().finally(async () => {
  await Sonamu.destroy();
});

// Puri Types for User Subsets
export type UserSubsetPuriTypes = {
  A: Puri<DatabaseSchemaExtend, { users: UserBaseSchema; companies: CompanyBaseSchema }, never>;
  P: Puri<
    DatabaseSchemaExtend,
    {
      users: UserBaseSchema;
      employee: EmployeeBaseSchema;
      employee__department: DepartmentBaseSchema;
      companies: CompanyBaseSchema;
    },
    never
  >;
  SS: Puri<DatabaseSchemaExtend, { users: UserBaseSchema }, never>;
};

// Puri 타입에서 각 제네릭 파라미터 추출
type PuriTables<Query> =
  Query extends Puri<infer _Schema, infer Tables, infer _Result> ? Tables : never;

// 두 테이블 타입의 교집합 (공통 키만 추출)
type IntersectTables<A, B> = Pick<A, Extract<keyof A, keyof B>>;

// 두 Puri의 교집합
type IntersectPuri<A, B> = Puri<
  DatabaseSchemaExtend,
  IntersectTables<PuriTables<A>, PuriTables<B>>, // TTables key 교집합
  never
>;

// 여러 Puri의 교집합 (재귀적으로 처리)
type IntersectPuriMany<Arr extends readonly UserSubsetPuriTypes[UserSubsetKey][]> = Arr extends [
  infer Head extends UserSubsetPuriTypes[UserSubsetKey],
  ...infer Tail extends readonly UserSubsetPuriTypes[UserSubsetKey][],
]
  ? Tail extends []
    ? Head // 배열이 1개면 그대로 반환
    : IntersectPuri<Head, IntersectPuriMany<Tail>> // 재귀: Head ∩ (나머지의 교집합)
  : never;

// 서브셋 키 배열을 Puri 타입 배열로 변환
type MapSubsetKeysToPuris<Keys extends readonly UserSubsetKey[]> = {
  [I in keyof Keys]: Keys[I] extends UserSubsetKey ? UserSubsetPuriTypes[Keys[I]] : never;
};

// 서브셋 키 배열에서 교집합 Puri 타입 추론
export type InferIntersectionPuriType<TSubsets extends readonly UserSubsetKey[]> =
  IntersectPuriMany<MapSubsetKeysToPuris<TSubsets>>;

// Helper to infer Puri type from subset array (computes actual intersection)
function builder<T extends readonly UserSubsetKey[]>(
  subsets: [...T],
  callback: (qb: InferIntersectionPuriType<T>) => void,
) {
  return {
    applyTo: subsets,
    builder: callback,
  };
}
