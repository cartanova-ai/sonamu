import { knex } from "knex";
import { afterAll, describe, expect, it } from "vitest";

import { Puri } from "../puri";

type TestSchema = {
  users: {
    id: number;
    name: string;
    payload: {
      actor: {
        id: string;
        role: string;
      };
      message: string;
    };
    tags: string[];
    state: string;
    readonly __json__: readonly ["payload", "tags", "state"];
  };
};

const db = knex({ client: "pg" });

function usersQuery(): Puri<TestSchema, { users: TestSchema["users"] }, TestSchema["users"]> {
  return new Puri(db, "users");
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
    expect(() => Reflect.apply(query.whereJsonSupersetOf, query, ["payload", undefined])).toThrow(
      "Puri JSONB containment value must be JSON-serializable; JSON.stringify returned undefined.",
    );
    expect(query.rawQuery().toSQL().sql).toBe('select * from "users"');
  });
});
