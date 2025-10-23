/* Global Begin */
import chalk from "chalk";
console.log(chalk.bgBlue(`BEGIN ${new Date()}`));

import dotenv from "dotenv";
dotenv.config();

import path from "path";
import { tsicli } from "tsicli";
import { execSync } from "child_process";
import fs from "fs";
import process from "process";
import _ from "lodash";
import { Sonamu } from "../api";
import knex, { Knex } from "knex";
import { EntityManager } from "../entity/entity-manager";
import { Migrator } from "../entity/migrator";
import { FixtureManager } from "../testing/fixture-manager";

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
      ["migrate", "status"],
      ["stub", "practice", "#name"],
      ["stub", "entity", "#name"],
      ["scaffold", "model", "#entityId"],
      ["scaffold", "model_test", "#entityId"],
      ["scaffold", "view_list", "#entityId"],
      ["scaffold", "view_form", "#entityId"],
      ["ui"],
      ["dev:serve"],
      ["serve"],
    ],
    runners: {
      migrate_run,
      migrate_check,
      migrate_rollback,
      migrate_clear,
      migrate_reset,
      migrate_status,
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
      "dev:serve": dev_serve,
      serve,
    },
  });
}
bootstrap().finally(async () => {
  if (migrator) {
    await migrator.destroy();
  }
  await FixtureManager.destory();

  /* Global End */
  console.log(chalk.bgBlue(`END ${new Date()}\n`));
});

async function dev_serve() {
  const nodemon = await import("nodemon");

  const nodemonConfig = (() => {
    const projectNodemonPath = path.join(Sonamu.apiRootPath, "nodemon.json");
    const hasProjectNodemon = fs.existsSync(projectNodemonPath);

    if (hasProjectNodemon) {
      return JSON.parse(fs.readFileSync(projectNodemonPath, "utf8"));
    }

    return {
      watch: ["src/index.ts"],
      ignore: ["dist/**", "**/*.js", "**/*.d.ts"],
      exec: [
        "swc src -d dist --strip-leading-paths --source-maps -C module.type=commonjs -C jsc.parser.syntax=typescript -C jsc.parser.decorators=true -C jsc.target=es5",
        "node -r source-map-support/register -r dotenv/config dist/index.js",
      ].join(" && "),
    };
  })();

  nodemon.default(nodemonConfig);

  // 프로세스 종료 처리
  const cleanup = async () => {
    await Sonamu.server?.close();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("SIGUSR2", cleanup);
}

async function serve() {
  const distIndexPath = path.join(Sonamu.apiRootPath, "dist", "index.js");

  if (!fs.existsSync(distIndexPath)) {
    console.log(
      chalk.red("dist/index.js not found. Please build your project first.")
    );
    console.log(chalk.blue("Run: yarn sonamu build"));
    return;
  }

  const { spawn } = await import("child_process");
  const serverProcess = spawn(
    "node",
    ["-r", "source-map-support/register", "-r", "dotenv/config", distIndexPath],
    {
      cwd: Sonamu.apiRootPath,
      stdio: "inherit",
    }
  );

  process.on("SIGINT", () => {
    serverProcess.kill("SIGTERM");
    process.exit(0);
  });
}

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

async function migrate_status() {
  await setupMigrator();

  const status = await migrator.getStatus();
  // status;
  console.log(status);
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
  const migrationsDump = `/tmp/sonamu-fixture-init-migrations-${Date.now()}.sql`;
  execSync(
    `mysqldump -h${srcConn.host} -u${srcConn.user} -p${srcConn.password} --single-transaction -d --no-create-db --triggers ${srcConn.database} > ${dumpFilename}`
  );
  const _db = knex(srcConfig);
  const [[migrations]] = await _db.raw(
    "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = ? AND table_name = 'knex_migrations'",
    [srcConn.database]
  );
  if (migrations.count > 0) {
    execSync(
      `mysqldump -h${srcConn.host} -u${srcConn.user} -p${srcConn.password} --single-transaction --no-create-db --triggers ${srcConn.database} knex_migrations knex_migrations_lock > ${migrationsDump}`
    );
  }

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
    if (fs.existsSync(migrationsDump)) {
      execSync(`${mysqlCmd} ${conn.database} < ${migrationsDump}`);
    }

    await db.destroy();
  }

  await _db.destroy();
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

  // FIXME
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
    type StartServersOptions = {
      projectName: string;
      apiRootPath: string;
      port: number;
    };
    const sonamuUI: {
      startServers: (options: StartServersOptions) => void;
    } = await import("@sonamu-kit/ui" as string);
    sonamuUI.startServers({
      projectName:
        Sonamu.config.projectName ?? path.basename(Sonamu.apiRootPath),
      apiRootPath: Sonamu.apiRootPath,
      port: Sonamu.config.ui?.port ?? 57000,
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("isn't declared")) {
      console.log(`You need to install ${chalk.blue(`@sonamu-kit/ui`)} first.`);
      return;
    }
    throw e;
  }
}
