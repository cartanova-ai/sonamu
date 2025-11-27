import { range } from "radashi";
import { BaseModel, Naite } from "sonamu";
import { assert, describe, expect, vi } from "vitest";
import { bootstrap, test } from "../../testing/bootstrap";
import { UserModel } from "./user.model";

bootstrap(vi);
describe("UserModel", () => {
  const func1 = (no: number) => {
    return async () => {
      const db = BaseModel.getPuri("w");
      await db.transaction(async (trx) => {
        const user = await UserModel.findById("A", 1);
        expect(user.username).toBe("Minsang Kim");
        expect(true).toBe(true);

        await trx.table("users").insert({
          username: `testuser${no}`,
          email: `testuser${no}@test.com`,
          password: "testpassword",
          role: "normal",
        });
        await trx.table("users").where("id", 1).delete();

        await trx.table("companies").insert({
          name: "testcompany",
        });
        const company = await trx.table("companies").select({ id: "id" }).first();
        assert(company);
        await trx.table("departments").insert({
          name: `testdepartment${no}`,
          company_id: company.id,
        });
        await trx.table("tags").insert({
          name: `testtag${no}`,
        });
      });

      const usernames = await db.table("users").pluck("username");
      expect(usernames).toHaveLength(1);

      // 쿼리 확인
      expect(Naite.get("esq-query").first()).toBe(
        "select `users`.`id` as `id`, `users`.`username` as `username`, `users`.`role` as `role`, `users`.`bio` as `bio`, `users`.`is_verified` as `is_verified`, `employee__department`.`name` as `employee__department__name`, `employee`.`salary` as `employee__salary` from `users` inner join `employees` as `employee` on `users`.`id` = `employee`.`user_id` inner join `departments` as `employee__department` on `employee`.`department_id` = `employee__department`.`id` where `users`.`id` in (1) order by `users`.`id` desc",
      );
      expect(Naite.get("esq-query").first()).toContain("where `users`.`id` in (1)");
    };
  };
  range(0, 1).map(async (i) => {
    test(`Testing#${i + 1}`, func1(i));
  });

  test("testNaite", async () => {
    // 메서드 자체는 의도된 에러 상황
    try {
      await UserModel.testNaite();
    } catch {
    } finally {
    }

    // 하지만 에러 발생 전에 기록된 로깅은 유지됨
    expect(Naite.get("testArray").result()).toEqual([1, 2, 3]);
    expect(Naite.get("testObjectArray").result()).toEqual([
      { a: 1, b: 2 },
      { a: 3, b: 4 },
    ]);

    // fromFile 메서드 테스트 (실제 파일 경로)
    expect(Naite.get("testArray").fromFile("user.model.ts").result()).toEqual([1, 2, 3]);
    // fromFile 메서드 테스트 (존재하지 않는 파일)
    expect(Naite.get("testArray").fromFile("NOT-CALLER-FILE-PATH").result()).toEqual([]);

    // fromFunction 메서드 테스트 (실제 함수 이름)
    expect(Naite.get("testArray").fromFunction("testNaite").result()).toEqual([1, 2, 3]);
    // fromFunction 메서드 테스트 (존재하지 않는 함수)
    expect(Naite.get("testArray").fromFunction("NOT-CALLER-FUNCTION-NAME").result()).toEqual([]);

    // 확인용
    // console.dir(Naite.get("testArray").getTraces(), { depth: null });
  });

  test("should get my IP", async () => {
    expect(false).toBe(false);
  });
});
