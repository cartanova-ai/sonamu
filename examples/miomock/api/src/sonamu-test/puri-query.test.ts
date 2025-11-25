import { describe, vi } from "vitest";
import { bootstrap, test } from "../testing/bootstrap";

bootstrap(vi);
describe("Puri Query", () => {
  describe("A. BASIC CRUD", () => {
    test.todo("select");
    test.todo("select with alias");
    test.todo("selectAll");
    test.todo("insert");
    test.todo("update");
    test.todo("delete");
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
