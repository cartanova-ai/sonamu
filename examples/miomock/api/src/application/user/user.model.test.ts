import { describe, test, expect, assert } from "vitest";
import { bootstrap, runWithMockContext } from "../../testing/bootstrap";
import { UserModel } from "./user.model";
import range from "lodash-es/range.js";
import { BaseModel, Naite } from "sonamu";

bootstrap();
describe("UserModel", () => {
  const func1 = (no: number) => {
    return async () => {
      await runWithMockContext(async () => {
        const db = BaseModel.getPuri("w");
        await db.transaction(async (trx) => {
          const user = await UserModel.findById("A", 1);
          expect(user.username).toBe("Minsang Kim");
          expect(true).toBe(true);

          // @ts-ignore: unused
          const res1 = await trx.table("users").insert({
            username: `testuser${no}`,
            email: `testuser${no}@test.com`,
            password: "testpassword",
            role: "normal",
          });
          // @ts-ignore: unused
          const resDelete = await trx.table("users").where("id", 1).delete();

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
        Naite.expect("esq-query").toBe(
          "select `users`.`id` as `id`, `users`.`username` as `username`, `users`.`role` as `role`, `users`.`bio` as `bio`, `users`.`is_verified` as `is_verified`, `employee__department`.`name` as `employee__department__name`, `employee`.`salary` as `employee__salary` from `users` inner join `employees` as `employee` on `users`.`id` = `employee`.`user_id` inner join `departments` as `employee__department` on `employee`.`department_id` = `employee__department`.`id` where `users`.`id` in (1) order by `users`.`id` desc",
        );
        Naite.expect("esq-query").toContain("where `users`.`id` in (1)");
      });
    };
  };
  range(0, 1).map(async (i) => {
    test(`Testing#${i + 1}`, func1(i));
  });

  test("testNaite", async () => {
    await runWithMockContext(async () => {
      // 메서드 자체는 의도된 에러 상황
      await notImpl(UserModel.testNaite);

      // 하지만 에러 발생 전에 기록된 로깅은 유지됨
      Naite.expect("testArray").toEqual([1, 2, 3]);
      Naite.expect("testObjectArray").toEqual([
        { a: 1, b: 2 },
        { a: 3, b: 4 },
      ]);
    });
  });

  test("should get my IP", async () => {
    expect(false).toBe(false);
  });
});

export async function notImpl(fn: () => Promise<void>) {
  return await expect(fn).rejects.toThrow("Not implemented");
}
