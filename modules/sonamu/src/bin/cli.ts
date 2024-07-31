/* Global Begin */
import chalk from "chalk";
console.log(chalk.bgBlue(`BEGIN ${new Date()}`));

import dotenv from "dotenv";
dotenv.config();

import path from "path";
import { BaseModel } from "../database/base-model";
import { EntityManager } from "../entity/entity-manager";
import { Migrator } from "../entity/migrator";
import { FixtureManager } from "../testing/fixture-manager";
import { tsicli } from "tsicli";
import { execSync } from "child_process";
import fs from "fs-extra";
import { Sonamu } from "../api";
import knex, { Knex } from "knex";
import inflection from "inflection";
import prettier from "prettier";
import { SMDManager } from "../smd/smd-manager";
import process from "process";

let migrator: Migrator;

async function bootstrap() {
  await Sonamu.init(false, false);

  await tsicli(process.argv, {
    types: {
      "#entityId": {
        type: "autocomplete",
        name: "#entityId",
        message: "Please input #entityId",
        choices: EntityManager.getAllParentIds().map((entityId) => ({
          title: entityId,
          value: entityId,
        })),
      },
      "#recordIds": "number[]",
      "#name": "string",
    },
    args: [
      ["fixture", "init"],
      ["fixture", "import", "#entityId", "#recordIds"],
      ["fixture", "sync"],
      ["migrate", "run"],
      ["migrate", "check"],
      ["migrate", "rollback"],
      ["migrate", "reset"],
      ["migrate", "clear"],
      ["stub", "practice", "#name"],
      ["stub", "entity", "#name"],
      ["scaffold", "model", "#entityId"],
      ["scaffold", "model_test", "#entityId"],
      ["scaffold", "view_list", "#entityId"],
      ["scaffold", "view_form", "#entityId"],
      ["ui"],
      ["smd_migration"],
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
      stub_entity,
      scaffold_model,
      scaffold_model_test,
      ui,
      // scaffold_view_list,
      // scaffold_view_form,
      smd_migration,
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
        chalk.yellow(`${label}: Database "${conn.database}" Already exists`)
      );
      await db.destroy();
      continue;
    }

    console.log(`SYNC to ${label}...`);
    const mysqlCmd = `mysql -h${conn.host} -u${conn.user} -p${conn.password}`;
    execSync(`${mysqlCmd} -e 'DROP DATABASE IF EXISTS \`${conn.database}\`'`);
    execSync(`${mysqlCmd} -e 'CREATE DATABASE \`${conn.database}\`'`);
    execSync(`${mysqlCmd} ${conn.database} < ${dumpFilename}`);

    // 3. knex migration 정보 복사
    await Promise.all(
      ["knex_migrations", "knex_migrations_lock"].map(async (tableName) => {
        const [table] = await db.raw(
          `SHOW TABLES FROM \`${srcConn.database}\` LIKE '${tableName}'`
        );
        if (table?.length) {
          await db.raw(
            `INSERT INTO \`${conn.database}\`.${tableName}
          SELECT * FROM \`${srcConn.database}\`.${tableName}`
          );
        }
      })
    );

    await db.destroy();
  }
}

async function fixture_import(entityId: string, recordIds: number[]) {
  await setupFixtureManager();

  await FixtureManager.importFixture(entityId, recordIds);
  await FixtureManager.sync();
}

async function fixture_sync() {
  await setupFixtureManager();

  await FixtureManager.sync();
}

async function stub_practice(name: string) {
  const practiceDir = path.join(Sonamu.apiRootPath, "src", "practices");
  const fileNames = fs.readdirSync(practiceDir);

  const maxSeqNo = (() => {
    if (fs.existsSync(practiceDir) === false) {
      fs.mkdirSync(practiceDir, { recursive: true });
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
  fs.writeFileSync(dstPath, code);

  execSync(`code ${dstPath}`);

  const runCode = `yarn node -r source-map-support/register dist/practices/${fileName.replace(
    ".ts",
    ".js"
  )}`;
  console.log(`${chalk.blue(runCode)} copied to clipboard.`);
  execSync(`echo "${runCode}" | pbcopy`);
}

async function stub_entity(entityId: string) {
  await Sonamu.syncer.createEntity({ entityId });
}

async function scaffold_model(entityId: string) {
  await Sonamu.syncer.generateTemplate("model", {
    entityId,
  });
}

async function scaffold_model_test(entityId: string) {
  await Sonamu.syncer.generateTemplate("model_test", {
    entityId,
  });
}

async function ui() {
  try {
    const sonamuUI: {
      startServers: (appRootPath: string) => void;
    } = await import("@sonamu-kit/ui" as string);
    sonamuUI.startServers(Sonamu.apiRootPath);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("isn't declared")) {
      console.log(`You need to install ${chalk.blue(`@sonamu-kit/ui`)} first.`);
      return;
    }
    throw e;
  }
}

async function smd_migration() {
  await SMDManager.autoload();
  const smdIds = SMDManager.getAllIds();

  function enumLabelsToEntityEnums(
    entityId: string,
    enumLabels: {
      [enumName: string]: { [name: string]: { ko: string } };
    }
  ): { [enumName: string]: { [name: string]: string } } {
    return Object.fromEntries(
      Object.entries(enumLabels).map(([enumLabelName, enumLabel]) => {
        const enumName =
          entityId + inflection.camelize(enumLabelName.toLowerCase(), false);
        return [
          enumName,
          Object.fromEntries(
            Object.entries(enumLabel).map(([name, { ko }]) => [name, ko])
          ),
        ];
      })
    );
  }
  for await (const smdId of smdIds) {
    const smd = SMDManager.get(smdId);
    const entityJson = {
      id: smd.id,
      ...(smd.parentId && { parentId: smd.parentId }),
      title: smd.title,
      props: smd.props,
      indexes: smd.indexes,
      subsets: smd.subsets,
      enums: enumLabelsToEntityEnums(smd.id, smd.enumLabels),
    };

    const parentNames = SMDManager.getNamesFromId(smd.parentId ?? smd.id);
    const names = SMDManager.getNamesFromId(smd.id);
    const dstPath = path.join(
      Sonamu.apiRootPath,
      "src",
      "application",
      parentNames.fs,
      `${names.fs}.entity.json`
    );

    const formatted = await prettier.format(JSON.stringify(entityJson), {
      parser: "json",
    });
    fs.writeFileSync(dstPath, formatted);
    console.log(chalk.blue(`CREATED: ${dstPath}`));

    // smd.ts, enums.ts, genereated.ts 삭제 (트랜스파일 된 js파일도 삭제)
    const srcSmdPath = path.join(
      Sonamu.apiRootPath,
      "src",
      "application",
      parentNames.fs,
      `${names.fs}.smd.ts`
    );
    const dstSmdPath = srcSmdPath
      .replace("/src/", "/dist/")
      .replace(/\.ts$/, ".js");
    const srcEnumsPath = path.join(
      Sonamu.apiRootPath,
      "src",
      "application",
      parentNames.fs,
      `${names.fs}.enums.ts`
    );
    const dstEnumsPath = srcEnumsPath
      .replace("/src/", "/dist/")
      .replace(/\.ts$/, ".js");
    const srcGeneratedPath = path.join(
      Sonamu.apiRootPath,
      "src",
      "application",
      parentNames.fs,
      `${names.fs}.generated.ts`
    );
    const dstGeneratedPath = srcGeneratedPath
      .replace("/src/", "/dist/")
      .replace(/\.ts$/, ".js");

    [
      srcSmdPath,
      dstSmdPath,
      srcEnumsPath,
      dstEnumsPath,
      ...Sonamu.config.sync.targets.map((target) =>
        srcEnumsPath
          .replace(Sonamu.apiRootPath, path.join(Sonamu.appRootPath, target))
          .replace("/src/application/", "/src/services/")
      ),
      srcGeneratedPath,
      dstGeneratedPath,
    ].map((p) => {
      if (fs.existsSync(p) === false) {
        console.log(chalk.yellow(`NOT FOUND: ${p}`));
        return;
      }
      fs.unlinkSync(p);
      console.log(chalk.red(`DELETED: ${p}`));
    });
  }

  // Entity로 reload
  console.log("Entity로 다시 로드합니다.");
  EntityManager.isAutoloaded = false;
  await EntityManager.autoload();

  // Entity를 통해 generated.ts 재생성
  const entityIds = EntityManager.getAllParentIds();
  for await (const entityId of entityIds) {
    await Sonamu.syncer.generateTemplate("generated", { entityId });
  }
}
