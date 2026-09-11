import { describe, expectTypeOf, it } from "vitest";

import { Puri } from "./puri";
import {
  type AvailableColumns,
  type ExtractColumnType,
  type JsonColumns,
  type JsonSupersetValue,
  type LeftJoinedMarker,
  type ParseSelectObject,
  type SqlExpression,
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
    preferences: {
      theme: "light" | "dark";
      notifications: {
        email: boolean;
        sms: boolean;
      };
      labels: string[];
      sessions: {
        id: string;
        active: boolean;
      }[];
    };
    json_tags: string[];
    json_scalar: string;
    nullable_payload: {
      enabled: boolean;
    } | null;
    native_tags: string[];
    created_at: Date;
    embedding: number[];
    readonly __json__: readonly ["preferences", "json_tags", "json_scalar", "nullable_payload"];
    readonly __vector__: readonly ["embedding"];
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

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<number>();
    });

    it("nullable 컬럼 타입을 추출한다", () => {
      type Tables = { users: MockSchema["users"] };
      type Result = ExtractColumnType<Tables, "users.department_id">;

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<number | null>();
    });

    it("단일 테이블에서는 테이블명 없이 컬럼명만으로 추출 가능하다", () => {
      type Tables = { users: MockSchema["users"] };
      type Result = ExtractColumnType<Tables, "id">;

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
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

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
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

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<number | null>();
    });

    it("leftJoin 테이블의 원래 nullable 컬럼도 nullable이다", () => {
      type Tables = {
        users: MockSchema["users"];
        employee: MockSchema["employees"] & LeftJoinedMarker; // leftJoin
      };
      type Result = ExtractColumnType<Tables, "employee.salary">;

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<string | null>();
    });
  });

  describe("non-null FK로 leftJoin된 테이블", () => {
    it("non-null FK로 leftJoin된 테이블의 컬럼은 non-null이다 (마커 없음)", () => {
      type Tables = {
        users: MockSchema["users"];
        department: MockSchema["departments"] & LeftJoinedMarker; // nullable FK
        company: MockSchema["companies"]; // non-null FK → 마커 없음
      };
      type Result = ExtractColumnType<Tables, "company.id">;

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
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

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
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

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
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

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
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

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
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

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
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

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
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

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
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

  describe("non-null FK leftJoin + nested select (입체적 구조)", () => {
    it("non-null FK로 leftJoin된 테이블의 중첩 객체는 non-null이다", () => {
      type Tables = {
        users: MockSchema["users"];
        department: MockSchema["departments"] & LeftJoinedMarker; // nullable FK → 마커 있음
        department__company: MockSchema["companies"]; // non-null FK → 마커 없음
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

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<{
        id: number;
        department: {
          id: number;
          name: string;
          company: {
            name: string;
          }; // non-null! (non-null FK로 조인되어 마커 없음)
        } | null;
      }>();
    });

    it("깊은 중첩에서도 non-null FK leftJoin은 non-null이다", () => {
      type Tables = {
        employees: MockSchema["employees"];
        user: MockSchema["users"]; // innerJoin → 마커 없음
        user__employee: MockSchema["employees"] & LeftJoinedMarker; // nullable FK
        user__employee__department: MockSchema["departments"]; // non-null FK → 마커 없음
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

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
      const result = {} as Result;
      expectTypeOf(result).toEqualTypeOf<{
        id: number;
        user: {
          // user는 innerJoin이므로 무조건 존재합니다.
          id: number;
          employee: {
            // user의 employee는 nullable FK leftJoin이므로 null일 수 있습니다.
            id: number;
            department: {
              // employee가 존재한다면 department는 non-null FK leftJoin이므로 무조건 존재합니다.
              id: number;
            }; // non-null FK → non-null
          } | null; // nullable FK leftJoin → nullable
        }; // innerJoin → non-null
      }>();
    });
  });

  describe("복합 케이스", () => {
    it("innerJoin + nullable FK leftJoin + non-null FK leftJoin 조합", () => {
      type Tables = {
        employees: MockSchema["employees"];
        user: MockSchema["users"]; // innerJoin (non-null FK)
        department: MockSchema["departments"] & LeftJoinedMarker; // nullable FK leftJoin
        department__company: MockSchema["companies"]; // non-null FK leftJoin → 마커 없음
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

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
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
          }; // non-null FK → non-null
        } | null; // nullable FK leftJoin → nullable
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

      // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
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

describe("JsonColumns and JsonSupersetValue", () => {
  it("JSON metadata selects only JSON columns and preserves recursive RHS types", () => {
    type Tables = { users: MockSchema["users"] };
    type Columns = JsonColumns<Tables>;
    type PreferencesValue = JsonSupersetValue<MockSchema["users"]["preferences"]>;
    type NullablePayloadValue = JsonSupersetValue<MockSchema["users"]["nullable_payload"]>;

    expectTypeOf<Columns>().toEqualTypeOf<
      | "users.preferences"
      | "users.json_tags"
      | "users.json_scalar"
      | "users.nullable_payload"
      | "preferences"
      | "json_tags"
      | "json_scalar"
      | "nullable_payload"
    >();

    const partialObject: PreferencesValue = {
      notifications: { email: true },
      sessions: [{ active: false }],
    };
    const arrayRoot: JsonSupersetValue<MockSchema["users"]["json_tags"]> = ["urgent"];
    const scalarRoot: JsonSupersetValue<MockSchema["users"]["json_scalar"]> = "active";
    const nullableColumnValue: NullablePayloadValue = { enabled: true };

    expectTypeOf(partialObject).toExtend<PreferencesValue>();
    expectTypeOf(arrayRoot).toEqualTypeOf<string[]>();
    expectTypeOf(scalarRoot).toEqualTypeOf<string>();
    expectTypeOf(nullableColumnValue).toExtend<NullablePayloadValue>();

    // @ts-expect-error nested boolean property must not accept a string.
    const wrongNestedType: PreferencesValue = { notifications: { email: "yes" } };
    // @ts-expect-error array element types are preserved.
    const wrongArrayElement: JsonSupersetValue<MockSchema["users"]["json_tags"]> = [1];
    // @ts-expect-error object array elements retain their recursive partial shape.
    const wrongObjectArrayElement: PreferencesValue = { sessions: [{ active: "yes" }] };
    // @ts-expect-error nullable JSON columns do not accept top-level null as a containment value.
    const nullRoot: NullablePayloadValue = null;
    // @ts-expect-error undefined cannot be serialized as a JSONB containment value.
    const undefinedRoot: PreferencesValue = undefined;

    const unknownValue: unknown = structuredClone({ notifications: { email: true } });
    // @ts-expect-error unknown must be narrowed before it can be used as a containment value.
    const unknownRoot: PreferencesValue = unknownValue;

    expectTypeOf(wrongNestedType).toExtend<PreferencesValue>();
    expectTypeOf(wrongArrayElement).toEqualTypeOf<string[]>();
    expectTypeOf(wrongObjectArrayElement).toExtend<PreferencesValue>();
    expectTypeOf(nullRoot).toExtend<NullablePayloadValue>();
    expectTypeOf(undefinedRoot).toExtend<PreferencesValue>();
    expectTypeOf(unknownRoot).toExtend<PreferencesValue>();

    type Query = Puri<MockSchema, Tables, MockSchema["users"]>;
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const query = {} as Query;

    expectTypeOf(
      query.whereJsonSupersetOf("preferences", {
        notifications: { sms: false },
      }),
    ).toEqualTypeOf<Query>();
    expectTypeOf(
      query.whereGroup((group) =>
        group
          .whereJsonSupersetOf("users.preferences", { theme: "dark" })
          .orWhereJsonSupersetOf("users.json_tags", ["urgent"]),
      ),
    ).toEqualTypeOf<Query>();

    // @ts-expect-error ordinary string columns are not JSON columns.
    query.whereJsonSupersetOf("name", "Noa");
    // @ts-expect-error date columns are not JSON columns.
    query.whereJsonSupersetOf("created_at", new Date());
    // @ts-expect-error native PostgreSQL array columns are not JSON columns.
    query.whereJsonSupersetOf("native_tags", ["urgent"]);
    // @ts-expect-error vector columns are not JSON columns.
    query.whereJsonSupersetOf("embedding", [0.1, 0.2]);
    // @ts-expect-error scalar JSON roots retain their scalar type.
    query.whereJsonSupersetOf("json_scalar", { state: "active" });
    // @ts-expect-error top-level null is rejected even when the JSON column itself is nullable.
    query.whereJsonSupersetOf("nullable_payload", null);
    // @ts-expect-error top-level undefined is not JSON-serializable.
    query.whereJsonSupersetOf("preferences", undefined);
    // @ts-expect-error unknown must be narrowed before calling the public method.
    query.whereJsonSupersetOf("preferences", unknownValue);
    // @ts-expect-error top-level OR is intentionally exposed only through whereGroup.
    query.orWhereJsonSupersetOf("preferences", { theme: "light" });
  });
});

describe("JSONB 텍스트 표현식과 키 존재 조건", () => {
  it("JSON 컬럼의 단일 경로와 중첩 경로를 nullable 문자열 표현식으로 선택한다", () => {
    type Tables = { users: MockSchema["users"] };
    type Query = Puri<MockSchema, Tables, MockSchema["users"]>;
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const query = {} as Query;

    const single = query.jsonText("preferences", "theme");
    const nested = query.jsonText("users.preferences", "notifications", "email");
    const selected = query.select({ single, nested });

    expectTypeOf(single).toEqualTypeOf<SqlExpression<"string", true>>();
    expectTypeOf(nested).toEqualTypeOf<SqlExpression<"string", true>>();
    expectTypeOf<Awaited<typeof selected>[number]>().toEqualTypeOf<{
      single: string | null;
      nested: string | null;
    }>();
  });

  it("nullable 문자열 표현식을 coalesce와 concatExpressions로 안전하게 조합한다", () => {
    type Tables = { users: MockSchema["users"] };
    type Query = Puri<MockSchema, Tables, MockSchema["users"]>;
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const query = {} as Query;

    const text = query.jsonText("preferences", "theme");
    const fallback = Puri.coalesce(text, "light");
    const legacyExpression: SqlExpression<"string"> = Puri.rawString("'legacy'");
    const similarity = Puri.similarity(legacyExpression, "dark");
    const combined = Puri.concatExpressions(
      "theme=",
      fallback,
      "; nullable=",
      text,
      "; legacy=",
      legacyExpression,
    );
    const selected = query.select({ fallback, combined, legacyExpression });

    expectTypeOf(fallback).toEqualTypeOf<SqlExpression<"string">>();
    expectTypeOf(similarity).toEqualTypeOf<SqlExpression<"number">>();
    expectTypeOf(combined).toEqualTypeOf<SqlExpression<"string">>();
    expectTypeOf(legacyExpression).toEqualTypeOf<SqlExpression<"string">>();
    expectTypeOf<Awaited<typeof selected>[number]>().toEqualTypeOf<{
      fallback: string;
      combined: string;
      legacyExpression: string;
    }>();
    expectTypeOf(query.whereTsSearch(text, "dark")).toEqualTypeOf<Query>();
    expectTypeOf(
      query.whereGroup((group) => group.whereFuzzy(text, "dark")),
    ).toEqualTypeOf<Query>();

    // @ts-expect-error 문자열 표현식 조합에는 숫자 리터럴을 전달할 수 없습니다.
    Puri.concatExpressions(text, 1);
    // @ts-expect-error 문자열 표현식 조합에는 숫자 표현식을 전달할 수 없습니다.
    Puri.concatExpressions(text, Puri.rawNumber("COUNT(*)"));
    // @ts-expect-error 문자열 coalesce의 대체값은 문자열이어야 합니다.
    Puri.coalesce(text, 0);
    // @ts-expect-error coalesce의 첫 인자는 문자열 SQL 표현식이어야 합니다.
    Puri.coalesce("preferences", "light");
  });

  it("nullable 문자열 표현식의 pg_trgm 결과와 직접 select 결과를 nullable 숫자로 유지한다", () => {
    type Tables = { users: MockSchema["users"] };
    type Query = Puri<MockSchema, Tables, MockSchema["users"]>;
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const query = {} as Query;

    const text = query.jsonText("preferences", "theme");
    const word = Puri.wordSimilarity(text, "dark");
    const whole = Puri.similarity(text, "dark");
    const strict = Puri.strictWordSimilarity(text, "dark");
    const selected = query.select({ word, whole, strict });

    expectTypeOf(word).toEqualTypeOf<SqlExpression<"number", true>>();
    expectTypeOf(whole).toEqualTypeOf<SqlExpression<"number", true>>();
    expectTypeOf(strict).toEqualTypeOf<SqlExpression<"number", true>>();
    expectTypeOf<Awaited<typeof selected>[number]>().toEqualTypeOf<{
      word: number | null;
      whole: number | null;
      strict: number | null;
    }>();
  });

  it("기존 문자열 컬럼과 non-null 표현식의 pg_trgm 결과를 non-null 숫자로 유지한다", () => {
    const expression: SqlExpression<"string"> = Puri.rawString("'고정값'");

    expectTypeOf(Puri.wordSimilarity("users.name", "dark")).toEqualTypeOf<
      SqlExpression<"number">
    >();
    expectTypeOf(Puri.similarity("users.name", "dark")).toEqualTypeOf<SqlExpression<"number">>();
    expectTypeOf(Puri.strictWordSimilarity("users.name", "dark")).toEqualTypeOf<
      SqlExpression<"number">
    >();
    expectTypeOf(Puri.wordSimilarity(expression, "dark")).toEqualTypeOf<SqlExpression<"number">>();
    expectTypeOf(Puri.similarity(expression, "dark")).toEqualTypeOf<SqlExpression<"number">>();
    expectTypeOf(Puri.strictWordSimilarity(expression, "dark")).toEqualTypeOf<
      SqlExpression<"number">
    >();
  });

  it("키 존재 조건을 최상위와 AND OR 그룹에서 체이닝한다", () => {
    type Tables = { users: MockSchema["users"] };
    type Query = Puri<MockSchema, Tables, MockSchema["users"]>;
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const query = {} as Query;

    expectTypeOf(query.whereJsonKeyExists("preferences", "theme")).toEqualTypeOf<Query>();
    expectTypeOf(
      query.whereGroup((group) =>
        group
          .whereJsonKeyExists("users.preferences", "theme")
          .orWhereJsonKeyExists("users.preferences", "notifications"),
      ),
    ).toEqualTypeOf<Query>();

    // @ts-expect-error 최상위 OR 키 존재 조건은 의도적으로 제공하지 않습니다.
    query.orWhereJsonKeyExists("preferences", "theme");
  });

  it("JSON이 아닌 컬럼과 사용할 수 없는 컬럼 경로를 거부한다", () => {
    type Tables = { users: MockSchema["users"] };
    type Query = Puri<MockSchema, Tables, MockSchema["users"]>;
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const query = {} as Query;

    // @ts-expect-error JSON 텍스트 추출에는 경로가 하나 이상 필요합니다.
    query.jsonText("preferences");
    // @ts-expect-error 일반 문자열 컬럼은 JSON 텍스트 추출에 사용할 수 없습니다.
    query.jsonText("name", "value");
    // @ts-expect-error 날짜 컬럼은 JSON 키 존재 조건에 사용할 수 없습니다.
    query.whereJsonKeyExists("created_at", "value");
    // @ts-expect-error 등록되지 않은 테이블의 JSON 컬럼은 사용할 수 없습니다.
    query.jsonText("other.preferences", "theme");
    // @ts-expect-error JSON 경로 조각은 문자열이어야 합니다.
    query.jsonText("preferences", 0);
    // @ts-expect-error JSON 키는 문자열이어야 합니다.
    query.whereJsonKeyExists("preferences", 0);

    type AliasedQuery = Puri<MockSchema, { member: MockSchema["users"] }, MockSchema["users"]>;
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const aliased = {} as AliasedQuery;
    aliased.jsonText("member.preferences", "theme");
    // @ts-expect-error alias를 사용하면 원래 테이블명으로 한정할 수 없습니다.
    aliased.jsonText("users.preferences", "theme");

    type JoinedQuery = Puri<
      MockSchema,
      { users: MockSchema["users"]; departments: MockSchema["departments"] },
      MockSchema["users"]
    >;
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const joined = {} as JoinedQuery;
    joined.jsonText("users.preferences", "theme");
    // @ts-expect-error 여러 테이블이 등록되면 JSON 컬럼도 테이블명으로 한정해야 합니다.
    joined.jsonText("preferences", "theme");
  });

  it("범위에서 제외된 범용 JSON과 SQL DSL을 노출하지 않는다", () => {
    type Tables = { users: MockSchema["users"] };
    type Query = Puri<MockSchema, Tables, MockSchema["users"]>;
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const query = {} as Query;

    // @ts-expect-error 범용 JSON 경로 조건은 이번 API 범위가 아닙니다.
    query.whereJsonPath("preferences", "$.theme", "dark");
    // @ts-expect-error 범용 JSON 객체 조건은 이번 API 범위가 아닙니다.
    query.whereJsonObject("preferences", { theme: "dark" });
    // @ts-expect-error 범용 SQL EXISTS 조건은 이번 API 범위가 아닙니다.
    query.whereExists(Puri.rawString("SELECT 1"));
  });
});

describe("Puri locking methods", () => {
  it("forUpdate 체이닝 후 first 결과 타입을 유지한다", () => {
    type Query = Puri<MockSchema, { users: MockSchema["users"] }, MockSchema["users"]>;
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const query = {} as Query;

    const result = query.where("id", 1).forUpdate().first();

    expectTypeOf(result).resolves.toEqualTypeOf<MockSchema["users"]>();
  });

  it("forShare 체이닝 후 first 결과 타입을 유지한다", () => {
    type Query = Puri<MockSchema, { users: MockSchema["users"] }, MockSchema["users"]>;
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const query = {} as Query;

    const result = query.where("id", 1).forShare().first();

    expectTypeOf(result).resolves.toEqualTypeOf<MockSchema["users"]>();
  });
});

describe("Puri orderBy methods", () => {
  it("단일 컬럼 null ordering과 체이닝 타입을 지원한다", () => {
    type Query = Puri<MockSchema, { users: MockSchema["users"] }, MockSchema["users"]>;
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const query = {} as Query;

    expectTypeOf(query.orderBy("id")).toEqualTypeOf<Query>();
    expectTypeOf(query.orderBy("id", "asc")).toEqualTypeOf<Query>();
    expectTypeOf(query.orderBy("id", "desc", "last")).toEqualTypeOf<Query>();
    expectTypeOf(query.orderBy("users.department_id", "asc", "first")).toEqualTypeOf<Query>();
  });

  it("여러 컬럼 orderBy item 배열을 지원한다", () => {
    type Query = Puri<MockSchema, { users: MockSchema["users"] }, MockSchema["users"]>;
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const query = {} as Query;

    expectTypeOf(query.orderBy(["name", "email"])).toEqualTypeOf<Query>();
    expectTypeOf(
      query.orderBy([
        { column: "name" },
        { column: "email", order: "asc" },
        { column: "users.department_id", order: "desc", nulls: "last" },
      ]),
    ).toEqualTypeOf<Query>();
  });

  it("select 결과 컬럼을 orderBy에 사용할 수 있다", () => {
    type Result = { post_count: number };
    type Query = Puri<MockSchema, { users: MockSchema["users"] }, Result>;
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const query = {} as Query;

    expectTypeOf(query.orderBy("post_count", "desc", "last")).toEqualTypeOf<Query>();
    expectTypeOf(query.orderBy(["post_count"])).toEqualTypeOf<Query>();
    expectTypeOf(
      query.orderBy([{ column: "post_count", order: "desc", nulls: "last" }]),
    ).toEqualTypeOf<Query>();
  });

  it("SqlExpression orderBy를 지원한다", () => {
    type Query = Puri<MockSchema, { users: MockSchema["users"] }, MockSchema["users"]>;
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const query = {} as Query;
    const expression = Puri.rawNumber("COUNT(*)");

    expectTypeOf(query.orderBy(expression, "desc", "last")).toEqualTypeOf<Query>();
    expectTypeOf(query.orderBy([expression])).toEqualTypeOf<Query>();
    expectTypeOf(
      query.orderBy([{ column: expression, order: "desc", nulls: "first" }]),
    ).toEqualTypeOf<Query>();
  });

  it("잘못된 direction, nulls, column은 거부한다", () => {
    type Query = Puri<MockSchema, { users: MockSchema["users"] }, MockSchema["users"]>;
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const query = {} as Query;

    // @ts-expect-error direction은 asc/desc만 허용한다.
    query.orderBy("id", "ascending");

    // @ts-expect-error nulls는 first/last만 허용한다.
    query.orderBy("id", "asc", "middle");

    // @ts-expect-error typed Puri에서는 존재하지 않는 컬럼을 허용하지 않는다.
    query.orderBy("missing_column", "asc");

    // @ts-expect-error 배열 item의 column도 typed Puri 컬럼 제약을 따른다.
    query.orderBy([{ column: "missing_column", order: "asc" }]);

    // @ts-expect-error string 배열도 typed Puri 컬럼 제약을 따른다.
    query.orderBy(["name", "missing_column"]);
  });
});

describe("Puri ensureJoin methods", () => {
  it("ensureJoin 이후 alias 컬럼을 타입 안전하게 사용할 수 있다", () => {
    type Query = Puri<MockSchema, { users: MockSchema["users"] }, MockSchema["users"]>;
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const query = {} as Query;

    const joined = query.ensureJoin(
      { department: "departments" },
      "users.department_id",
      "department.id",
    );

    expectTypeOf(joined.where("department.name", "개발팀")).toEqualTypeOf(joined);

    // @ts-expect-error JOIN한 테이블에 없는 컬럼은 사용할 수 없다.
    joined.where("department.email", "dev@example.com");
  });

  it("ensureLeftJoin은 nullable FK의 객체 타입을 유지한다", () => {
    type Query = Puri<MockSchema, { users: MockSchema["users"] }, MockSchema["users"]>;
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const query = {} as Query;

    const result = query
      .ensureLeftJoin({ department: "departments" }, "users.department_id", "department.id")
      .select({ department: { id: "department.id" } })
      .first();

    expectTypeOf(result).resolves.toEqualTypeOf<{
      department: { id: number } | null;
    }>();
  });

  it("ensureLeftJoin은 non-null FK의 객체를 non-null로 추론한다", () => {
    type Query = Puri<MockSchema, { employees: MockSchema["employees"] }, MockSchema["employees"]>;
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const query = {} as Query;

    const result = query
      .ensureLeftJoin({ user: "users" }, "employees.user_id", "user.id")
      .select({ user: { id: "user.id" } })
      .first();

    expectTypeOf(result).resolves.toEqualTypeOf<{
      user: { id: number };
    }>();
  });

  it("ensureJoin은 callback 형식을 허용하지 않는다", () => {
    type Query = Puri<MockSchema, { users: MockSchema["users"] }, MockSchema["users"]>;
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const query = {} as Query;

    // @ts-expect-error callback JOIN은 동일성을 판정할 수 없으므로 지원하지 않는다.
    query.ensureJoin({ department: "departments" }, (join) => {
      join.on("users.department_id", "department.id");
    });
  });
});
