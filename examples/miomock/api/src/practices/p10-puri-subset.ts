import { Sonamu, Puri, DatabaseSchemaExtend } from "sonamu";
import { UserModel } from "../application/user/user.model";
import {
  UserBaseSchema,
  CompanyBaseSchema,
  EmployeeBaseSchema,
  DepartmentBaseSchema,
  UserSubsetKey,
} from "../application/sonamu.generated";

// 사용 예제
async function examples() {
  await Sonamu.init(true, false);
  const db = UserModel.getPuri("r");

  //

  const subset = "P";

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

  if (subset === "P") {
    mixins.forEach((mixin) => {
      mixin.applyTo.forEach((subset) => {
        if (subset === "P") {
          mixin.builder(db);
        }
      });
    });
  }
}

examples().finally(async () => {
  await Sonamu.destroy();
});

// Puri Types for User Subsets
export type UserSubsetPuriTypes = {
  A: Puri<DatabaseSchemaExtend, { users: UserBaseSchema; companies: CompanyBaseSchema }, any>;
  P: Puri<
    DatabaseSchemaExtend,
    {
      users: UserBaseSchema;
      employee: EmployeeBaseSchema;
      employee__department: DepartmentBaseSchema;
      companies: CompanyBaseSchema;
    },
    any
  >;
  SS: Puri<DatabaseSchemaExtend, { users: UserBaseSchema }, any>;
};

// Puri 타입에서 각 제네릭 파라미터 추출
type PuriSchema<P> = P extends Puri<infer S, any, any> ? S : never;
type PuriTables<P> = P extends Puri<any, infer TTables, any> ? TTables : never;
type PuriResult<P> = P extends Puri<any, any, infer R> ? R : never;

// 두 테이블 타입의 교집합 (공통 키만 추출)
type IntersectTables<A, B> = Pick<A, Extract<keyof A, keyof B>>;

// 두 Puri의 교집합
type IntersectPuri<A extends Puri<any, any, any>, B extends Puri<any, any, any>> = Puri<
  PuriSchema<A>, // TSchema (같다고 가정)
  IntersectTables<PuriTables<A>, PuriTables<B>>, // TTables key 교집합
  PuriResult<A> // TResult (동일하다는 가정)
>;

// 여러 Puri의 교집합 (재귀적으로 처리)
type IntersectPuriMany<Arr extends readonly Puri<any, any, any>[]> = Arr extends [
  infer Head extends Puri<any, any, any>,
  ...infer Tail extends readonly Puri<any, any, any>[],
]
  ? Tail extends []
    ? Head // 배열이 1개면 그대로 반환
    : IntersectPuri<Head, IntersectPuriMany<Tail>> // 재귀: Head ∩ (나머지의 교집합)
  : never;

// 서브셋 키 배열을 Puri 타입 배열로 변환
type MapSubsetKeysToPuris<
  Keys extends readonly UserSubsetKey[],
  PuriTypes extends Record<UserSubsetKey, any> = UserSubsetPuriTypes,
> = {
  [I in keyof Keys]: Keys[I] extends UserSubsetKey ? PuriTypes[Keys[I]] : never;
};

// 서브셋 키 배열에서 교집합 Puri 타입 추론
export type InferIntersectionPuriType<TSubsets extends readonly UserSubsetKey[]> =
  IntersectPuriMany<MapSubsetKeysToPuris<TSubsets>>;

// Helper to infer Puri type from subset array (computes actual intersection)
function builder<T extends readonly UserSubsetKey[]>(
  subsets: [...T],
  callback: (qb: InferIntersectionPuriType<T>) => any,
): { applyTo: UserSubsetKey[]; builder: (qb: any) => any } {
  return {
    applyTo: [...subsets] as UserSubsetKey[],
    builder: callback,
  };
}
