import { DatabaseSchemaExtend, DB, Sonamu } from "sonamu";
import { Nuri, NuriWrapper } from "./nuri/nuri";
import chalk from "chalk";

Sonamu.runScript(async () => {
  const knex = DB.getDB("r");
  const nuri = new NuriWrapper<DatabaseSchemaExtend>(knex);

  // Test: from
  const test1 = nuri.from({ users: "users" });
  expectAndLog("select * from `users`", test1.toQuery());

  // Test: select with alias
  const test3 = nuri.from({ users: "users" }).select({
    id: "users.id",
    username: "users.username",
  });
  expectAndLog(
    "select `u`.`id` as `id`, `u`.`name` as `name` from `users` as `u`",
    test3.toQuery()
  );
  type Test3Result = Awaited<typeof test3>[0];

  // Test: select 타입 체크
  type Test4Result = Awaited<typeof test3>[0];
  // 예상: { id: number, username: string }
  // @ts-ignore - unused
  const test4Check: Test4Result = {
    id: 1,
    username: "test",
    // @ts-expect-error - email은 select 안 했으므로 없어야 함
    email: "test@test.com",
  };

  // Test: where
  const test5 = nuri.from({ users: "users" }).where({ "users.role": "normal" });
  expectAndLog(
    "select `users`.`id` as `id`, `users`.`name` as `name` from `users` where `users`.`bio` = 'abcddd'",
    test5.toQuery()
  );

  // Test: where with group
  const test6 = nuri.from({ users: "users" }).whereGroup((group) => {
    group.where({
      "users.id": 10,
    });
    group.orWhere("users.id", ">", 10);
    group.orWhere("users.id", "<", 20);
  });
  expectAndLog(
    "select `users`.`id` as `id`, `users`.`name` as `name` from `users` where `users`.`id` > 10 or `users`.`id` < 20",
    test6.toQuery()
  );

  // Test: join
  const test7 = nuri
    .from({ users: "users" })
    .join("employees", "users.id", "employees.user_id");
  expectAndLog(
    "select `users`.`id` as `id`, `users`.`name` as `name` from `users` join `employees` on `users`.`id` = `employees`.`user_id`",
    test7.toQuery()
  );

  // test: join with callback
  const test8 = nuri
    .from({ users: "users" })
    .join("employees", (j) => {
      j.on("users.id", "employees.user_id");
    })
    .join({ c: "companies" }, (j) => {
      j.on("employees.id", "c.id");
      j.orOn("employees.user_id", "c.name");
    });
  expectAndLog(
    "select `users`.`id` as `id`, `users`.`name` as `name` from `users` join `employees` on `users`.`id` = `employees`.`user_id`",
    test8.toQuery()
  );

  // test: join with subquery
  const sq = nuri.from({ users: "users" }).select({
    id: "users.id",
    username: "users.username",
  });
  const test9 = nuri
    .from({ users: "users" })
    .join({ c: sq }, "users.id", "c.id")
    .where("c.username", "test");

  // test: join with subquery and callback
  const test10 = nuri.from("users").join({ c: sq }, (j) => {
    j.on("users.username", "c.username");
    j.orOn("users.id", "c.id");
  });

  // test: select with sql expression
  const test11 = nuri.from({ users: "users" }).select({
    id: "users.id",
    username: "users.username",
    salary: Nuri.sum("users.salary"),
    aa: Nuri.rawString("users.username"),
    dd: Nuri.rawDate("users.created_at"),
    cc: Nuri.rawBoolean("users.is_active"),
  });
  type T11 = Awaited<typeof test11>[0];
});

function expectAndLog(expected: string, actual: string) {
  if (expected !== actual) {
    console.error(
      `Expected: ${chalk.yellow(expected)}\nbut got [${chalk.red(actual)}]`
    );
  } else {
    console.log(chalk.green(`TEST PASSED: ${chalk.yellow(expected)}`));
  }
}
