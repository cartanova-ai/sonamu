import chalk from "chalk";
import dotenv from "dotenv";
dotenv.config();

import path from "path";
import { createRequire } from "module";
import { tsicli } from "tsicli";
import { execSync, spawn } from "child_process";
import { mkdir, readdir, writeFile } from "fs/promises";
import { exists } from "../utils/fs-utils";
import process from "process";
import { Sonamu } from "../api";
import knex, { Knex } from "knex";
import { EntityManager } from "../entity/entity-manager";
import { Migrator } from "../migration/migrator";
import { FixtureManager } from "../testing/fixture-manager";
import { findApiRootPath } from "../utils/utils";

let migrator: Migrator;

async function bootstrap() {
  // dev 명령어가 아닌 경우에만 Sonamu 초기화
  if (process.argv[2] !== "dev") {
    await Sonamu.init(false, false);
  }

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
      ["dev"],
      ["start"],
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
      dev,
      start,
    },
  });
}
bootstrap().finally(async () => {
  if (migrator) {
    await migrator.destroy();
  }
  await FixtureManager.destroy();
});

async function dev() {
  const apiRoot = findApiRootPath();
  const entryPoint = "src/index.ts";

  console.log(chalk.yellow.bold("🚀 Starting Sonamu dev server...\n"));

  const serverProcess = spawn(
    "hot-runner",
    [
      "--clear-screen=false",
      "--node-args=--import=@sonamu-kit/loader",
      "--node-args=--import=sonamu/hot-hook-register",
      "--node-args=--enable-source-maps",
      entryPoint,
    ],
    {
      cwd: apiRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "development",
        HOT: "yes",
        API_ROOT_PATH: apiRoot,
      },
    },
  );

  // 종료 처리
  const cleanup = () => {
    console.log(chalk.yellow("\n\n👋 Shutting down..."));
    serverProcess.kill("SIGTERM");
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  serverProcess.on("exit", (code) => {
    if (code !== 0) {
      console.error(chalk.red(`❌ Server exited with code ${code}`));
      process.exit(code || 1);
    }
  });
}

async function start() {
  const entryPoint = "dist/index.js";

  if (!(await exists(entryPoint))) {
    console.log(chalk.red(`${entryPoint} not found. Please build your project first.`));
    console.log(chalk.blue("Run: yarn sonamu build"));
    return;
  }

  const { spawn } = await import("child_process");
  const serverProcess = spawn("node", ["--enable-source-maps", "-r", "dotenv/config", entryPoint], {
    cwd: Sonamu.apiRootPath,
    stdio: "inherit",
  });

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

  await migrator.run();
}

async function migrate_check() {
  await setupMigrator();

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
        const remoteConn = Sonamu.dbConfig.fixture_remote.connection as Knex.ConnectionConfig;
        const localConn = Sonamu.dbConfig.fixture_local.connection as Knex.ConnectionConfig;
        return remoteConn.host === localConn.host && remoteConn.database === localConn.database;
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
    `mysqldump -h${srcConn.host} -u${srcConn.user} -p${srcConn.password} --single-transaction -d --no-create-db --triggers ${srcConn.database} > ${dumpFilename}`,
  );
  const _db = knex(srcConfig);
  const [[migrations]] = await _db.raw(
    "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = ? AND table_name = 'knex_migrations'",
    [srcConn.database],
  );
  if (migrations.count > 0) {
    execSync(
      `mysqldump -h${srcConn.host} -u${srcConn.user} -p${srcConn.password} --single-transaction --no-create-db --triggers ${srcConn.database} knex_migrations knex_migrations_lock > ${migrationsDump}`,
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
      console.log(chalk.yellow(`${label}: Database "${conn.database}" Already exists`));
      await db.destroy();
      continue;
    }

    console.log(`SYNC to ${label}...`);
    const mysqlCmd = `mysql -h${conn.host} -u${conn.user} -p${conn.password}`;
    execSync(`${mysqlCmd} -e 'DROP DATABASE IF EXISTS \`${conn.database}\`'`);
    execSync(`${mysqlCmd} -e 'CREATE DATABASE \`${conn.database}\`'`);
    execSync(`${mysqlCmd} ${conn.database} < ${dumpFilename}`);
    if (await exists(migrationsDump)) {
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
  const fileNames = await readdir(practiceDir);

  const maxSeqNo = await (async () => {
    if (!(await exists(practiceDir))) {
      await mkdir(practiceDir, { recursive: true });
    }

    const filteredSeqs = fileNames
      .filter((fileName) => fileName.startsWith("p") && fileName.endsWith(".ts"))
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
    `import { Sonamu } from "sonamu";`,
    "",
    `console.clear();`,
    `console.log("${fileName}");`,
    "",
    `Sonamu.runScript(async () => {`,
    ` // TODO`,
    `});`,
    "",
  ].join("\n");
  await writeFile(dstPath, code);

  execSync(`code ${dstPath}`);

  const runCode = `yarn node -r dotenv/config --enable-source-maps dist/practices/${fileName.replace(
    ".ts",
    ".js",
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
    // 사용자 프로젝트의 패키지들 중에서 @sonamu-kit/ui를 찾습니다.
    // 이를 위해서 createRequire를 사용하여 프로젝트 경로 기준으로 resolve합니다.
    const projectRequire = createRequire(path.join(Sonamu.apiRootPath, "package.json"));
    const uiPackagePath = projectRequire.resolve("@sonamu-kit/ui"); // 없으면 여기서 터져요(MODULE_NOT_FOUND)
    const uiNodePath = path.join(path.dirname(uiPackagePath), "run-ui.js");

    if (!(await exists(uiNodePath))) {
      console.log(
        chalk.red(`UI runner script not found at ${uiNodePath}. Please rebuild @sonamu-kit/ui.`),
      );
      return;
    }

    // UI를 별도 프로세스로 실행 (hot-hook 활성화)
    const uiProcess = spawn(
      process.execPath,
      [
        "--import",
        "@sonamu-kit/loader",
        "--import",
        "sonamu/hot-hook-register",
        "--enable-source-maps",
        "--no-warnings",
        uiNodePath,
      ],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          HOT: "yes",
          PROJECT_NAME: Sonamu.config.projectName ?? path.basename(Sonamu.apiRootPath),
          API_ROOT_PATH: Sonamu.apiRootPath,
          UI_PORT: (Sonamu.config.ui?.port ?? 57000).toString(),
        },
      },
    );

    // 종료 처리
    const cleanup = () => {
      console.log(chalk.yellow("\n\n👋 Shutting down UI server..."));
      uiProcess.kill("SIGTERM");
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    uiProcess.on("exit", (code) => {
      if (code !== 0) {
        console.error(chalk.red(`❌ UI server exited with code ${code}`));
        process.exit(code || 1);
      }
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("isn't declared")) {
      console.log(`You need to install ${chalk.blue(`@sonamu-kit/ui`)} first.`);
      return;
    }
    throw e;
  }
}
