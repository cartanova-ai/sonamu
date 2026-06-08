import { knex } from "knex";
import { afterAll, describe, expect, it } from "vitest";

import { Puri } from "../puri";

type TestSchema = {
  users: {
    id: number;
    name: string;
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
