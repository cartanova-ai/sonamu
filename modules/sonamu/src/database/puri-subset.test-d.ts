import { describe, expectTypeOf, it } from "vitest";

import { type DatabaseSchemaExtend } from "../types/types";
import { type Puri } from "./puri";
import { type Hydrate, type InferAllSubsets, type LoadersResult } from "./puri-subset.types";
import { type PuriWrapper } from "./puri-wrapper";

// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Puri Subset 타입 시스템에서 any를 허용함
type MockPuri<T> = Puri<DatabaseSchemaExtend, any, T>;

describe("Hydrate", () => {
  it("flat 객체를 그대로 유지한다 (__ 없는 경우)", () => {
    type Input = { id: number; name: string };
    type Result = Hydrate<Input>;

    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const result = {} as Result;
    expectTypeOf(result).toEqualTypeOf<Hydrate<Input>>();
  });

  it("단일 depth의 __ 키를 중첩 객체로 변환한다", () => {
    type Input = { id: number; user__name: string; user__email: string };
    type Result = Hydrate<Input>;

    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const result = {} as Result;
    expectTypeOf(result).toEqualTypeOf<{
      id: number;
      user: { name: string; email: string };
    }>();
  });

  it("다중 depth의 __ 키를 재귀적으로 중첩 객체로 변환한다", () => {
    type Input = {
      id: number;
      user__profile__bio: string;
      user__profile__avatar: string;
      user__name: string;
    };
    type Result = Hydrate<Input>;

    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const result = {} as Result;
    expectTypeOf(result).toEqualTypeOf<{
      id: number;
      user: {
        name: string;
        profile: { bio: string; avatar: string };
      };
    }>();
  });

  it("여러 관계를 동시에 처리한다", () => {
    type Input = {
      id: number;
      user__id: number;
      user__name: string;
      post__id: number;
      post__title: string;
    };
    type Result = Hydrate<Input>;

    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const result = {} as Result;
    expectTypeOf(result).toEqualTypeOf<{
      id: number;
      user: { id: number; name: string };
      post: { id: number; title: string };
    }>();
  });

  it("빈 객체를 처리한다", () => {
    type Input = {};
    type Result = Hydrate<Input>;

    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const result = {} as Result;
    expectTypeOf(result).toEqualTypeOf<{}>();
  });

  it("nullable 필드가 있는 중첩 객체를 처리한다", () => {
    type Input = {
      id: number;
      user__id: number | null;
      user__name: string | null;
    };
    type Result = Hydrate<Input>;

    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const result = {} as Result;
    expectTypeOf(result).toEqualTypeOf<{
      id: number;
      user: { id: number | null; name: string | null };
    }>();
  });

  it("동일한 prefix를 가진 여러 필드를 올바르게 그룹화한다", () => {
    type Input = {
      id: number;
      user__id: number;
      user__name: string;
      user_count: number;
    };
    type Result = Hydrate<Input>;

    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const result = {} as Result;
    expectTypeOf(result).toEqualTypeOf<{
      id: number;
      user: { id: number; name: string };
      user_count: number;
    }>();
  });
});

describe("LoadersResult", () => {
  it("단일 로더의 결과 타입을 생성한다", () => {
    type MockLoaderQb = (
      qbWrapper: PuriWrapper,
      fromIds: number[] | string[],
    ) => MockPuri<{ id: number; title: string; refId: number }>;

    type Loaders = [
      {
        as: "posts";
        refId: "id";
        qb: MockLoaderQb;
      },
    ];
    type Result = LoadersResult<Loaders>;

    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const result = {} as Result;
    expectTypeOf(result).toHaveProperty("posts");
    expectTypeOf(result).toEqualTypeOf<{ posts: { id: number; title: string }[] }>();
  });

  it("중첩 로더를 처리한다", () => {
    type CommentLoaderQb = (
      qbWrapper: PuriWrapper,
      fromIds: number[] | string[],
    ) => MockPuri<{ id: number; content: string; refId: number }>;

    type PostLoaderQb = (
      qbWrapper: PuriWrapper,
      fromIds: number[] | string[],
    ) => MockPuri<{ id: number; title: string; refId: number }>;

    type Loaders = [
      {
        as: "posts";
        refId: "id";
        qb: PostLoaderQb;
        loaders: [
          {
            as: "comments";
            refId: "id";
            qb: CommentLoaderQb;
          },
        ];
      },
    ];
    type Result = LoadersResult<Loaders>;

    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const result = {} as Result;
    expectTypeOf(result).toHaveProperty("posts");
    expectTypeOf(result).toEqualTypeOf<{
      posts: { id: number; title: string; comments: { id: number; content: string }[] }[];
    }>();
  });

  it("중첩 로더의 as 경로도 hydrate한다", () => {
    type IngredientLoaderQb = (
      qbWrapper: PuriWrapper,
      fromIds: number[] | string[],
    ) => MockPuri<{ id: number; name: string; refId: number }>;

    type PrescriptionItemLoaderQb = (
      qbWrapper: PuriWrapper,
      fromIds: number[] | string[],
    ) => MockPuri<{
      id: number;
      test__id: number;
      test__name: string;
      refId: number;
    }>;

    type Loaders = [
      {
        as: "items";
        refId: "id";
        qb: PrescriptionItemLoaderQb;
        loaders: [
          {
            as: "test__items";
            refId: "test__id";
            qb: IngredientLoaderQb;
          },
        ];
      },
    ];
    type Result = LoadersResult<Loaders>;

    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const result = {} as Result;
    expectTypeOf(result).toEqualTypeOf<{
      items: {
        id: number;
        test: {
          id: number;
          name: string;
          items: { id: number; name: string }[];
        };
      }[];
    }>();
  });

  it("여러 로더를 처리한다", () => {
    type ProjectLoader = {
      as: "projects";
      refId: "id";
      qb: (
        qbWrapper: PuriWrapper,
        fromIds: number[] | string[],
      ) => MockPuri<{ id: number; name: string; refId: number }>;
    };
    type DepartmentLoader = {
      as: "department";
      refId: "id";
      qb: (
        qbWrapper: PuriWrapper,
        fromIds: number[] | string[],
      ) => MockPuri<{ id: number; name: string; company_name: string; refId: number }>;
    };
    type EmployeeLoader = {
      as: "employees";
      refId: "id";
      qb: (
        qbWrapper: PuriWrapper,
        fromIds: number[] | string[],
      ) => MockPuri<{ id: number; employee_number: string; refId: number }>;
      loaders: [
        {
          as: "user";
          refId: "id";
          qb: (
            qbWrapper: PuriWrapper,
            fromIds: number[] | string[],
          ) => MockPuri<{ id: number; name: string; email: string; refId: number }>;
        },
      ];
    };

    type Loaders = [ProjectLoader, DepartmentLoader, EmployeeLoader];
    type Result = LoadersResult<Loaders>;

    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const result = {} as Result;
    expectTypeOf(result).toHaveProperty("projects");
    expectTypeOf(result).toHaveProperty("employees");
    expectTypeOf(result).toHaveProperty("department");
    expectTypeOf(result).toEqualTypeOf<{
      projects: { id: number; name: string }[];
      department: { id: number; name: string; company_name: string }[];
      employees: {
        id: number;
        employee_number: string;
        user: { id: number; name: string; email: string }[];
      }[];
    }>();
  });
});

describe("InferAllSubsets", () => {
  describe("서브셋이 하나인 경우", () => {
    it("로더 없이 기본 Subset 결과를 추론한다", () => {
      // SubsetQuery
      type SubsetFnA = (qbWrapper: PuriWrapper) => MockPuri<{
        id: number;
        user__name: string;
        user__email: string;
        department__name: string;
        department__company__name: string;
      }>;
      type SubsetQueries = {
        A: SubsetFnA;
      };

      // LoaderQuery
      type LoaderQueries = {
        A: [];
      };

      // Result
      type Result = InferAllSubsets<SubsetQueries, LoaderQueries>;

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
      const result = {} as Result;
      expectTypeOf(result).toHaveProperty("A");
      expectTypeOf(result.A).toEqualTypeOf<{
        id: number;
        user: { name: string; email: string };
        department: { name: string; company: { name: string } };
      }>();
      expectTypeOf(result.A.department.company).toEqualTypeOf<{ name: string }>();
    });

    it("로더를 포함한 Subset 결과를 추론한다", () => {
      // SubsetQuery
      type SubsetFnA = (qbWrapper: PuriWrapper) => MockPuri<{
        id: number;
        company__id: number;
        company__name: string;
        department__id: number;
        department__name: string;
      }>;
      type SubsetQueries = {
        A: SubsetFnA;
      };

      // LoaderQuery
      type CompanyDepartmentsLoader = {
        as: "company__departments";
        refId: "company__id";
        qb: (
          qbWrapper: PuriWrapper,
          fromIds: number[] | string[],
        ) => MockPuri<{ id: number; name: string; refId: number }>;
      };
      type DepartmentProjectsLoader = {
        as: "department__projects";
        refId: "department__id";
        qb: (
          qbWrapper: PuriWrapper,
          fromIds: number[] | string[],
        ) => MockPuri<{ id: number; name: string; status: string; refId: number }>;
      };
      type LoaderQueries = {
        A: [CompanyDepartmentsLoader, DepartmentProjectsLoader];
      };

      // Result
      type Result = InferAllSubsets<SubsetQueries, LoaderQueries>;

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
      const result = {} as Result;
      expectTypeOf(result).toHaveProperty("A");
      expectTypeOf(result).toEqualTypeOf<{
        A: {
          id: number;
          company: { id: number; name: string; departments: { id: number; name: string }[] };
          department: {
            id: number;
            name: string;
            projects: { id: number; name: string; status: string }[];
          };
        };
      }>();
    });

    it("중첩 로더를 포함한 Subset 결과를 추론한다", () => {
      // SubsetQuery
      type SubsetFnA = (qbWrapper: PuriWrapper) => MockPuri<{
        id: number;
        company__name: string;
      }>;
      type SubsetQueries = {
        A: SubsetFnA;
      };

      // LoaderQuery
      type CompanyDepartmentsLoader = {
        as: "company__departments";
        refId: "company__id";
        qb: (
          qbWrapper: PuriWrapper,
          fromIds: number[] | string[],
        ) => MockPuri<{ id: number; name: string; refId: number }>;
        loaders: [
          {
            as: "projects";
            refId: "id";
            qb: (
              qbWrapper: PuriWrapper,
              fromIds: number[] | string[],
            ) => MockPuri<{ id: number; name: string; status: string; refId: number }>;
          },
        ];
      };
      type LoaderQueries = {
        A: [CompanyDepartmentsLoader];
      };

      // Result
      type Result = InferAllSubsets<SubsetQueries, LoaderQueries>;

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<{
        A: {
          id: number;
          company: {
            name: string;
            departments: {
              id: number;
              name: string;
              projects: { id: number; name: string; status: string }[];
            }[];
          };
        };
      }>();
    });

    it("중첩 로더 경로 alias를 포함한 Subset 결과를 추론한다", () => {
      type SubsetFnA = (qbWrapper: PuriWrapper) => MockPuri<{
        id: number;
        root__id: number;
      }>;
      type SubsetQueries = {
        A: SubsetFnA;
      };

      type RootItemLoader = {
        as: "root__items";
        refId: "root__id";
        qb: (
          qbWrapper: PuriWrapper,
          fromIds: number[] | string[],
        ) => MockPuri<{
          id: number;
          test__id: number;
          test__name: string;
          refId: number;
        }>;
        loaders: [
          {
            as: "test__inner_items";
            refId: "test__id";
            qb: (
              qbWrapper: PuriWrapper,
              fromIds: number[] | string[],
            ) => MockPuri<{ id: number; name: string; refId: number }>;
          },
        ];
      };
      type LoaderQueries = {
        A: [RootItemLoader];
      };

      type Result = InferAllSubsets<SubsetQueries, LoaderQueries>;

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<{
        A: {
          id: number;
          root: {
            id: number;
            items: {
              id: number;
              test: {
                id: number;
                name: string;
                inner_items: { id: number; name: string }[];
              };
            }[];
          };
        };
      }>();
    });
  });

  describe("서브셋이 여러 개인 경우", () => {
    it("로더 없이 기본 Subset 결과를 추론한다", () => {
      // SubsetQuery
      type SubsetFnA = (qbWrapper: PuriWrapper) => MockPuri<{
        id: number;
        name: string;
        email: string;
        department__name: string;
      }>;
      type SubsetFnP = (qbWrapper: PuriWrapper) => MockPuri<{
        id: number;
        name: string;
        department__name: string;
      }>;
      type SubsetFnSS = (qbWrapper: PuriWrapper) => MockPuri<{
        id: number;
        name: string;
        email: string;
        password: string;
      }>;
      type SubsetQueries = {
        A: SubsetFnA;
        P: SubsetFnP;
        SS: SubsetFnSS;
      };

      // LoaderQuery
      type LoaderQueries = {
        A: [];
        P: [];
        SS: [];
      };

      // Result
      type Result = InferAllSubsets<SubsetQueries, LoaderQueries>;

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<{
        A: { id: number; name: string; email: string; department: { name: string } };
        P: { id: number; name: string; department: { name: string } };
        SS: { id: number; name: string; email: string; password: string };
      }>();
    });

    it("로더를 포함한 Subset 결과를 추론한다", () => {
      // SubsetQuery
      type SubsetFnA = (qbWrapper: PuriWrapper) => MockPuri<{
        id: number;
        name: string;
        email: string;
        department__name: string;
      }>;
      type SubsetFnP = (qbWrapper: PuriWrapper) => MockPuri<{
        id: number;
        name: string;
        department__name: string;
      }>;
      type SubsetFnSS = (qbWrapper: PuriWrapper) => MockPuri<{
        id: number;
        name: string;
        email: string;
        password: string;
      }>;
      type SubsetQueries = {
        A: SubsetFnA;
        P: SubsetFnP;
        SS: SubsetFnSS;
      };

      // LoaderQuery
      type ProjectLoader = {
        as: "projects";
        refId: "id";
        qb: (
          qbWrapper: PuriWrapper,
          fromIds: number[] | string[],
        ) => MockPuri<{ id: number; name: string; status: string; refId: number }>;
        loaders: [
          {
            as: "tags";
            refId: "id";
            qb: (
              qbWrapper: PuriWrapper,
              fromIds: number[] | string[],
            ) => MockPuri<{ id: number; name: string; refId: number }>;
          },
        ];
      };
      type LoaderQueries = {
        A: [ProjectLoader];
        P: [];
        SS: [];
      };

      // Result
      type Result = InferAllSubsets<SubsetQueries, LoaderQueries>;

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<{
        A: {
          id: number;
          name: string;
          email: string;
          department: { name: string };
          projects: {
            id: number;
            name: string;
            status: string;
            tags: { id: number; name: string }[];
          }[];
        };
        P: { id: number; name: string; department: { name: string } };
        SS: { id: number; name: string; email: string; password: string };
      }>();
    });
  });
});
