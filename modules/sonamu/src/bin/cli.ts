import assert from "assert";
import { execSync, spawn } from "child_process";
import { mkdir, readdir, writeFile } from "fs/promises";
import { createRequire } from "module";
import path from "path";
import process from "process";

import chalk from "chalk";
import knex from "knex";
import { type Knex } from "knex";
import { tsicli } from "tsicli";

import { Sonamu } from "../api/sonamu";
import { addCompanionsToEntities, generateBetterAuthEntities } from "../auth/auth-generator";
import { isValidPluginId, SUPPORTED_PLUGIN_IDS } from "../auth/plugins/entity-definitions";
import { type BetterAuthPluginId } from "../auth/plugins/entity-definitions";
import { type SonamuDBConfig } from "../database/db";
import { EntityManager } from "../entity/entity-manager";
import { getSonamuEnvironment } from "../env";
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
import { API_ARTIFACTS, WEB_ARTIFACTS } from "./build-config";
import { type BuildArtifact } from "./build-config";
import { fixtureExploreCommand, fixtureFetchCommand, fixtureGenCommand } from "./fixture";
import { getMigrateRunTargets } from "./migrate-targets";
import { testCommand } from "./test-command";

let migrator: Migrator;

/**
 * CLI 옵션을 파싱하는 헬퍼 함수
 */
function parseCliOptions(argv: string[] = process.argv): {
  flags: Set<string>; // --regenerate, --ai, --no-cones 등
  options: Record<string, string>; // --locale ko 등
} {
  const flags = new Set<string>();
  const options: Record<string, string> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;

    // --option=value 형식
    if (arg.includes("=")) {
      const [key, value] = arg.slice(2).split("=");
      options[key] = value;
      continue;
    }

    // --option value 형식인지 확인
    const nextArg = argv[i + 1];
    if (nextArg && !nextArg.startsWith("--") && !nextArg.startsWith("-")) {
      options[arg.slice(2)] = nextArg;
      i++; // 다음 arg는 값이므로 스킵
    } else {
      // --flag 형식
      flags.add(arg.slice(2));
    }
  }

  return { flags, options };
}

async function bootstrap() {
  const notToInit = ["dev", "build", "start", "skills", "test"].includes(process.argv[2] ?? "");
  if (!notToInit) {
    await Sonamu.init(false, false);
  }

  try {
    // tsicli는 정확한 명령어 매칭만 지원하므로, --로 시작하는 옵션과 그 값을 필터링합니다.
    // 옵션 파싱은 각 runner 함수에서 원본 process.argv를 사용하여 수행합니다.
    // "--"(bare double dash)는 passthrough 구분자이므로, 그 뒤의 모든 인자도 제외합니다.
    const filteredArgv: string[] = [];
    let skipNext = false;
    let afterDoubleDash = false;
    for (let i = 0; i < process.argv.length; i++) {
      const arg = process.argv[i];
      if (arg === "--") {
        afterDoubleDash = true;
        continue;
      }
      if (afterDoubleDash) continue;
      if (skipNext) {
        skipNext = false;
        continue;
      }
      if (arg.startsWith("--")) {
        // --option=value 형식은 이 arg만 스킵
        if (arg.includes("=")) {
          continue;
        }
        // --option value 형식인지 확인: 다음 arg가 --로 시작하지 않으면 값이 있는 것
        const nextArg = process.argv[i + 1];
        if (nextArg && !nextArg.startsWith("--") && !nextArg.startsWith("-")) {
          skipNext = true;
        }
        continue;
      }
      filteredArgv.push(arg);
    }

    // build/dev 명령어가 서브커맨드 없이 호출될 때 "all"을 기본값으로 추가합니다.
    // 예: `sonamu build` → `sonamu build all`, `sonamu dev` → `sonamu dev all`
    const cmd = filteredArgv[2];
    if ((cmd === "build" || cmd === "dev") && filteredArgv.length === 3) {
      filteredArgv.push("all");
    }

    // test 커맨드는 가변 인자(파일명, --pattern 등)를 받으므로 tsicli를 우회합니다.
    if (cmd === "test") {
      return testCommand();
    }

    await tsicli(filteredArgv, {
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
        "#targets": {
          type: "multiselect",
          name: "#targets",
          message: "Please input #targets",
          choices: [
            { title: "Development", value: "development" },
            { title: "Staging", value: "staging" },
            { title: "Production", value: "production" },
            { title: "Fixture", value: "fixture" },
            { title: "Test", value: "test" },
          ],
        },
      },
      args: [
        ["fixture", "init"],
        ["fixture", "import", "#entityId", "#recordIds"],
        ["fixture", "sync"],
        ["fixture", "gen"],
        ["fixture", "fetch"],
        ["fixture", "explore"],
        ["migrate", "run"],
        ["migrate", "apply", "#targets"],
        ["migrate", "generate"],
        ["migrate", "status"],
        ["stub", "practice", "#name"],
        ["stub", "entity", "#name"],
        ["scaffold", "model", "#entityId"],
        ["scaffold", "model_test", "#entityId"],
        ["scaffold", "view_list", "#entityId"],
        ["scaffold", "view_form", "#entityId"],
        ["cone", "gen", "#entityId"],
        ["sync"],
        ["build", "all"],
        ["build", "api"],
        ["build", "web"],
        ["dev", "all"],
        ["dev", "api"],
        ["dev", "web"],
        ["start"],
        ["skills", "sync"],
        ["test"],
        ["auth", "generate"],
        ["auth", "add-companions"],
      ],
      runners: {
        migrate_status,
        migrate_run,
        migrate_apply,
        migrate_generate,
        fixture_init,
        fixture_import,
        fixture_sync,
        fixture_gen,
        fixture_fetch,
        fixture_explore,
        stub_practice,
        stub_entity,
        scaffold_model,
        scaffold_model_test,
        scaffold_view_list,
        scaffold_view_form,
        cone_gen,
        sync,
        build_all,
        build_api,
        build_web,
        dev_all,
        dev_api,
        dev_web,
        start,
        skills_sync: skillsMigrationNotice,
        test: testCommand,
        auth_generate,
        "auth_add-companions": auth_add_companions,
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
 *
 * `--force` 옵션이 주어지면 lock을 무시하고 풀-싱크를 수행합니다.
 * git post-merge hook이나 CI에서 매 pull 후 자동 실행할 수 있도록 노출.
 */
async function sync() {
  const { flags } = parseCliOptions();
  if (flags.has("force")) {
    await Sonamu.syncer.forceSync();
  } else {
    await Sonamu.syncer.sync();
  }
}

/**
 * 이전 생성 프로젝트의 postinstall이 업그레이드를 막지 않도록 구 명령만 안전하게 종료합니다.
 */
async function skillsMigrationNotice() {
  console.log(chalk.yellow("'sonamu skills sync' is no longer supported."));
  console.log(
    chalk.cyan("Install Sonamu skills with 'npx skills@latest add cartanova-ai/skills'."),
  );
}

/**
 * API 개발 서버를 실행하는 공통 로직입니다.
 * dev_all과 dev_api에서 공유합니다.
 *
 * TypeScript를 바로 실행할 수 있도록 @sonamu-kit/ts-loader를,
 * HMR을 지원하기 위해 @sonamu-kit/hmr-hook을 import하며,
 * 소스맵 지원을 위해 --enable-source-maps 플래그를 포함하여 실행합니다.
 *
 * 이때 @sonamu-kit/ts-loader와 @sonamu-kit/hmr-hook는 sonamu가 자체적으로 가지고 있는 dependency입니다.
 * 또한 실행에 사용하는 @sonamu-kit/hmr-runner도 마찬가지로 sonamu가 자체적으로 가지고 있는 dependency입니다.
 * 따라서 사용자 프로젝트에서는 이 세 패키지를 직접 설치할 필요가 없습니다.
 */
function spawnApiDevServer(options?: { extraEnv?: Record<string, string> }) {
  const apiRoot = findApiRootPath();
  const entryPoint = "src/index.ts";

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
      "--on-key=c:clear:Clear screen", // c 누르면 터미널 화면을 지워줘요.
      `--on-key=f:shell(rm ${path.join(apiRoot, "sonamu.lock")}):restart:Force restart`, // f 누르면 lock 제거 후 재시작 → 새 프로세스가 부트스트랩에서 풀-싱크. force sync CLI를 shell로 부르면 살아있는 서버의 watcher 폭풍이 :restart와 충돌해 상태 이상.

      "--on-key=enter:shell(echo hi):Key binding test", // enter를 key로 쓸 수 있음을 보이기 위한 테스트입니다.
      "--on-key=ctrl+f ctrl+f:shell(git pull && pnpm install && pnpm --filter sonamu build && echo 'Sonamu is now up-to-date!'):restart:Pull & install & build & restart", // modifier와의 조합, 그리고 두 개의 chord를 사용할 수 있음을 보이기 위한 테스트입니다.
      entryPoint, // 마지막으로 실제 실행할 스크립트의 경로를 넘겨줍니다.
    ],
    {
      cwd: apiRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV ?? "development",
        HOT: "yes", // 얘가 있어야 HMR이 활성화됩니다.
        API_ROOT_PATH: apiRoot, // 이 경로가 hmr-hook의 루트 디렉토리가 됩니다.
        ...options?.extraEnv,
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
      console.error(chalk.red(`Server exited with code ${code}`));
      process.exit(code || 1);
    }
  });
}

/**
 * pnpm dev / pnpm dev all 하면 실행되는 함수입니다.
 * 프로젝트에 대해 HMR 지원하는 개발 서버를 띄워줍니다.
 *
 * Sonamu.init 없이 호출될 것을 상정하여 구현되었습니다.
 */
function dev_all() {
  const require = createRequire(import.meta.url);
  const { version } = require("../../package.json");
  console.log(`🌲 Sonamu v${version}\n`);
  spawnApiDevServer();
}

/**
 * pnpm dev api 하면 실행되는 함수입니다.
 * API 전용 개발 서버를 띄웁니다.
 * dev_all과 거의 동일하되, 통합 웹 서버를 비활성화합니다.
 *
 * Sonamu.init 없이 호출될 것을 상정하여 구현되었습니다.
 */
function dev_api() {
  console.log(chalk.yellow.bold("Starting Sonamu API-only dev server...\n"));
  spawnApiDevServer({
    extraEnv: { SONAMU_DISABLE_INTEGRATED_WEB: "yes" },
  });
}

/**
 * pnpm dev web 하면 실행되는 함수입니다.
 * Vite 개발 서버를 단독으로 실행합니다.
 * -- 뒤의 인자는 Vite에 그대로 전달됩니다.
 *
 * Sonamu.init 없이 호출될 것을 상정하여 구현되었습니다.
 */
async function dev_web() {
  const appRoot = findAppRootPath();
  const webPath = path.join(appRoot, "web");

  if (!(await exists(webPath))) {
    console.error(`web 디렉토리를 찾을 수 없습니다: ${webPath}`);
    process.exit(1);
  }

  // -- 뒤의 인자 추출
  const doubleDashIndex = process.argv.indexOf("--");
  const passthroughArgs = doubleDashIndex !== -1 ? process.argv.slice(doubleDashIndex + 1) : [];

  const viteArgs = ["exec", "vite", ...passthroughArgs];

  console.log(chalk.yellow.bold("Starting Vite dev server...\n"));

  const viteProcess = spawn("pnpm", viteArgs, {
    cwd: webPath,
    stdio: "inherit",
  });

  viteProcess.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  // SIGINT/SIGTERM 시 Vite 프로세스를 gracefully 종료합니다.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      viteProcess.kill(signal);
    });
  }
}

/**
 * API 빌드 설정 파일 경로를 결정합니다.
 * 프로젝트 루트에 `tsdown.config.ts`가 있으면 그것을, 없으면 sonamu 기본 설정을 사용합니다.
 */
async function resolveApiBuildConfigPath(): Promise<string> {
  const localConfigPath = path.join(process.cwd(), "tsdown.config.ts");

  try {
    if (await exists(localConfigPath)) {
      console.log(chalk.dim("Using tsdown.config.ts from project root..."));
      return localConfigPath;
    }

    console.log(chalk.dim("Using default tsdown API config from sonamu package..."));
    return path.join(import.meta.dirname, "..", "..", "tsdown.api.config.ts");
  } catch (error) {
    console.error(chalk.red("Setting up API build config failed."), error);
    process.exit(1);
  }
}

/**
 * sonamu build / sonamu build all 하면 실행되는 함수입니다.
 * build_api + build_web의 합성입니다. Web 디렉토리가 없으면 Web 빌드를 스킵합니다.
 */
async function build_all() {
  await build_api();
  await build_web({ skipIfMissing: true });
}

/**
 * pnpm build api 하면 실행되는 함수입니다.
 * API 프로젝트만 빌드합니다.
 *
 * Sonamu.init 없이 호출될 것을 상정하여 구현되었습니다.
 */
async function build_api() {
  const appRoot = findAppRootPath();
  const configFilePath = await resolveApiBuildConfigPath();

  const apiStartedAt = Date.now();
  try {
    for (const artifact of API_ARTIFACTS) {
      const cwd = path.join(appRoot, artifact.projectPath);
      printTaskHeader(artifact.name, artifact.description, cwd);

      await runBuildSteps(artifact, { cwd, buildCommandArgs: { configFilePath } });
    }
    printBuildSummary("API", true, Date.now() - apiStartedAt);
  } catch (e) {
    printBuildSummary("API", false, Date.now() - apiStartedAt);
    console.error(e);
    process.exit(1);
  }
}

/**
 * pnpm build web 하면 실행되는 함수입니다.
 * Web 프로젝트만 빌드합니다.
 *
 * Sonamu.init 없이 호출될 것을 상정하여 구현되었습니다.
 */
async function build_web({ skipIfMissing = false } = {}) {
  const appRoot = findAppRootPath();
  const webPath = path.join(appRoot, "web");

  if (!(await exists(webPath))) {
    if (skipIfMissing) {
      console.log(chalk.gray("Web 디렉토리가 없으므로 Web 빌드를 건너뜁니다."));
      return;
    }
    console.error(`web 디렉토리를 찾을 수 없습니다: ${webPath}`);
    process.exit(1);
  }

  const webStartedAt = Date.now();
  try {
    for (const artifact of WEB_ARTIFACTS) {
      const cwd = path.join(appRoot, artifact.projectPath);
      printTaskHeader(artifact.name, artifact.description, cwd);

      await runBuildSteps(artifact, { cwd, buildCommandArgs: {} });
    }
    printBuildSummary("Web", true, Date.now() - webStartedAt);
  } catch (e) {
    printBuildSummary("Web", false, Date.now() - webStartedAt);
    console.error(e);
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
    } catch (e) {
      printTaskFailed(step.name, isLast);
      throw new Error(`${step.name} failed`, { cause: e });
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
  const require = createRequire(import.meta.url);
  const { version } = require("../../package.json");
  console.log(`🌲 Sonamu v${version}\n`);

  const apiRoot = findApiRootPath();
  const entryPoint = "dist/index.js";

  if (!(await exists(entryPoint))) {
    console.log(chalk.red(`${entryPoint} not found. Please build your project first.`));
    console.log(chalk.blue("Run: pnpm sonamu build"));
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

async function migrate_apply(targets: (keyof SonamuDBConfig)[]) {
  await setupMigrator();
  await migrator.apply(targets);
}

async function migrate_run() {
  await setupMigrator();
  await migrator.apply(getMigrateRunTargets());
}

async function migrate_generate() {
  await setupMigrator();

  const { conns } = await migrator.getStatus();
  const hasStatus0 = conns.some((conn) => conn.status === 0);
  if (!hasStatus0) {
    console.log(
      chalk.red(
        "마이그레이션 파일을 생성하려면 기존 마이그레이션이 최소 하나의 DB에 모두 적용되어 있어야 합니다.",
      ),
    );
    for (const conn of conns) {
      if (conn.pending.length > 0) {
        console.log(chalk.yellow(`  ${conn.name}: pending ${conn.pending.length}개`));
      }
    }
    process.exit(1);
  }

  const count = await migrator.generatePreparedCodes();
  if (count > 0) {
    console.log(chalk.green(`${count}개의 마이그레이션 파일이 생성되었습니다.`));
  }
}

async function migrate_status() {
  await setupMigrator();

  const status = await migrator.getStatus();
  // status;
  console.log(status);
}

async function fixture_init() {
  const srcConfig = Sonamu.dbConfig[getSonamuEnvironment()];
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
  for (const { label, config, toSkip } of targets) {
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

/**
 * fixture gen 명령어
 * 옵션을 process.argv에서 파싱
 */
async function fixture_gen() {
  const options = parseOptions(process.argv);
  await fixtureGenCommand(options);
}

/**
 * fixture fetch 명령어
 * 옵션을 process.argv에서 파싱
 */
async function fixture_fetch() {
  const options = parseOptions(process.argv);
  await fixtureFetchCommand(options);
}

/**
 * fixture explore 명령어
 * 옵션을 process.argv에서 파싱
 */
async function fixture_explore() {
  const options = parseOptions(process.argv);
  await fixtureExploreCommand(options);
}

/**
 * 간단한 옵션 파서
 */
function parseOptions(
  argv: string[],
): Record<string, string | boolean | string[]> & { _: string[] } {
  const options: Record<string, string | boolean | string[]> & { _: string[] } = { _: [] };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith("--")) {
      const key = arg.slice(2);

      if (key.includes("=")) {
        const [k, v] = key.split("=");
        options[k] = v;
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith("--")) {
          options[key] = next;
          i++;
        } else {
          options[key] = true;
        }
      }
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1);
      const next = argv[i + 1];

      if (next && !next.startsWith("-")) {
        options[key] = next;
        i++;
      } else {
        options[key] = true;
      }
    } else {
      options._.push(arg);
    }
  }

  return options;
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
      .toSorted((a, b) => b - a);

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

  const { flags } = parseCliOptions();
  const useAI = flags.has("ai");
  const noCones = flags.has("no-cones");

  // --no-cones: cone 생성 스킵
  if (noCones) {
    console.log(`✓ Entity '${entityId}' created without cones`);
    return;
  }

  const { EntityManager } = await import("../entity/entity-manager");
  const entity = EntityManager.get(entityId);
  if (!entity) {
    console.error(`Entity not found: ${entityId}`);
    return;
  }

  // --ai: LLM으로 cone 생성
  if (useAI) {
    console.log(`✓ Entity '${entityId}' created`);
    console.log(`🌟 Generating AI-powered cones...`);
    try {
      const configLocale = Sonamu.config.i18n?.defaultLocale;
      const locale =
        configLocale === "ko" || configLocale === "en" || configLocale === "ja"
          ? configLocale
          : "ko";

      const result = await entity.generateCones({
        preserveExisting: false,
        onlyEmpty: false,
        locale,
      });

      console.log(`✅ Done (${result.tokensUsed} tokens)`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("ANTHROPIC_API_KEY")) {
        console.error(`\n❌ ${error.message}`);
        console.error(`\n💡 Remove --ai flag to use template cones instead`);
      } else {
        throw error;
      }
    }
    return;
  }

  // 기본: 템플릿 cone 자동 생성
  // LLM 없이 faker-mappings.ts를 활용하여 기본 cone 메타데이터를 생성합니다.
  // 이를 통해 ANTHROPIC_API_KEY가 없어도 Sonamu를 사용할 수 있으며,
  // 생성된 템플릿 cone은 나중에 'cone gen' 명령어로 AI를 통해 업그레이드할 수 있습니다.
  console.log(`🌟 Generating template cones...`);
  await entity.generateTemplateCones();
  console.log(`✓ Entity '${entityId}' created with template cones`);
  console.log(`💡 Tip: Run 'pnpm sonamu cone gen ${entityId}' to improve with AI`);
}

/**
 * AI를 사용하여 entity의 cone 메타데이터를 생성하거나 업그레이드합니다.
 *
 * 옵션:
 * - --regenerate: 전체 재생성 (기존 cone 덮어쓰기)
 * - --locale <ko|en|ja>: 생성 언어 지정
 * - 기본: onlyEmpty 모드 (기존 fixtureHint 보존)
 *
 * ANTHROPIC_API_KEY 필요 (sonamu.secret.ts 또는 환경변수)
 */
async function cone_gen(entityId: string) {
  const { EntityManager } = await import("../entity/entity-manager");
  const { flags, options } = parseCliOptions();

  // --all 옵션: 모든 entity cone 생성
  if (flags.has("all") || entityId === "all") {
    const allEntities = EntityManager.getAllEntities();
    console.log(`🌟 Generating AI-powered cones for ${allEntities.length} entities...\n`);

    let totalTokens = 0;
    const errors: string[] = [];

    for (const entity of allEntities) {
      try {
        console.log(`Processing ${entity.id}...`);
        const configLocale = options.locale || Sonamu.config.i18n?.defaultLocale;
        const locale =
          configLocale === "ko" || configLocale === "en" || configLocale === "ja"
            ? configLocale
            : "ko";

        const result = await entity.generateCones({
          preserveExisting: !flags.has("regenerate"),
          onlyEmpty: !flags.has("regenerate"),
          locale,
        });

        totalTokens += result.tokensUsed;
        console.log(`  ✓ ${entity.id} (${result.tokensUsed} tokens)\n`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        errors.push(`${entity.id}: ${message}`);
        console.error(`  ✗ ${entity.id}: ${message}\n`);
      }
    }

    console.log(`\n✅ Done! Total: ${totalTokens} tokens used`);
    const estimatedCost = (totalTokens * 9) / 1_000_000;
    console.log(`💰 Estimated cost: ~$${estimatedCost.toFixed(4)}`);

    if (errors.length > 0) {
      console.error(`\n❌ Failed entities (${errors.length}):`);
      for (const err of errors) {
        console.error(`  - ${err}`);
      }
    }
    return;
  }

  // 단일 entity cone 생성
  const entity = EntityManager.get(entityId);
  if (!entity) {
    console.error(`Entity not found: ${entityId}`);
    return;
  }

  const mode = flags.has("regenerate") ? "regenerating" : "generating";
  console.log(
    `🌟 ${mode === "regenerating" ? "Regenerating" : "Generating"} AI-powered cones for ${entityId}...`,
  );

  try {
    const configLocale = options.locale || Sonamu.config.i18n?.defaultLocale;
    const locale =
      configLocale === "ko" || configLocale === "en" || configLocale === "ja" ? configLocale : "ko";

    const result = await entity.generateCones({
      preserveExisting: !flags.has("regenerate"),
      onlyEmpty: !flags.has("regenerate"),
      locale,
    });

    console.log(`✅ Done! (${result.tokensUsed} tokens used)`);

    // 토큰 비용 계산 (대략적인 추정)
    // Claude Sonnet 4.5: input $3/M tokens, output $15/M tokens
    // 간단하게 평균 $9/M tokens로 계산
    const estimatedCost = (result.tokensUsed * 9) / 1_000_000;
    console.log(`💰 Estimated cost: ~$${estimatedCost.toFixed(4)}`);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("ANTHROPIC_API_KEY")) {
        console.error(`\n❌ ${error.message}`);
        console.error(`\n💡 To use AI-powered cone generation:`);
        console.error(`   1. Get an API key from https://console.anthropic.com/`);
        console.error(
          `   2. Add it to sonamu.secret.ts or set ANTHROPIC_API_KEY environment variable`,
        );
      } else if (error.message.includes("Rate limit")) {
        console.error(`\n❌ ${error.message}`);
        console.error(`\n💡 Please wait a moment and try again.`);
      } else {
        console.error(`\n❌ Failed to generate cones: ${error.message}`);
      }
    } else {
      console.error(`\n❌ Failed to generate cones: Unknown error`);
    }
  }
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

async function scaffold_view_list(entityId: string) {
  await Sonamu.syncer.generateTemplate("view_list", {
    entityId,
    extra: undefined,
  });
}

async function scaffold_view_form(entityId: string) {
  await Sonamu.syncer.generateTemplate("view_form", {
    entityId,
  });
}

async function auth_generate() {
  // --plugins 옵션 파싱
  const pluginsArg = process.argv.find((arg) => arg.startsWith("--plugins"));
  const plugins: BetterAuthPluginId[] = [];

  if (pluginsArg) {
    const pluginValue = pluginsArg.includes("=")
      ? pluginsArg.split("=")[1]
      : process.argv[process.argv.indexOf(pluginsArg) + 1];

    if (pluginValue) {
      const pluginIds = pluginValue.split(",").map((p) => p.trim());

      for (const id of pluginIds) {
        if (isValidPluginId(id)) {
          plugins.push(id);
        } else {
          console.log(chalk.yellow(`⚠ Unknown plugin: ${id}`));
          console.log(chalk.dim(`  Supported plugins: ${SUPPORTED_PLUGIN_IDS.join(", ")}`));
        }
      }
    }
  }

  console.log(chalk.yellow.bold("🔐 Generating better-auth entities...\n"));

  if (plugins.length > 0) {
    console.log(chalk.dim(`  Plugins: ${plugins.join(", ")}`));
  }

  await generateBetterAuthEntities({ plugins });
}

/**
 * pnpm sonamu auth add-companions 하면 실행되는 함수입니다.
 * 기존 프로젝트의 entity.json에 fixtureCompanions를 소급 추가합니다.
 *
 * 이미 fixtureCompanions가 있는 entity는 스킵합니다 (덮어쓰기 없음).
 */
async function auth_add_companions() {
  console.log(chalk.yellow.bold("🔐 Adding fixtureCompanions to better-auth entities...\n"));
  await addCompanionsToEntities();
  console.log(chalk.bold("\n✅ Done!"));
}
