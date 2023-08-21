/* Global Begin */
import chalk from "chalk";
console.log(chalk.bgBlue(`BEGIN ${new Date()}`));

import dotenv from "dotenv";
dotenv.config();

import path from "path";
import { BaseModel } from "../database/base-model";
import { SMDManager } from "../smd/smd-manager";
import { Migrator } from "../smd/migrator";
import { FixtureManager } from "../testing/fixture-manager";
import { tsicli } from "tsicli";
import { execSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import { Sonamu } from "../api";
import knex, { Knex } from "knex";

let migrator: Migrator;

async function bootstrap() {
  await Sonamu.init();

  await tsicli(process.argv, {
    types: {
      "#smdId": {
        type: "autocomplete",
        name: "#smdId",
        message: "Please input #smdId",
        choices: SMDManager.getAllParentIds().map((smdId) => ({
          title: smdId,
          value: smdId,
        })),
      },
      "#recordIds": "number[]",
      "#name": "string",
    },
    args: [
      ["fixture", "init"],
      ["fixture", "import", "#smdId", "#recordIds"],
      ["fixture", "sync"],
      ["migrate", "run"],
      ["migrate", "check"],
      ["migrate", "rollback"],
      ["migrate", "reset"],
      ["migrate", "clear"],
      ["stub", "practice", "#name"],
      ["stub", "smd", "#name"],
      ["scaffold", "model", "#smdId"],
      ["scaffold", "model_test", "#smdId"],
      ["scaffold", "view_list", "#smdId"],
      ["scaffold", "view_form", "#smdId"],
      ["ui"],
    ],
    runners: {
      migrate_run,
      migrate_check,
      migrate_rollback,
      migrate_clear,
      migrate_reset,
      fixture_init,
      fixture_import,
      fixture_sync,
      stub_practice,
      stub_smd,
      scaffold_model,
      scaffold_model_test,
      ui,
      // scaffold_view_list,
      // scaffold_view_form,
    },
  });
}
bootstrap().finally(async () => {
  if (migrator) {
    await migrator.destroy();
  }
  await FixtureManager.destory();
  await BaseModel.destroy();

  /* Global End */
  console.log(chalk.bgBlue(`END ${new Date()}\n`));
});

async function setupMigrator() {
  // migrator
  migrator = new Migrator({
    mode: "dev",
  });
}

async function setupFixtureManager() {
  FixtureManager.init();
}

async function migrate_run() {
  await setupMigrator();

  await migrator.cleanUpDist();
  await migrator.run();
}

async function migrate_check() {
  await setupMigrator();

  await migrator.cleanUpDist();
  await migrator.check();
}

async function migrate_rollback() {
  await setupMigrator();

  await migrator.rollback();
}

async function migrate_clear() {
  await setupMigrator();

  await migrator.clearPendingList();
}

async function migrate_reset() {
  await setupMigrator();

  await migrator.resetAll();
}

async function fixture_init() {
  const srcConfig = Sonamu.dbConfig.development_master;
  const targets = [
    {
      label: "(REMOTE) Fixture DB",
      config: Sonamu.dbConfig.fixture_remote,
    },
    {
      label: "(LOCAL) Fixture DB",
      config: Sonamu.dbConfig.fixture_local,
      toSkip: (() => {
        const remoteConn = Sonamu.dbConfig.fixture_remote
          .connection as Knex.ConnectionConfig;
        const localConn = Sonamu.dbConfig.fixture_local
          .connection as Knex.ConnectionConfig;
        return (
          remoteConn.host === localConn.host &&
          remoteConn.database === localConn.database
        );
      })(),
    },
    {
      label: "(LOCAL) Testing DB",
      config: Sonamu.dbConfig.test,
    },
  ] as {
    label: string;
    config: Knex.Config;
    toSkip?: boolean;
  }[];

  // 1. 기준DB 스키마를 덤프
  console.log("DUMP...");
  const dumpFilename = `/tmp/sonamu-fixture-init-${Date.now()}.sql`;
  const srcConn = srcConfig.connection as Knex.ConnectionConfig;
  execSync(
    `mysqldump -h${srcConn.host} -u${srcConn.user} -p${srcConn.password} --single-transaction -d --no-create-db --triggers ${srcConn.database} > ${dumpFilename}`
  );

  // 2. 대상DB 각각에 대하여 존재여부 확인 후 붓기
  for await (const { label, config, toSkip } of targets) {
    const conn = config.connection as Knex.ConnectionConfig;

    if (toSkip === true) {
      console.log(chalk.red(`${label}: Skipped!`));
      continue;
    }

    const db = knex({
      ...config,
      connection: {
        ...((config.connection ?? {}) as Knex.ConnectionConfig),
        database: undefined,
      },
    });
    const [[row]] = await db.raw(`SHOW DATABASES LIKE "${conn.database}"`);
    if (row) {
      console.log(
        chalk.yellow(`${label}: Database "${conn.database} Already exists`)
      );
      await db.destroy();
      continue;
    }

    console.log(`SYNC to ${label}...`);
    const mysqlCmd = `mysql -h${conn.host} -u${conn.user} -p${conn.password}`;
    execSync(`${mysqlCmd} -e 'DROP DATABASE IF EXISTS ${conn.database}'`);
    execSync(`${mysqlCmd} -e 'CREATE DATABASE ${conn.database}'`);
    execSync(`${mysqlCmd} ${conn.database} < ${dumpFilename}`);

    await db.destroy();
  }
}

async function fixture_import(smdId: string, recordIds: number[]) {
  await setupFixtureManager();

  await FixtureManager.importFixture(smdId, recordIds);
  await FixtureManager.sync();
}

async function fixture_sync() {
  await setupFixtureManager();

  await FixtureManager.sync();
}

async function stub_practice(name: string) {
  const practiceDir = path.join(Sonamu.apiRootPath, "src", "practices");
  const fileNames = readdirSync(practiceDir);

  const maxSeqNo = (() => {
    if (existsSync(practiceDir) === false) {
      mkdirSync(practiceDir, { recursive: true });
    }

    const filteredSeqs = fileNames
      .filter(
        (fileName) => fileName.startsWith("p") && fileName.endsWith(".ts")
      )
      .map((fileName) => {
        const [, seqNo] = fileName.match(/^p([0-9]+)\-/) ?? ["0", "0"];
        return parseInt(seqNo);
      })
      .sort((a, b) => b - a);

    if (filteredSeqs.length > 0) {
      return filteredSeqs[0];
    }

    return 0;
  })();

  const currentSeqNo = maxSeqNo + 1;
  const fileName = `p${currentSeqNo}-${name}.ts`;
  const dstPath = path.join(practiceDir, fileName);

  const code = [
    `import { BaseModel } from "sonamu";`,
    "",
    `console.clear();`,
    `console.log("${fileName}");`,
    "",
    `async function bootstrap() {`,
    ` // TODO`,
    `}`,
    `bootstrap().finally(async () => {`,
    `await BaseModel.destroy();`,
    `});`,
  ].join("\n");
  writeFileSync(dstPath, code);

  execSync(`code ${dstPath}`);

  const runCode = `yarn node -r source-map-support/register dist/practices/${fileName.replace(
    ".ts",
    ".js"
  )}`;
  console.log(`${chalk.blue(runCode)} copied to clipboard.`);
  execSync(`echo "${runCode}" | pbcopy`);
}

async function stub_smd(name: string) {
  await Sonamu.syncer.generateTemplate("smd", {
    smdId: name,
  });
}

async function scaffold_model(smdId: string) {
  await Sonamu.syncer.generateTemplate("model", {
    smdId,
  });
}

async function scaffold_model_test(smdId: string) {
  await Sonamu.syncer.generateTemplate("model_test", {
    smdId,
  });
}

async function ui() {
  try {
    const sonamuUI = await import("@sonamu-kit/ui" as any);
    sonamuUI.startServers(Sonamu.appRootPath);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("isn't declared")) {
      console.log(`You need to install ${chalk.blue(`@sonamu-kit/ui`)} first.`);
      return;
    }
    throw e;
  }
}
