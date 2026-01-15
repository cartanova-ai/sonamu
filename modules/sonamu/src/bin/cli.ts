import chalk from "chalk";
import dotenv from "dotenv";

dotenv.config();

import { execSync, spawn } from "child_process";
import { mkdir, readdir, writeFile } from "fs/promises";
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
import {
  execWithLinePrefix,
  printBuildSummary,
  printTaskFailed,
  printTaskHeader,
  printTaskStart,
  printTaskSuccess,
} from "../utils/console-util";
import { exists } from "../utils/fs-utils";
import { findApiRootPath, findAppRootPath } from "../utils/utils";
import { API_ARTIFACTS, type BuildArtifact, WEB_ARTIFACTS } from "./build-config";
import assert from "assert";

let migrator: Migrator;

async function bootstrap() {
  const notToInit = ["dev", "build", "start"].includes(process.argv[2] ?? "");
  if (!notToInit) {
    await Sonamu.init(false, false);
  }

  try {
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
        // scaffold_view_list,
        // scaffold_view_form,
        sync,
        dev,
        build,
        start,
      },
    });
  } finally {
    await Sonamu.destroy();
  }
}

bootstrap().finally(async () => {
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
 * TypeScript를 바로 실행할 수 있도록 @sonamu-kit/ts-loader를,
 * HMR을 지원하기 위해 @sonamu-kit/hmr-hook을 import하며,
 * 소스맵 지원을 위해 --enable-source-maps 플래그를 포함하여 실행합니다.
 *
 * 이때 @sonamu-kit/ts-loader와 @sonamu-kit/hmr-hook는 sonamu가 자체적으로 가지고 있는 dependency입니다.
 * 또한 실행에 사용하는 @sonamu-kit/hmr-runner도 마찬가지로 sonamu가 자체적으로 가지고 있는 dependency입니다.
 * 따라서 사용자 프로젝트에서는 이 세 패키지를 직접 설치할 필요가 없습니다.
 *
 * Sonamu.init 없이 호출될 것을 상정하여 구현되었습니다.
 */
async function dev() {
  const apiRoot = findApiRootPath();
  const entryPoint = "src/index.ts";

  console.log(chalk.yellow.bold("🚀 Starting Sonamu dev server...\n"));

  // 이 sonamu 패키지가 dependencies로 가지고 있는 @sonamu-kit/hmr-runner의 bin/run.js를 사용합니다.
  // 이 경로(/bin/run.js)는 @sonamu-kit/hmr-runner의 package.json의 bin 필드에 명시되어 있는 그것과 같습니다.
  const hotRunnerBinPath = createRequire(import.meta.url).resolve(
    "@sonamu-kit/hmr-runner/bin/run.js",
  );

  const serverProcess = spawn(
    process.execPath, // node
    [
      hotRunnerBinPath, // 이렇게 해서 hot-runner를 실행하구요
      "--clear-screen=false", // 이하 hot-runner에게 넘겨줄 인자들입니다.
      "--node-args=--import=sonamu/ts-loader-register", // TypeScript 서포트를 위한 로더,
      "--node-args=--import=sonamu/hmr-hook-register", // HMR을 지원하기 위한 hook,
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
        API_ROOT_PATH: apiRoot, // 이 경로가 hmr-hook의 루트 디렉토리가 됩니다.
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
 *
 * 실제 빌드 타겟(아티팩트)과 동작은 build-config.ts에 정의되어 있습니다.
 * 이 함수는 build-config.ts에 정의된 동작들을 실행해주는 역할만 합니다.
 *
 * Sonamu.init 없이 호출될 것을 상정하여 구현되었습니다.
 */
async function build() {
  const appRoot = findAppRootPath();

  // .swcrc 파일을 지정합니다.
  let swcFilePath = ".swcrc";
  try {
    if (await exists(swcFilePath)) {
      // 사용자 프로젝트에 .swcrc가 있으면 우선으로 사용합니다.
      console.log(chalk.dim("Using .swcrc from project root..."));
    } else {
      // 아니라면 sonamu가 관리하는 .swcrc.project-default를 가져다 씁니다.
      console.log(chalk.dim("Using default .swcrc from sonamu package..."));
      swcFilePath = path.join(import.meta.dirname, "..", "..", ".swcrc.project-default");
    }
  } catch (error) {
    console.error(chalk.red("Setting up swc config file failed."), error);
    process.exit(1);
  }

  // API 프로젝트를 빌드합니다.
  const apiStartedAt = Date.now();
  try {
    for (const artifact of API_ARTIFACTS) {
      const cwd = path.join(appRoot, artifact.projectPath);
      printTaskHeader(artifact.name, artifact.description, cwd);

      await runBuildSteps(artifact, { cwd, buildCommandArgs: { configFilePath: swcFilePath } });
    }
    printBuildSummary("API", true, Date.now() - apiStartedAt);
  } catch {
    printBuildSummary("API", false, Date.now() - apiStartedAt);
    process.exit(1);
  }

  // Web 프로젝트를 빌드합니다.
  const webStartedAt = Date.now();
  try {
    for (const artifact of WEB_ARTIFACTS) {
      const cwd = path.join(appRoot, artifact.projectPath);
      printTaskHeader(artifact.name, artifact.description, cwd);

      await runBuildSteps(artifact, { cwd, buildCommandArgs: {} });
    }
    printBuildSummary("Web", true, Date.now() - webStartedAt);
  } catch {
    printBuildSummary("Web", false, Date.now() - webStartedAt);
    process.exit(1);
  }
}

/**
 * pre-build, build, post-build 단계를 순차적으로 실행합니다.
 */
async function runBuildSteps<T>(
  artifact: BuildArtifact<T>,
  options: { cwd: string; buildCommandArgs: T },
) {
  const steps = [
    { name: "pre-build", cmd: artifact.preBuildCommand?.() },
    { name: "build", cmd: artifact.buildCommand(options.buildCommandArgs) },
    { name: "post-build", cmd: artifact.postBuildCommand?.() },
  ].filter((step) => step.cmd);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const isLast = i === steps.length - 1;

    try {
      assert(step.cmd);
      printTaskStart(step.name, step.cmd, isLast);
      await execWithLinePrefix(step.cmd, { cwd: options.cwd });
      printTaskSuccess(step.name, isLast);
    } catch {
      printTaskFailed(step.name, isLast);
      throw new Error(`${step.name} failed`);
    }
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
      config: Sonamu.dbConfig.fixture,
    },
    {
      label: "(LOCAL) Testing DB",
      config: Sonamu.dbConfig.test,
      toSkip: (() => {
        const remoteConn = Sonamu.dbConfig.fixture.connection as Knex.ConnectionConfig;
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
