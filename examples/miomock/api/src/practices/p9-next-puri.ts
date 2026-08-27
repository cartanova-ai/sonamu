import chalk from "chalk";
import { BaseModel, Puri, Sonamu } from "sonamu";

Sonamu.runScript(async () => {
  const puri = BaseModel.getPuri("r");

  // Test: from
  const test1 = puri.from({ users: "users" });
  expectAndLog("select * from `users`", test1.toQuery());

  // Test: select with alias
  const test3 = puri.from({ users: "users" }).select({
    id: "users.id",
    username: "users.username",
  });
  const t3Result = await test3;
  void t3Result;
  expectAndLog(
    "select `u`.`id` as `id`, `u`.`name` as `name` from `users` as `u`",
    test3.toQuery(),
  );

  // Test: select 타입 체크
  type Test4Result = Awaited<typeof test3>[0];
  // 예상: { id: string, username: string }
  const test4Check: Test4Result = {
    id: "1",
    username: "test",
    // @ts-expect-error - email은 select 안 했으므로 없어야 함
    email: "test@test.com",
  };
  void test4Check;

  // Test: where
  const test5 = puri.from({ users: "users" }).where({ "users.role": "normal" });
  expectAndLog(
    "select `users`.`id` as `id`, `users`.`name` as `name` from `users` where `users`.`bio` = 'abcddd'",
    test5.toQuery(),
  );

  // Test: where with group
  const test6 = puri.from({ users: "users" }).whereGroup((group) => {
    group.where({
      "users.id": "10",
    });
    group.orWhere("users.id", ">", "10");
    group.orWhere("users.id", "<", "20");
  });
  expectAndLog(
    "select `users`.`id` as `id`, `users`.`name` as `name` from `users` where `users`.`id` > 10 or `users`.`id` < 20",
    test6.toQuery(),
  );

  // Test: join
  const test7 = puri.from({ users: "users" }).join("employees", "users.id", "employees.user_id");
  expectAndLog(
    "select `users`.`id` as `id`, `users`.`name` as `name` from `users` join `employees` on `users`.`id` = `employees`.`user_id`",
    test7.toQuery(),
  );

  // test: join with callback
  const test8 = puri
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
    test8.toQuery(),
  );

  // test: join with subquery
  const sq = puri.from({ users: "users" }).select({
    id: "users.id",
    username: "users.username",
  });
  const test9Result = puri
    .from({ users: "users" })
    .join({ c: sq }, "users.id", "c.id")
    .where("c.username", "test");
  void test9Result;

  // test: join with subquery and callback
  const test10Result = puri.from("users").join({ c: sq }, (j) => {
    j.on("users.username", "c.username");
    j.orOn("users.id", "c.id");
  });
  void test10Result;

  // test: select with sql expression
  puri.from({ users: "users" }).select({
    id: "users.id",
    username: "users.username",
    salary: Puri.sum("users.salary"),
    aa: Puri.rawString("users.username"),
    dd: Puri.rawDate("users.created_at"),
    cc: Puri.rawBoolean("users.is_active"),
  });

  // // test: where match
  // const test12 = puri.from({ users: "users" }).whereMatch("users.bio", "test");
  // expectAndLog(
  //   "select `users`.`id` as `id`, `users`.`name` as `name` from `users` where MATCH (`users`.`bio`) AGAINST ('test')",
  //   test12.toQuery(),
  // );

  // test: order by (ResultAvailableColumns)
  const test13 = puri
    .from({ users: "users" })
    .select({
      aa: "users.id",
    })
    .orderBy("aa", "desc");
  expectAndLog(
    "select `users`.`id` as `id`, `users`.`name` as `name` from `users` order by `users`.`id` asc",
    test13.toQuery(),
  );

  // test: pluck
  const test14 = puri.from({ users: "users" }).pluck("id");
  const t14Result = await test14;
  void t14Result;

  // test: insert
  const test15Result = puri.from({ users: "users" }).insert({
    email: "test@test.com",
    username: "test",
    password: "test",
    role: "normal",
  });
  void test15Result;

  // test: join 상황에서 insert 시도시 불가
  // @ts-expect-error - unused
  const test16Result = puri.from("users").insert({
    bio: "aa",
  });
  void test16Result;

  // test: JOIN 후 업데이트
  const test17Result = puri
    .from({ u: "users" })
    .join({ e: "employees" }, "u.id", "e.user_id")
    .update({
      "u.bio": "aa",
      "e.id": 1,
      "e.salary": "10000",
    });
  void test17Result;
});

function expectAndLog(expected: string, actual: string) {
  if (expected !== actual) {
    console.error(`Expected: ${chalk.yellow(expected)}\nbut got [${chalk.red(actual)}]`);
  } else {
    console.log(chalk.green(`TEST PASSED: ${chalk.yellow(expected)}`));
  }
}
