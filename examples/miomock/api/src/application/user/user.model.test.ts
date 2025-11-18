import { describe, test, expect, assert } from "vitest";
import { bootstrap } from "../../testing/bootstrap";
import { UserModel } from "./user.model";
import { range } from "lodash-es";
import { BaseModel } from "sonamu";

bootstrap();
describe("UserModel", () => {
  const func1 = (no: number) => {
    return async () => {
      const user = await UserModel.findById("A", 1);
      expect(user.username).toBe("Minsang Kim");
      expect(true).toBe(true);

      const db = BaseModel.getPuri("w");
      await db.transaction(async (trx) => {
        // @ts-ignore: unused
        const res1 = await trx
          .table("users")
          .insert({
            username: `testuser${no}`,
            email: `testuser${no}@test.com`,
            password: "testpassword",
            role: "normal",
          })
          .debug();
        // @ts-ignore: unused
        const resDelete = await trx.table("users").where("id", 1).delete();

        await trx.table("companies").insert({
          name: "testcompany",
        });
        const company = await trx
          .table("companies")
          .select({ id: "id" })
          .first();
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
    };
  };
  range(0, 50).map(async (i) => {
    test(`Testing#${i + 1}`, func1(i));
  });

  test("should get my IP", async () => {
    expect(false).toBe(false);
  });
});
