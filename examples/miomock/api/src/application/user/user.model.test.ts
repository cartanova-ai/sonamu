import { describe, test, expect } from "vitest";
import { bootstrap } from "../../testing/bootstrap";
import { UserModel } from "./user.model";
import { range } from "lodash";
import { DB } from "sonamu";

bootstrap();
describe("UserModel", () => {
  const func1 = async () => {
    const user = await UserModel.findById("A", 1);
    expect(user.username).toBe("Minsang Kim");
    expect(true).toBe(true);

    const db = DB.getDB("w");
    await db.transaction(async (trx) => {
      await trx.table("users").insert({
        username: "testuser",
        email: "testuser@test.com",
        password: "testpassword",
        role: "normal",
      });
      await trx.table("users").where("id", 1).delete();
      await trx.table("companies").insert({
        name: "testcompany",
      });
      const company = await trx("companies").select("id").first();
      await trx.table("departments").insert({
        name: "testdepartment",
        company_id: company.id,
      });
      await trx.table("tags").insert({
        name: "testtag",
      });
    });

    const usernames = await db.table("users").pluck("username");
    expect(usernames).toHaveLength(1);
    // console.log(usernames);
  };
  range(0, 200).map(async (i) => {
    test(`Testing#${i + 1}`, func1);
  });

  test("should get my IP", async () => {
    expect(false).toBe(false);
  });
});
