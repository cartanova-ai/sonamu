import { BaseModel, Sonamu } from "sonamu";

Sonamu.runScript(async () => {
  const puri = BaseModel.getPuri("w");

  await puri.transaction(async (trx) => {
    // increment
    await trx.table("employees").where("id", 1).increment("department_id", 1000).debug();

    // decrement
    await trx.table("employees").where("id", 1).decrement("department_id", 1000).debug();

    // where절 object
    await trx
      .table("employees")
      .where({
        id: 1,
        employee_number: "333",
      })
      .debug();

    // rollback
    await trx.rollback();
  });
});
