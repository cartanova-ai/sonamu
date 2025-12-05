import chalk from "chalk";
import dotenv from "dotenv";

dotenv.config();

import { execSync, spawn } from "child_process";
import { mkdir, readdir, rm, writeFile } from "fs/promises";
import knex, { type Knex } from "knex";
import { createRequire } from "module";
import path from "path";
import process from "process";
import { tsicli } from "tsicli";
import { Sonamu } from "../api";
import type { SonamuDBConfig } from "../database/db";
import { EntityManager } from "../entity/entity-manager";
import { Migrator } from "../migration/migrator";
import { FixtureManager } from "../testing/fixture-manager";
import { exists } from "../utils/fs-utils";
import { findApiRootPath } from "../utils/utils";
import { BUILD_DIR, SWC_BUILD_COMMAND, TSC_TYPE_CHECK_COMMAND } from "./build-config";

let migrator: Migrator;

async function bootstrap() {
  const notToInit = ["dev", "build", "start"].includes(process.argv[2] ?? "");
  if (!notToInit) {
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
      ["sync"],
      ["dev"],
      ["build"],
      ["start"],
    ],
    runners: {
      migrate_status,
      migrate_run,
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
      sync,
      dev,
      build,
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

/**
 * pnpm sync 하면 실행되는 함수입니다.
 * 프로젝트를 싱크합니다.
 */
async function sync() {
  await Sonamu.syncer.sync();
}

/**
 * pnpm dev 하면 실행되는 함수입니다.
 * 프로젝트에 대해 HMR 지원하는 개발 서버를 띄워줍니다.
 *
 * TypeScript를 바로 실행할 수 있도록 @sonamu-kit/loader를,
 * HMR을 지원하기 위해 @sonamu-kit/hot-hook을 import하며,
 * 소스맵 지원을 위해 --enable-source-maps 플래그를 포함하여 실행합니다.
 *
 * 이때 @sonamu-kit/loader와 @sonamu-kit/hot-hook는 sonamu가 자체적으로 가지고 있는 dependency입니다.
 * 또한 실행에 사용하는 @sonamu-kit/hot-runner도 마찬가지로 sonamu가 자체적으로 가지고 있는 dependency입니다.
 * 따라서 사용자 프로젝트에서는 이 세 패키지를 직접 설치할 필요가 없습니다.
 *
 * Sonamu.init 없이 호출될 것을 상정하여 구현되었습니다.
 */
async function dev() {
  const apiRoot = findApiRootPath();
  const entryPoint = "src/index.ts";

  console.log(chalk.yellow.bold("🚀 Starting Sonamu dev server...\n"));

  // 이 sonamu 패키지가 dependencies로 가지고 있는 @sonamu-kit/hot-runner의 bin/run.js를 사용합니다.
  // 이 경로(/bin/run.js)는 @sonamu-kit/hot-runner의 package.json의 bin 필드에 명시되어 있는 그것과 같습니다.
  const hotRunnerBinPath = createRequire(import.meta.url).resolve(
    "@sonamu-kit/hot-runner/bin/run.js",
  );

  const serverProcess = spawn(
    process.execPath, // node
    [
      hotRunnerBinPath, // 이렇게 해서 hot-runner를 실행하구요
      "--clear-screen=false", // 이하 hot-runner에게 넘겨줄 인자들입니다.
      "--node-args=--import=sonamu/loader-register", // TypeScript 서포트를 위한 로더,
      "--node-args=--import=sonamu/hot-hook-register", // HMR을 지원하기 위한 hot-hook,
      "--node-args=--enable-source-maps", // 그리고 소스맵 지원을 위한 플래그입니다.
      "--on-key=r:restart:Restart server", // r 누르면 서버 재시작하게 해줘요.
      `--on-key=f:shell(rm ${path.join(apiRoot, "sonamu.lock")}):restart:Force restart`, // f 누르면 sonamu.lock 파일을 지우고 서버 재시작하게 해줘요.

      "--on-key=enter:shell(echo hi):Key binding test", // enter를 key로 쓸 수 있음을 보이기 위한 테스트입니다.
      "--on-key=ctrl+f ctrl+f:shell(git pull && pnpm install && pnpm --filter sonamu build && echo 'Sonamu is now up-to-date!'):restart:Pull & install & build & restart", // modifier와의 조합, 그리고 두 개의 chord를 사용할 수 있음을 보이기 위한 테스트입니다.
      entryPoint, // 마지막으로 실제 실행할 스크립트의 경로를 넘겨줍니다.
    ],
    {
      cwd: apiRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "development",
        HOT: "yes", // 얘가 있어야 HMR이 활성화됩니다.
        API_ROOT_PATH: apiRoot, // 이 경로가 hot-hook의 루트 디렉토리가 됩니다.
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

/**
 * pnpm build 하면 실행되는 함수입니다.
 * 프로젝트를 빌드합니다.
 *
 * 빌드에 필요한 .swcrc는 프로젝트 루트에서 찾고, 없으면 sonamu가 관리하는 .swcrc.project-default를 사용합니다.
 * sonamu.config.ts는 src에 들어있지 않기 때문에 SWC_BUILD_COMMAND로 빌드되지 않습니다.
 * 따라서 따로 빌드해줍니다.
 *
 * Sonamu.init 없이 호출될 것을 상정하여 구현되었습니다.
 */
async function build() {
  const apiRoot = findApiRootPath();

  // 출력 디렉토리를 제거합니다.
  try {
    console.log(chalk.blue("Removing build directory..."));
    if (await exists(BUILD_DIR)) {
      await rm(BUILD_DIR, { recursive: true, force: true });
    }
  } catch (error) {
    console.error(chalk.red("Remove build directory failed."), error);
    process.exit(1);
  }

  // .swcrc 파일을 지정합니다.
  let swcFilePath = ".swcrc";
  try {
    if (await exists(swcFilePath)) {
      // 사용자 프로젝트에 .swcrc가 있으면 우선으로 사용합니다.
      console.log(chalk.blue("Using .swcrc from project root..."));
    } else {
      // 아니라면 sonamu가 관리하는 .swcrc.project-default를 가져다 씁니다.
      console.log(chalk.blue("Using default .swcrc from sonamu package..."));
      swcFilePath = path.join(import.meta.dirname, "..", "..", ".swcrc.project-default");
    }
  } catch (error) {
    console.error(chalk.red("Setting up swc config file failed."), error);
    process.exit(1);
  }

  // 소스 디렉토리를 빌드합니다.
  try {
    console.log(chalk.blue("Building with swc..."));
    execSync(SWC_BUILD_COMMAND(swcFilePath), { cwd: apiRoot, stdio: "inherit" });
  } catch (error) {
    console.error(chalk.red("Build failed."), error);
    process.exit(1);
  }

  // sonamu.config.ts만 따로 빌드합니다.
  // 이 친구는 src에 들어있지 않기 때문에 SWC_BUILD_COMMAND로 빌드되지 않습니다.
  // 따라서 따로 빌드해줍니다.
  try {
    const configPath = path.join(apiRoot, "sonamu.config.ts");
    if (await exists(configPath)) {
      console.log(chalk.blue("Building sonamu.config.ts..."));
      execSync(`swc ${configPath} -o ${BUILD_DIR}/sonamu.config.js`, {
        cwd: apiRoot,
        stdio: "inherit",
      });
    }
  } catch (error) {
    console.error(chalk.red("Building sonamu.config.ts failed."), error);
    process.exit(1);
  }

  // 마지막에는 타입 체크를 해요.
  try {
    console.log(chalk.blue("Checking types with tsc..."));
    execSync(TSC_TYPE_CHECK_COMMAND, {
      cwd: apiRoot,
      stdio: "inherit",
    });
  } catch (error) {
    console.error(chalk.red("Type check failed."), error);
    process.exit(1);
  }
}

/**
 * pnpm start 하면 실행되는 함수입니다.
 * 빌드된 프로젝트를 실행합니다.
 *
 * 빌드된 결과물(dist 디렉토리의 index.js 엔트리포인트)이 없다면 실행을 중단합니다.
 * 소스맵 지원과 dotenv 지원을 포함하여 실행합니다.
 *
 * Sonamu.init 없이 호출될 것을 상정하여 구현되었습니다.
 */
async function start() {
  const apiRoot = findApiRootPath();
  const entryPoint = "dist/index.js";

  if (!(await exists(entryPoint))) {
    console.log(chalk.red(`${entryPoint} not found. Please build your project first.`));
    console.log(chalk.blue("Run: yarn sonamu build"));
    return;
  }

  const { spawn } = await import("child_process");
  const serverProcess = spawn(
    process.execPath,
    ["--enable-source-maps", "-r", "dotenv/config", entryPoint],
    {
      cwd: apiRoot,
      stdio: "inherit",
    },
  );

  process.on("SIGINT", () => {
    serverProcess.kill("SIGTERM");
    process.exit(0);
  });
}

async function setupMigrator() {
  // migrator
  migrator = new Migrator();
}

async function setupFixtureManager() {
  FixtureManager.init();
}

async function migrate_run() {
  await setupMigrator();

  await migrator.runAction(
    "apply",
    Object.keys(Sonamu.dbConfig) as (keyof SonamuDBConfig)[] /*싹 다!*/,
  );
}

async function migrate_status() {
  await setupMigrator();

  const status = await migrator.getStatus();
  // status;
  console.log(status);
}

async function fixture_init() {
  const srcConfig = Sonamu.dbConfig.development_master;
  const targets = [
    {
      label: "(REMOTE) Fixture DB",
      config: Sonamu.dbConfig.fixture_remote,
    },
    {
      label: "(LOCAL) Testing DB",
      config: Sonamu.dbConfig.test,
      toSkip: (() => {
        const remoteConn = Sonamu.dbConfig.fixture_remote.connection as Knex.ConnectionConfig;
        const localConn = Sonamu.dbConfig.test.connection as Knex.ConnectionConfig;
        return remoteConn.host === localConn.host && remoteConn.database === localConn.database;
      })(),
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
        const [, seqNo] = fileName.match(/^p([0-9]+)-/) ?? ["0", "0"];
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
  await Sonamu.syncer.createEntity({ entityId, title: entityId });
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
        "sonamu/loader-register",
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
