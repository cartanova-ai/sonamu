import { BaseModelClass, Sonamu, transactional } from "sonamu";

class TrxModelClass extends BaseModelClass {
  modelName = "TrxModel";

  @transactional()
  async test1(): Promise<void> {
    const wdb = this.getPuri("w");

    console.log("[test1]");
    await wdb.debugTransaction();

    return await wdb.transaction(async (trx1) => {
      console.log("[test1] trx1");
      await trx1.debugTransaction();
      return await trx1.transaction(async (trx2) => {
        console.log("[test1] trx2");
        await trx2.debugTransaction();
        return await trx2.transaction(async (trx3) => {
          console.log("[test1] trx3");
          await trx3.debugTransaction();

          await this.test2();

          return;
        });
      });
    });
  }

  async test2(): Promise<void> {
    const wdb = this.getPuri("w");
    console.log("[test2]");
    await wdb.debugTransaction();

    return await wdb.transaction(async (trx) => {
      console.log("[test2] trx");
      await trx.debugTransaction();
      return;
    });
  }

  async test3(): Promise<void> {
    const wdb = this.getPuri("w");
    console.log("[test3]");
    await wdb.debugTransaction();
    return await wdb.transaction(async (trx) => {
      console.log("[test3] trx");
      await trx.debugTransaction();
      return await this.test4();
    });
  }

  async test4(): Promise<void> {
    const wdb = this.getPuri("w");
    console.log("[test4]");
    await wdb.debugTransaction();
    return await wdb.transaction(async (trx) => {
      console.log("[test4] trx");
      await trx.debugTransaction();
      return;
    });
  }

  async test5(): Promise<void> {
    const wdb = this.getPuri("w");
    console.log("[test5]");

    await wdb.transaction(async (trx) => {
      console.log("[test5] trx");
      await trx.debugTransaction();
      await trx.transaction(async (trx2) => {
        console.log("[test5] trx2");
        await trx2.debugTransaction();
        await trx2.transaction(async (trx3) => {
          console.log("[test5] trx3");
          await trx3.debugTransaction();
        });
        // trx2의 savepoint만 롤백
        await trx2.rollback();
      });
      await trx.debugTransaction();
    });
  }
}

const TrxModel = new TrxModelClass();

async function run() {
  await Sonamu.init(true, false);

  // nested transaction with @transactional decorator
  console.log("nested transaction with @transactional decorator");
  await TrxModel.test1();
  console.log("--------------------------------");

  // nested transaction without @transactional decorator
  console.log("nested transaction without @transactional decorator");
  await TrxModel.test3();
  console.log("--------------------------------");

  // rollback transaction
  console.log("rollback transaction");
  await TrxModel.test5();
  console.log("--------------------------------");
}

if (require.main === module) {
  run().finally(async () => {
    await Sonamu.destroy();
  });
}
