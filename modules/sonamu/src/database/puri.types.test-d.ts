import { describe, expectTypeOf, it } from "vitest";
import type {
  AvailableColumns,
  ExtractColumnType,
  InheritedLeftJoinedMarker,
  LeftJoinedMarker,
  ParseSelectObject,
} from "./puri.types";

// ============================================================================
// 테스트용 Mock 스키마
// ============================================================================

type MockSchema = {
  users: {
    id: number;
    name: string;
    email: string;
    department_id: number | null;
  };
  departments: {
    id: number;
    name: string;
    company_id: number;
  };
  companies: {
    id: number;
    name: string;
  };
  employees: {
    id: number;
    employee_number: string;
    salary: string | null; // nullable 필드
    user_id: number;
    department_id: number | null;
  };
};

// ============================================================================
// ExtractColumnType 테스트
// ============================================================================

describe("ExtractColumnType", () => {
  describe("단일 테이블", () => {
    it("기본 컬럼 타입을 추출한다", () => {
      type Tables = { users: MockSchema["users"] };
      type Result = ExtractColumnType<Tables, "users.id">;

      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<number>();
    });

    it("nullable 컬럼 타입을 추출한다", () => {
      type Tables = { users: MockSchema["users"] };
      type Result = ExtractColumnType<Tables, "users.department_id">;

      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<number | null>();
    });

    it("단일 테이블에서는 테이블명 없이 컬럼명만으로 추출 가능하다", () => {
      type Tables = { users: MockSchema["users"] };
      type Result = ExtractColumnType<Tables, "id">;

      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<number>();
    });
  });

  describe("innerJoin된 테이블", () => {
    it("innerJoin 테이블의 컬럼은 non-null이다", () => {
      type Tables = {
        users: MockSchema["users"];
        department: MockSchema["departments"]; // innerJoin
      };
      type Result = ExtractColumnType<Tables, "department.id">;

      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<number>();
    });
  });

  describe("leftJoin된 테이블", () => {
    it("leftJoin 테이블의 컬럼은 nullable이다", () => {
      type Tables = {
        users: MockSchema["users"];
        department: MockSchema["departments"] & LeftJoinedMarker; // leftJoin
      };
      type Result = ExtractColumnType<Tables, "department.id">;

      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<number | null>();
    });

    it("leftJoin 테이블의 원래 nullable 컬럼도 nullable이다", () => {
      type Tables = {
        users: MockSchema["users"];
        employee: MockSchema["employees"] & LeftJoinedMarker; // leftJoin
      };
      type Result = ExtractColumnType<Tables, "employee.salary">;

      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<string | null>();
    });
  });

  describe("inheritedLeftJoin된 테이블", () => {
    it("inheritedLeftJoin 테이블의 컬럼은 non-null이다 (부모가 null 처리)", () => {
      type Tables = {
        users: MockSchema["users"];
        department: MockSchema["departments"] & LeftJoinedMarker;
        company: MockSchema["companies"] & InheritedLeftJoinedMarker; // inherited
      };
      type Result = ExtractColumnType<Tables, "company.id">;

      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<number>();
    });
  });
});

// ============================================================================
// ParseSelectObject 테스트
// ============================================================================

describe("ParseSelectObject", () => {
  describe("단일 테이블 (flat select)", () => {
    it("기본 필드를 파싱한다", () => {
      type Tables = { users: MockSchema["users"] };
      type Select = {
        id: "users.id";
        name: "users.name";
      };
      type Result = ParseSelectObject<Tables, Select>;

      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<{
        id: number;
        name: string;
      }>();
    });

    it("nullable 필드를 파싱한다", () => {
      type Tables = { users: MockSchema["users"] };
      type Select = {
        id: "users.id";
        department_id: "users.department_id";
      };
      type Result = ParseSelectObject<Tables, Select>;

      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<{
        id: number;
        department_id: number | null;
      }>();
    });
  });

  describe("innerJoin + flat select", () => {
    it("innerJoin 테이블의 필드는 non-null이다", () => {
      type Tables = {
        users: MockSchema["users"];
        department: MockSchema["departments"]; // innerJoin
      };
      type Select = {
        id: "users.id";
        dept_id: "department.id";
        dept_name: "department.name";
      };
      type Result = ParseSelectObject<Tables, Select>;

      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<{
        id: number;
        dept_id: number;
        dept_name: string;
      }>();
    });
  });

  describe("leftJoin + flat select", () => {
    it("leftJoin 테이블의 필드는 nullable이다", () => {
      type Tables = {
        users: MockSchema["users"];
        department: MockSchema["departments"] & LeftJoinedMarker; // leftJoin
      };
      type Select = {
        id: "users.id";
        dept_id: "department.id";
        dept_name: "department.name";
      };
      type Result = ParseSelectObject<Tables, Select>;

      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<{
        id: number;
        dept_id: number | null;
        dept_name: string | null;
      }>();
    });
  });

  // ============================================================================
  // 핵심: 입체적 select 구조
  // ============================================================================

  describe("innerJoin + nested select (입체적 구조)", () => {
    it("innerJoin 테이블의 중첩 객체는 non-null이다", () => {
      type Tables = {
        users: MockSchema["users"];
        department: MockSchema["departments"]; // innerJoin
      };
      type Select = {
        id: "users.id";
        department: {
          id: "department.id";
          name: "department.name";
        };
      };
      type Result = ParseSelectObject<Tables, Select>;

      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<{
        id: number;
        department: {
          id: number;
          name: string;
        };
      }>();
    });
  });

  describe("leftJoin + nested select (입체적 구조)", () => {
    it("leftJoin 테이블의 중첩 객체는 nullable이다 (필드는 non-null)", () => {
      type Tables = {
        users: MockSchema["users"];
        department: MockSchema["departments"] & LeftJoinedMarker; // leftJoin
      };
      type Select = {
        id: "users.id";
        department: {
          id: "department.id";
          name: "department.name";
        };
      };
      type Result = ParseSelectObject<Tables, Select>;

      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<{
        id: number;
        department: {
          id: number;
          name: string;
        } | null; // 객체 단위로 nullable
      }>();
    });

    it("leftJoin 테이블 내의 원래 nullable 필드도 non-null이다", () => {
      type Tables = {
        users: MockSchema["users"];
        employee: MockSchema["employees"] & LeftJoinedMarker; // leftJoin
      };
      type Select = {
        id: "users.id";
        employee: {
          id: "employee.id";
          salary: "employee.salary"; // 스키마상 nullable이지만...
        };
      };
      type Result = ParseSelectObject<Tables, Select>;

      const result = {} as Result;
      // employee 객체가 null이 아닐 때만 접근하므로, salary의 원래 nullability 유지
      expectTypeOf(result).toEqualTypeOf<{
        id: number;
        employee: {
          id: number;
          salary: string | null; // 스키마의 원래 nullability 유지
        } | null;
      }>();
    });
  });

  describe("inheritedLeftJoin + nested select (입체적 구조)", () => {
    it("inheritedLeftJoin 테이블의 중첩 객체는 non-null이다", () => {
      type Tables = {
        users: MockSchema["users"];
        department: MockSchema["departments"] & LeftJoinedMarker; // leftJoin
        department__company: MockSchema["companies"] & InheritedLeftJoinedMarker; // inherited
      };
      type Select = {
        id: "users.id";
        department: {
          id: "department.id";
          name: "department.name";
          company: {
            name: "department__company.name";
          };
        };
      };
      type Result = ParseSelectObject<Tables, Select>;

      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<{
        id: number;
        department: {
          id: number;
          name: string;
          company: {
            name: string;
          }; // non-null! (inherited는 부모가 null 처리)
        } | null;
      }>();
    });

    it("깊은 중첩에서도 inheritedLeftJoin은 non-null이다", () => {
      type Tables = {
        employees: MockSchema["employees"];
        user: MockSchema["users"];
        user__employee: MockSchema["employees"] & LeftJoinedMarker;
        user__employee__department: MockSchema["departments"] & InheritedLeftJoinedMarker;
      };
      type Select = {
        id: "employees.id";
        user: {
          id: "user.id";
          employee: {
            id: "user__employee.id";
            department: {
              id: "user__employee__department.id";
            };
          };
        };
      };
      type Result = ParseSelectObject<Tables, Select>;

      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<{
        id: number;
        user: {
          // user는 innerJoin이므로 무조건 존재합니다.
          id: number;
          employee: {
            // user의 employee는 leftJoin이므로 null일 수 있습니다.
            id: number;
            department: {
              // employee가 존재한다면 department는 (inherited)leftJoin이므로 무조건 존재합니다.
              id: number;
            }; // inherited → non-null
          } | null; // leftJoin → nullable
        }; // innerJoin → non-null
      }>();
    });
  });

  describe("복합 케이스", () => {
    it("innerJoin + leftJoin + inheritedLeftJoin 조합", () => {
      type Tables = {
        employees: MockSchema["employees"];
        user: MockSchema["users"]; // innerJoin
        department: MockSchema["departments"] & LeftJoinedMarker; // leftJoin
        department__company: MockSchema["companies"] & InheritedLeftJoinedMarker; // inherited
      };
      type Select = {
        id: "employees.id";
        employee_number: "employees.employee_number";
        salary: "employees.salary";
        user: {
          id: "user.id";
          username: "user.name";
        };
        department: {
          id: "department.id";
          name: "department.name";
          company: {
            name: "department__company.name";
          };
        };
      };
      type Result = ParseSelectObject<Tables, Select>;

      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<{
        id: number;
        employee_number: string;
        salary: string | null; // 스키마상 nullable
        user: {
          id: number;
          username: string;
        }; // innerJoin → non-null
        department: {
          id: number;
          name: string;
          company: {
            name: string;
          }; // inherited → non-null
        } | null; // leftJoin → nullable
      }>();
    });

    it("여러 leftJoin 관계", () => {
      type Tables = {
        employees: MockSchema["employees"];
        department: MockSchema["departments"] & LeftJoinedMarker;
        manager: MockSchema["users"] & LeftJoinedMarker;
      };
      type Select = {
        id: "employees.id";
        department: {
          name: "department.name";
        };
        manager: {
          name: "manager.name";
        };
      };
      type Result = ParseSelectObject<Tables, Select>;

      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<{
        id: number;
        department: { name: string } | null;
        manager: { name: string } | null;
      }>();
    });
  });
});

// ============================================================================
// AvailableColumns 테스트
// ============================================================================

describe("AvailableColumns", () => {
  it("단일 테이블에서 사용 가능한 컬럼을 추출한다", () => {
    type Tables = { users: MockSchema["users"] };
    type Result = AvailableColumns<Tables>;

    // "users.id" | "users.name" | "users.email" | "users.department_id" | "id" | "name" | "email" | "department_id"
    const valid1: Result = "users.id";
    const valid2: Result = "id"; // 단일 테이블이면 테이블명 생략 가능

    expectTypeOf(valid1).toExtend<Result>();
    expectTypeOf(valid2).toExtend<Result>();
  });

  it("여러 테이블에서 사용 가능한 컬럼을 추출한다", () => {
    type Tables = {
      users: MockSchema["users"];
      department: MockSchema["departments"];
    };
    type Result = AvailableColumns<Tables>;

    const valid1: Result = "users.id";
    const valid2: Result = "department.name";

    expectTypeOf(valid1).toExtend<Result>();
    expectTypeOf(valid2).toExtend<Result>();
  });
});
