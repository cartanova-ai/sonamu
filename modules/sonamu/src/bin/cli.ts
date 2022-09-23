/* Global Begin */
import chalk from "chalk";
console.log(chalk.bgBlue(`BEGIN ${new Date()}`));

import dotenv from "dotenv";
dotenv.config();

import path from "path";
import { BaseModel } from "../database/base-model";
import { DB } from "../database/db";
import { SMDManager } from "../smd/smd-manager";
import { Migrator } from "../smd/migrator";
import { Syncer } from "../syncer/syncer";
import { FixtureManager } from "../testing/fixture-manager";

let migrator: Migrator;
let fixtureManager: FixtureManager;

async function bootstrap() {
  // appRootPath 셋업
  const appRootPath = path.resolve(process.cwd(), "..");
  Syncer.getInstance({
    appRootPath,
  });
  await DB.readKnexfile(appRootPath);

  const [_0, _1, action, ...args] = process.argv;
  switch (action) {
    case "migrate":
      await migrate(args[0] as MigrateSubAction);
      break;
    case "fixture":
      await fixture(args[0] as FixtureSubAction, args.slice(1));
      break;
    default:
      throw new Error(`Unknown action ${action}`);
  }
}
bootstrap().finally(async () => {
  if (migrator) {
    await migrator.destroy();
  }
  if (fixtureManager) {
    await fixtureManager.destory();
  }
  await BaseModel.destroy();

  /* Global End */
  console.log(chalk.bgBlue(`END ${new Date()}\n`));
});

type MigrateSubAction = "run" | "rollback" | "reset" | "clear";
async function migrate(subAction: MigrateSubAction) {
  await SMDManager.autoload();

  // migrator
  migrator = new Migrator({
    appRootPath: Syncer.getInstance().config.appRootPath,
    knexfile: DB.getKnexfile(),
    mode: "dev",
  });

  switch (subAction) {
    case "run":
      await migrator.cleanUpDist();
      await migrator.run();
      break;
    case "rollback":
      await migrator.rollback();
      break;
    case "clear":
      await migrator.clearPendingList();
      break;
    case "reset":
      await migrator.resetAll();
      break;
    default:
      throw new Error(`Unknown subAction - ${subAction}`);
  }
}

type FixtureSubAction = "import" | "sync";
async function fixture(subAction: FixtureSubAction, extras?: string[]) {
  await SMDManager.autoload();

  fixtureManager = new FixtureManager();

  switch (subAction) {
    case "import":
      if (!extras || Array.isArray(extras) === false || extras.length !== 2) {
        throw new Error("Import 대상 smdId와 id가 필요합니다.");
      }
      const [smdId, idsString] = extras;
      let ids: number[] = [];
      if (idsString.includes(",")) {
        ids = idsString
          .split(",")
          .map((idString) => Number(idString))
          .filter((id) => Number.isNaN(id) === false);
      } else {
        ids = [Number(idsString)];
      }
      if (smdId === undefined || idsString === undefined || ids.length === 0) {
        throw new Error("잘못된 입력");
      }
      await fixtureManager.importFixture(smdId, ids);
      await fixtureManager.sync();
      break;
    case "sync":
      await fixtureManager.sync();
      break;
    default:
      throw new Error(`Unknown subAction - ${subAction}`);
  }
}
