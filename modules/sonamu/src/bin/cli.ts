import chalk from "chalk";
import dotenv from "dotenv";

dotenv.config();

import assert from "assert";
import { execSync, spawn } from "child_process";
import { cp, mkdir, readdir, readFile, rm, symlink, writeFile } from "fs/promises";
import knex, { type Knex } from "knex";
import { createRequire } from "module";
import path from "path";
import process from "process";
import { tsicli } from "tsicli";
import { Sonamu } from "../api";
import { generateBetterAuthEntities } from "../auth/auth-generator";
import {
  type BetterAuthPluginId,
  isValidPluginId,
  SUPPORTED_PLUGIN_IDS,
} from "../auth/plugins/entity-definitions";
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

let migrator: Migrator;

async function bootstrap() {
  const notToInit = ["dev", "build", "start", "skills"].includes(process.argv[2] ?? "");
  if (!notToInit) {
    await Sonamu.init(false, false);
  }

  try {
    // tsicli는 정확한 명령어 매칭만 지원하므로, --로 시작하는 옵션과 그 값을 필터링합니다.
    // 옵션 파싱은 각 runner 함수에서 원본 process.argv를 사용하여 수행합니다.
    const filteredArgv: string[] = [];
    let skipNext = false;
    for (const arg of process.argv) {
      if (skipNext) {
        skipNext = false;
        continue;
      }
      if (arg.startsWith("--")) {
        // --option=value 형식은 이 arg만 스킵
        // --option value 형식은 다음 arg도 스킵
        if (!arg.includes("=")) {
          skipNext = true;
        }
        continue;
      }
      filteredArgv.push(arg);
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
            { title: "Development", value: "development_master" },
            { title: "Production", value: "production_master" },
            { title: "Fixture", value: "fixture" },
            { title: "Test", value: "test" },
          ],
        },
      },
      args: [
        ["fixture", "init"],
        ["fixture", "import", "#entityId", "#recordIds"],
        ["fixture", "sync"],
        ["migrate", "run"],
        ["migrate", "apply", "#targets"],
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
        ["skills", "sync"],
        ["skills", "create", "#name"],
        ["auth", "generate"],
      ],
      runners: {
        migrate_status,
        migrate_run,
        migrate_apply,
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
        skills_sync,
        skills_create,
        auth_generate,
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

async function migrate_apply(targets: (keyof SonamuDBConfig)[]) {
  await setupMigrator();
  await migrator.runAction("apply", targets);
}

async function migrate_run() {
  await setupMigrator();
  const localHosts = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];
  const targets = Object.keys(Sonamu.dbConfig).filter((target) => {
    const targetConfig = Sonamu.dbConfig[target as keyof SonamuDBConfig];
    const host = (targetConfig?.connection as { host?: string })?.host ?? "localhost";
    return localHosts.includes(host.toLowerCase());
  });

  // 로컬 데이터베이스에 대해서만 전체 마이그레이션에서 동작
  await migrator.runAction("apply", targets as (keyof SonamuDBConfig)[]);
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

/**
 * pnpm sonamu skills sync 하면 실행되는 함수입니다.
 * 공식 Skills를 로컬 프로젝트로 동기화합니다.
 */
async function skills_sync() {
  const workspaceRoot = await findWorkspaceRoot();
  const claudeDir = path.join(workspaceRoot, ".claude");
  const targetSkillsDir = path.join(claudeDir, "skills", "sonamu");

  // 개발 환경 - cli.ts: sonamu/modules/sonamu/src/bin/cli.ts
  // 빌드 후 - cli.js: node_modules/sonamu/dist/bin/cli.js (실제 실행)
  // skills 위치: node_modules/sonamu/src/skills (npm 배포 시)
  const sourceBase = path.resolve(import.meta.dirname, "..", "..", "src", "skills");
  const sourceSkillsDir = path.join(sourceBase, "sonamu");
  const sourceClaudeMd = path.join(sourceBase, "CLAUDE.md");

  if (!(await exists(sourceSkillsDir))) {
    console.log(chalk.yellow("Skills source not found in sonamu package."));
    return;
  }

  // 기존 디렉토리/symlink 삭제 후 symlink 생성
  // exists()는 broken symlink를 감지하지 못하므로 rm을 무조건 시도합니다
  try {
    await rm(targetSkillsDir, { recursive: true, force: true });
  } catch {
    // 파일이 없으면 무시
  }

  // 대상 디렉토리 생성
  await mkdir(path.dirname(targetSkillsDir), { recursive: true });

  try {
    await symlink(sourceSkillsDir, targetSkillsDir, "dir");
    console.log(chalk.green(`✓ Skills linked (symlink)`));
  } catch (error) {
    console.log(
      chalk.yellow(`⚠ Symlink failed: ${error instanceof Error ? error.message : String(error)}`),
    );
    console.log(chalk.yellow(`  Falling back to copy...`));
    try {
      await cp(sourceSkillsDir, targetSkillsDir, { recursive: true });
      console.log(chalk.green(`✓ Skills copied`));
    } catch (copyError) {
      console.error(
        chalk.red(
          `✗ Failed to copy skills: ${copyError instanceof Error ? copyError.message : String(copyError)}`,
        ),
      );
      throw copyError;
    }
  }

  // CLAUDE.md 복사/업데이트
  if (await exists(sourceClaudeMd)) {
    try {
      const targetClaudeMd = path.join(claudeDir, "CLAUDE.md");
      const sourceContent = await readFile(sourceClaudeMd, "utf-8");

      if (await exists(targetClaudeMd)) {
        const targetContent = await readFile(targetClaudeMd, "utf-8");
        const startMarker = "<!-- SONAMU:START -->";
        const endMarker = "<!-- SONAMU:END -->";
        if (targetContent.includes(startMarker) && targetContent.includes(endMarker)) {
          // marker 영역만 교체합니다.
          const startIdx = targetContent.indexOf(startMarker);
          const endIdx = targetContent.indexOf(endMarker);

          if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
            const before = targetContent.substring(0, startIdx);
            const after = targetContent.substring(endIdx + endMarker.length);
            const newContent = `${before}${startMarker}\n${sourceContent}\n${endMarker}${after}`;
            await writeFile(targetClaudeMd, newContent);
            console.log(chalk.green(`✓ CLAUDE.md updated (marker region)`));
          } else {
            console.log(chalk.yellow(`⏭ CLAUDE.md marker positions invalid, skipped`));
          }
        }
      } else {
        await writeFile(targetClaudeMd, sourceContent);
        console.log(chalk.green(`✓ CLAUDE.md created`));
      }
    } catch (error) {
      console.error(
        chalk.red(
          `✗ Failed to update CLAUDE.md: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }
}

/**
 * pnpm sonamu skills create <name> 하면 실행되는 함수입니다.
 * 로컬 skill 초안을 생성합니다.
 */
async function skills_create(name: string) {
  const workspaceRoot = await findWorkspaceRoot();
  const localDir = path.join(workspaceRoot, ".claude", "skills", "local");

  // === 파일명 검증 및 Sanitize ===
  if (!name || name.trim() === "") {
    console.error(chalk.red("✗ Skill name is required"));
    return;
  }

  let sanitized = name
    // 공백을 하이픈으로
    .replace(/\s+/g, "-")
    // 경로 구분자 제거
    .replace(/[/\\]/g, "-")
    // Path traversal 방지
    .replace(/\.\./g, "")
    // Windows 금지 문자 제거
    .replace(/[<>:"|?*]/g, "")
    // 시작/끝 점, 하이픈, 언더스코어 제거
    .replace(/^[.\-_]+|[.\-_]+$/g, "")
    // 연속된 하이픈을 하나로
    .replace(/-+/g, "-")
    // 알파벳, 숫자, 하이픈, 언더스코어, 한글만 허용
    .replace(/[^a-zA-Z0-9-_가-힣]/g, "");

  // 길이 제한
  const MAX_LENGTH = 100;
  if (sanitized.length > MAX_LENGTH) {
    sanitized = sanitized.substring(0, MAX_LENGTH);
    console.log(chalk.yellow(`⚠ Name truncated to ${MAX_LENGTH} characters`));
  }

  // Windows 예약어 확인
  const RESERVED_NAMES = [
    "CON",
    "PRN",
    "AUX",
    "NUL",
    "COM1",
    "COM2",
    "COM3",
    "COM4",
    "COM5",
    "COM6",
    "COM7",
    "COM8",
    "COM9",
    "LPT1",
    "LPT2",
    "LPT3",
    "LPT4",
    "LPT5",
    "LPT6",
    "LPT7",
    "LPT8",
    "LPT9",
  ];
  if (RESERVED_NAMES.includes(sanitized.toUpperCase())) {
    sanitized = `skill-${sanitized}`;
    console.log(chalk.yellow(`⚠ Reserved name detected, prefixed with "skill-"`));
  }

  // 빈 문자열 체크
  if (sanitized === "") {
    console.error(chalk.red("✗ Invalid skill name after sanitization"));
    console.log(chalk.dim(`  Original: "${name}"`));
    return;
  }

  // 변경 알림
  if (sanitized !== name) {
    console.log(chalk.yellow(`⚠ Name sanitized: "${name}" → "${sanitized}"`));
  }

  const filePath = path.join(localDir, `${sanitized}.md`);

  if (await exists(filePath)) {
    console.log(chalk.yellow(`Skill "${sanitized}" already exists.`));
    return;
  }

  await mkdir(localDir, { recursive: true });

  const template = `---
name: ${sanitized}
category: other
created_at: ${new Date().toISOString().split("T")[0]}
status: draft
---

# ${sanitized}

## 상황

[어떤 문제였는지]

## 해결 방법

[어떻게 해결했는지]

## 코드 예시

\`\`\`typescript
// 예시 코드
\`\`\`
`;

  await writeFile(filePath, template);
  console.log(chalk.green(`✓ Created .claude/skills/local/${sanitized}.md`));
}

/**
 * pnpm sonamu auth generate 하면 실행되는 함수입니다.
 * better-auth 엔티티들(User, Session, Account, Verification)을 생성합니다.
 *
 * 옵션:
 * --plugins phone-number,2fa  플러그인 엔티티도 함께 생성
 */
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
 * 워크스페이스 루트를 찾습니다.
 * 우선순위: pnpm-workspace.yaml > CLAUDE.md > 루트 package.json (workspaces 필드)
 */
async function findWorkspaceRoot() {
  let dir = process.cwd();

  while (dir !== path.dirname(dir)) {
    // 1. pnpm-workspace.yaml 파일이 있는지 확인. 있으면 확실한 monorepo 루트.
    if (await exists(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }

    // 2. CLAUDE.md 파일이 있는지 확인. 있으면 프로젝트 루트로 간주함.
    if (await exists(path.join(dir, "CLAUDE.md"))) {
      return dir;
    }

    // 3. package.json에 workspaces 필드가 있으면 루트.
    const packagePath = path.join(dir, "package.json");
    if (await exists(packagePath)) {
      try {
        const packageJson = JSON.parse(await readFile(packagePath, "utf-8"));
        if (packageJson.workspaces) {
          return dir;
        }
      } catch {
        // 파싱 실패시 무시
      }
    }
    dir = path.dirname(dir);
  }

  // 찾지 못하면 api 폴더의 부모 사용
  return findAppRootPath();
}
