/** biome-ignore-all lint: reason */

import { Naite } from "sonamu";
import { describe, vi } from "vitest";
import { UserModel } from "../application/user/user.model";
import { bootstrap, test } from "../testing/bootstrap";
import { expectQuery } from "../testing/expect-query";

bootstrap(vi);
describe("Puri Query", () => {
  describe("A. BASIC CRUD", () => {
    test("select", async () => {
      const db = UserModel.getPuri("r");

      await db.table("users").select({ id: "users.id" }).where("users.id", 1);
      const query = Naite.get("puri-query");

      expectQuery(query)
        .toBeType("select")
        .toHaveTable("users")
        .toHaveColumn("id", { table: "users" });
    });

    test("select with alias", async () => {
      const db = UserModel.getPuri("r");

      await db
        .table("users")
        .select({ userId: "users.id", userName: "users.username" })
        .where("users.id", 1);
      const query = Naite.get("puri-query");

      expectQuery(query)
        .toBeType("select")
        .toHaveTable("users")
        .toHaveColumn("id", { table: "users", alias: "userId" })
        .toHaveColumn("username", { table: "users", alias: "userName" });
    });

    test("selectAll", async () => {
      const db = UserModel.getPuri("r");

      await db.table("users").selectAll().where("users.id", 1);
      const query = Naite.get("puri-query");

      expectQuery(query).toBeType("select").toHaveTable("users").toContain("select *");
    });

    test("insert", async () => {
      const db = UserModel.getPuri("w");

      await db
        .table("users")
        .insert({ username: "테스트", email: "test@test.com", password: "test", role: "normal" });
      const query = Naite.get("puri-query");

      expectQuery(query).toBeType("insert").toHaveTable("users");
    });

    test("update", async () => {
      const db = UserModel.getPuri("w");

      await db.table("users").where("users.id", 1).update({ username: "수정됨" });
      const query = Naite.get("puri-query");

      expectQuery(query).toBeType("update").toHaveTable("users");
    });

    test("delete", async () => {
      const db = UserModel.getPuri("w");

      await db.table("users").where("users.id", 1).delete();
      const query = Naite.get("puri-query");

      expectQuery(query).toBeType("delete").toHaveTable("users");
    });
  });

  describe("B. JOIN", () => {
    test.todo("inner join");
    test.todo("left join");
    test.todo("right join");
    test.todo("full join");
    test.todo("multiple join");
    test.todo("join with subquery");
    test.todo("self join with alias");
  });

  describe("C. WHERE", () => {
    test.todo("where - 단일조건");
    test.todo("where - 객체조건");
    test.todo("whereGroup");
    test.todo("whereIn");
    test.todo("where - null 비교");
    test.todo("orWhere");
  });

  describe("D. AGGREGATE FUNCTIONS(집계함수)", () => {
    test.todo("count");
    test.todo("sum");
    test.todo("avg");
    test.todo("max");
    test.todo("min");
    test.todo("having");
    test.todo("groupBy");
  });

  describe("E. SORT & PAGINATION", () => {
    test.todo("orderBy");
    test.todo("limit");
  });

  describe("F. UPDATE HELPERS", () => {
    test.todo("increment");
    test.todo("decrement");
  });

  describe("G. ETC", () => {
    test.todo("pluck");
    test.todo("first");
  });
});
