import { knex } from "knex";
import { afterAll, describe, expect, it, vi } from "vitest";

import { EntityManager } from "../../entity/entity-manager";
import { Puri } from "../puri";

type TestSchema = {
  users: {
    id: number;
    name: string;
    department_id: number | null;
    payload: {
      actor: {
        id: string;
        role: string;
      };
      message: string;
    };
    tags: string[];
    state: string;
    readonly __hasDefault__: readonly ["payload", "tags", "state"];
    readonly __json__: readonly ["payload", "tags", "state"];
  };
  departments: {
    id: number;
    name: string;
  };
  companies: {
    id: number;
    name: string;
  };
};

const db = knex({ client: "pg" });

function usersQuery(): Puri<TestSchema, { users: TestSchema["users"] }, TestSchema["users"]> {
  return new Puri(db, "users");
}

function withJsonTableSpec<T>(jsonColumns: string[], callback: () => T): T {
  const tableSpecSpy = vi.spyOn(EntityManager, "getTableSpec").mockReturnValue({
    name: "users",
    uniqueIndexes: [],
    jsonColumns,
  });

  try {
    return callback();
  } finally {
    tableSpecSpy.mockRestore();
  }
}

afterAll(async () => {
  await db.destroy();
});

describe("Puri locking methods", () => {
  it("adds FOR UPDATE to select queries", () => {
    const query = usersQuery().where("id", 1).forUpdate().first().toQuery();

    expect(query).toBe('select * from "users" where "id" = 1 limit 1 for update');
  });

  it("adds FOR SHARE to select queries", () => {
    const query = usersQuery().where("id", 1).forShare().first().toQuery();

    expect(query).toBe('select * from "users" where "id" = 1 limit 1 for share');
  });
});

describe("Puri JSONB containment", () => {
  it("object array scalar and hostile-looking values remain serialized bindings", () => {
    const hostileValue = `x' OR 1=1 --`;
    const objectQuery = usersQuery()
      .whereJsonSupersetOf("users.payload", {
        actor: { id: hostileValue },
      })
      .rawQuery()
      .toSQL();
    const arrayQuery = usersQuery().whereJsonSupersetOf("tags", [hostileValue]).rawQuery().toSQL();
    const scalarQuery = usersQuery().whereJsonSupersetOf("state", hostileValue).rawQuery().toSQL();

    expect(objectQuery.sql).toBe('select * from "users" where "users"."payload" @> ?');
    expect(objectQuery.bindings).toEqual([
      JSON.stringify({
        actor: { id: hostileValue },
      }),
    ]);
    expect(arrayQuery.sql).toBe('select * from "users" where "tags" @> ?');
    expect(arrayQuery.bindings).toEqual([JSON.stringify([hostileValue])]);
    expect(scalarQuery.sql).toBe('select * from "users" where "state" @> ?');
    expect(scalarQuery.bindings).toEqual([JSON.stringify(hostileValue)]);

    expect(objectQuery.sql).not.toContain(hostileValue);
    expect(arrayQuery.sql).not.toContain(hostileValue);
    expect(scalarQuery.sql).not.toContain(hostileValue);
  });

  it("WhereGroup preserves AND OR ordering and undefined is rejected", () => {
    const groupedQuery = usersQuery()
      .where("id", 1)
      .whereGroup((group) => {
        group
          .whereJsonSupersetOf("payload", { actor: { role: "admin" } })
          .orWhereJsonSupersetOf("tags", ["urgent"]);
      })
      .rawQuery()
      .toSQL();

    expect(groupedQuery.sql).toBe(
      'select * from "users" where "id" = ? and ("payload" @> ? or "tags" @> ?)',
    );
    expect(groupedQuery.bindings).toEqual([
      1,
      JSON.stringify({ actor: { role: "admin" } }),
      JSON.stringify(["urgent"]),
    ]);

    const query = usersQuery();
    // SAFETY: 직렬화 실패 경로를 검증하기 위해 타입 계약 밖의 값을 의도적으로 전달합니다.
    expect(() => query.whereJsonSupersetOf("payload", undefined as never)).toThrow(
      "Puri JSONB containment value must be JSON-serializable; JSON.stringify returned undefined.",
    );
    expect(query.rawQuery().toSQL().sql).toBe('select * from "users"');
  });
});

describe("Puri onConflict JSON 직렬화", () => {
  it("객체 update의 배열을 JSON 문자열 binding으로 변환한다", () => {
    const binding = withJsonTableSpec(["tags"], () =>
      usersQuery()
        .insert({ id: 1, name: "user", department_id: null, tags: ["inserted"] })
        .onConflict("id", { update: { tags: ["updated"] } })
        .knexQuery.toSQL()
        .bindings.at(-1),
    );

    expect(binding).toBe(JSON.stringify(["updated"]));
  });

  it("객체 update의 문자열을 JSON 문자열 binding으로 변환한다", () => {
    const binding = withJsonTableSpec(["state"], () =>
      usersQuery()
        .insert({ id: 1, name: "user", department_id: null, state: "inserted" })
        .onConflict("id", { update: { state: "updated" } })
        .knexQuery.toSQL()
        .bindings.at(-1),
    );

    expect(binding).toBe(JSON.stringify("updated"));
  });

  it("객체 update의 객체를 JSON 문자열 binding으로 변환한다", () => {
    const binding = withJsonTableSpec(["payload"], () =>
      usersQuery()
        .insert({
          id: 1,
          name: "user",
          department_id: null,
          payload: { actor: { id: "1", role: "user" }, message: "inserted" },
        })
        .onConflict("id", {
          update: {
            payload: { actor: { id: "1", role: "admin" }, message: "updated" },
          },
        })
        .knexQuery.toSQL()
        .bindings.at(-1),
    );

    expect(binding).toBe(JSON.stringify({ actor: { id: "1", role: "admin" }, message: "updated" }));
  });

  it("컬럼 update는 직렬화된 EXCLUDED 값을 사용한다", () => {
    const query = withJsonTableSpec(["tags"], () =>
      usersQuery()
        .insert({ id: 1, name: "user", department_id: null, tags: ["updated"] })
        .onConflict("id", { update: ["tags"] })
        .knexQuery.toSQL(),
    );

    expect(query.sql).toContain('"tags" = excluded."tags"');
    expect(query.bindings.at(-1)).toBe(JSON.stringify(["updated"]));
  });
});

describe("Puri ensureJoin", () => {
  it("기존의 동일한 JOIN을 재사용한다", () => {
    const query = usersQuery()
      .join({ department: "departments" }, "users.department_id", "department.id")
      .ensureJoin({ department: "departments" }, "users.department_id", "department.id");

    expect(query.toQuery().match(/join "departments" as "department"/g)).toHaveLength(1);
  });

  it("등록되지 않은 JOIN을 추가한다", () => {
    const query = usersQuery().ensureJoin(
      { department: "departments" },
      "users.department_id",
      "department.id",
    );

    expect(query.toQuery()).toContain(
      'join "departments" as "department" on "users"."department_id" = "department"."id"',
    );
  });

  it("같은 alias의 JOIN 조건이 다르면 실행 전에 오류를 던진다", () => {
    const query = usersQuery().join(
      { department: "departments" },
      "users.department_id",
      "department.id",
    );

    expect(() =>
      query.ensureJoin({ department: "departments" }, "users.id", "department.id"),
    ).toThrowError(
      [
        'Join alias "department" is already registered with a different definition.',
        "Existing: JOIN departments AS department ON users.department_id = department.id",
        "Requested: JOIN departments AS department ON users.id = department.id",
      ].join("\n"),
    );
  });

  it.each([
    {
      name: "테이블",
      create: () =>
        usersQuery()
          .join({ department: "departments" }, "users.department_id", "department.id")
          .ensureJoin({ department: "companies" }, "users.department_id", "department.id"),
      requested: "Requested: JOIN companies AS department ON users.department_id = department.id",
    },
    {
      name: "JOIN 타입",
      create: () =>
        usersQuery()
          .join({ department: "departments" }, "users.department_id", "department.id")
          .ensureLeftJoin({ department: "departments" }, "users.department_id", "department.id"),
      requested:
        "Requested: LEFT JOIN departments AS department ON users.department_id = department.id",
    },
    {
      name: "왼쪽 조건",
      create: () =>
        usersQuery()
          .join({ department: "departments" }, "users.department_id", "department.id")
          .ensureJoin({ department: "departments" }, "users.id", "department.id"),
      requested: "Requested: JOIN departments AS department ON users.id = department.id",
    },
    {
      name: "오른쪽 조건",
      create: () =>
        usersQuery()
          .join({ department: "departments" }, "users.department_id", "department.id")
          .ensureJoin({ department: "departments" }, "users.department_id", "department.name"),
      requested:
        "Requested: JOIN departments AS department ON users.department_id = department.name",
    },
  ])("같은 alias의 $name 정의가 다르면 실행 전에 오류를 던진다", ({ create, requested }) => {
    expect(create).toThrowError(
      'Join alias "department" is already registered with a different definition.',
    );
    expect(create).toThrowError(requested);
  });

  it("일반 JOIN은 같은 alias를 중복 등록할 수 없다", () => {
    const query = usersQuery().join(
      { department: "departments" },
      "users.department_id",
      "department.id",
    );

    expect(() =>
      query.join({ department: "departments" }, "users.department_id", "department.id"),
    ).toThrowError(/Join alias "department" is already registered/);
  });

  it("같은 테이블을 서로 다른 alias로 JOIN할 수 있다", () => {
    const query = usersQuery()
      .ensureJoin(
        { primary_department: "departments" },
        "users.department_id",
        "primary_department.id",
      )
      .ensureJoin({ fallback_department: "departments" }, "users.id", "fallback_department.id");

    expect(query.toQuery()).toContain('join "departments" as "primary_department"');
    expect(query.toQuery()).toContain('join "departments" as "fallback_department"');
  });

  it("기존의 동일한 LEFT JOIN을 재사용한다", () => {
    const query = usersQuery()
      .leftJoin({ department: "departments" }, "users.department_id", "department.id")
      .ensureLeftJoin({ department: "departments" }, "users.department_id", "department.id");

    expect(query.toQuery().match(/left join "departments" as "department"/g)).toHaveLength(1);
  });

  it("callback JOIN은 동일성을 추론하지 않는다", () => {
    const query = usersQuery().join({ department: "departments" }, (join) => {
      join.on("users.department_id", "department.id");
    });

    expect(() =>
      query.ensureJoin({ department: "departments" }, "users.department_id", "department.id"),
    ).toThrowError(/Existing: JOIN departments AS department with opaque condition/);
  });

  it("clone은 JOIN registry를 독립적으로 복제한다", () => {
    const original = usersQuery().ensureJoin(
      { department: "departments" },
      "users.department_id",
      "department.id",
    );
    const cloned = original
      .clone()
      .ensureJoin({ department: "departments" }, "users.department_id", "department.id")
      .ensureJoin({ fallback: "departments" }, "users.id", "fallback.id");

    expect(original.toQuery()).not.toContain('as "fallback"');
    expect(cloned.toQuery()).toContain('as "fallback"');
    expect(cloned.toQuery().match(/join "departments" as "department"/g)).toHaveLength(1);
  });

  it("JOIN을 clear한 뒤 같은 alias를 다시 등록할 수 있다", () => {
    const query = usersQuery()
      .ensureJoin({ department: "departments" }, "users.department_id", "department.id")
      .clear("join")
      .ensureJoin({ department: "departments" }, "users.department_id", "department.id");

    expect(query.toQuery().match(/join "departments" as "department"/g)).toHaveLength(1);
  });

  it("clearJoin으로 삭제한 alias를 다시 등록할 수 있다", () => {
    const query = usersQuery()
      .ensureJoin({ department: "departments" }, "users.department_id", "department.id")
      .clearJoin("department")
      .ensureJoin({ department: "departments" }, "users.department_id", "department.id");

    expect(query.toQuery().match(/join "departments" as "department"/g)).toHaveLength(1);
  });

  it("clearJoin은 subquery JOIN의 registry도 함께 제거한다", () => {
    const departmentIds = new Puri<
      TestSchema,
      { departments: TestSchema["departments"] },
      TestSchema["departments"]
    >(db, "departments").select({ id: "departments.id" });
    const query = usersQuery()
      .join({ department: departmentIds }, "users.department_id", "department.id")
      .clearJoin("department")
      .ensureJoin({ department: "departments" }, "users.department_id", "department.id");

    expect(query.toQuery()).not.toContain('select "id" from "departments"');
    expect(query.toQuery().match(/join "departments" as "department"/g)).toHaveLength(1);
  });
});
