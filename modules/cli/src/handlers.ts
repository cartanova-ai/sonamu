import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { z } from "zod";

import { runChildProcess } from "./process.js";
import { type CliHandler, type CliHandlers } from "./runtime.js";

const TOOLING_HANDLER_MAPPINGS = [
  ["sync", "core", "sync"],
  ["entity.list", "entity", "list"],
  ["entity.show", "entity", "show"],
  ["entity.search", "entity", "search"],
  ["entity.apply", "entity", "applyPatch"],
  ["stub.entity", "entity", "create"],
  ["stub.practice", "stub", "practice"],
  ["cone.gen", "entity", "cones"],
  ["scaffold.model", "scaffold", "model"],
  ["scaffold.model_test", "scaffold", "model_test"],
  ["scaffold.view_list", "scaffold", "view_list"],
  ["scaffold.view_form", "scaffold", "view_form"],
  ["scaffold.status", "scaffold", "status"],
  ["scaffold.preview", "scaffold", "preview"],
  ["scaffold.batch", "scaffold", "batch"],
  ["migrate.connections", "migration", "connections"],
  ["migrate.run", "migration", "run"],
  ["migrate.generate", "migration", "generate"],
  ["migrate.status", "migration", "status"],
  ["migrate.code", "migration", "code"],
  ["migrate.preview", "migration", "preview"],
  ["migrate.shadow", "migration", "shadow"],
  ["migrate.apply", "migration", "apply"],
  ["migrate.rollback", "migration", "rollback"],
  ["fixture.init", "fixture", "init"],
  ["fixture.import", "fixture", "import"],
  ["fixture.sync", "fixture", "sync"],
  ["fixture.gen", "fixture", "gen"],
  ["fixture.fetch", "fixture", "fetch"],
  ["fixture.explore", "fixture", "explore"],
  ["build.all", "build", "all"],
  ["build.api", "build", "api"],
  ["build.web", "build", "web"],
  ["test.run", "test", "run"],
  ["test.status", "test", "status"],
  ["auth.generate", "auth", "generate"],
  ["auth.add-companions", "auth", "addCompanions"],
  ["i18n.list", "i18n", "list"],
  ["i18n.check", "i18n", "check"],
  ["i18n.import", "i18n", "import"],
  ["i18n.export", "i18n", "export"],
  ["i18n.create", "i18n", "create"],
  ["i18n.update", "i18n", "update"],
  ["i18n.delete", "i18n", "remove"],
  ["task.definitions", "task", "definitions"],
  ["task.list", "task", "runs"],
  ["task.show", "task", "show"],
  ["task.steps", "task", "steps"],
  ["task.watch", "task", "watch"],
  ["task.pause", "task", "pause"],
  ["task.resume", "task", "resume"],
  ["task.cancel", "task", "cancel"],
  ["cdd.tree", "cdd", "tree"],
  ["cdd.read", "cdd", "read"],
  ["cdd.rules", "cdd", "rules"],
  ["cdd.rule.show", "cdd", "showRule"],
  ["cdd.rule.add", "cdd", "addRule"],
  ["cdd.ac", "cdd", "addAcceptanceCriterion"],
] as const;

function missingToolingMethod(group: string, method: string): Error {
  return Object.assign(new Error(`Tooling adapter is unavailable: ${group}.${method}`), {
    code: "TOOLING_UNAVAILABLE",
  });
}

function createLazyToolingHandlers(): CliHandlers {
  return Object.fromEntries(
    TOOLING_HANDLER_MAPPINGS.map(([command, group, method]) => {
      const handler: CliHandler = async (input) => {
        const moduleName = "sonamu/tooling";
        const loaded = await import(moduleName);
        const adapter = loaded.tooling[group]?.[method];
        if (adapter === undefined) throw missingToolingMethod(group, method);
        return adapter(input);
      };
      return [command, handler];
    }),
  );
}

const requireFromHere = createRequire(import.meta.url);

function hmrHandler(apiOnly: boolean): CliHandler {
  return async () => {
    const { findApiRootPath } = await import("sonamu");
    const apiRootPath = findApiRootPath();
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "development",
      HOT: "yes",
      API_ROOT_PATH: apiRootPath,
    };
    if (apiOnly) environment.SONAMU_DISABLE_INTEGRATED_WEB = "yes";
    return runChildProcess({
      executable: process.execPath,
      args: [
        requireFromHere.resolve("@sonamu-kit/hmr-runner/bin/run.js"),
        "--clear-screen=false",
        "--node-args=--import=sonamu/ts-loader-register",
        "--node-args=--import=sonamu/hmr-hook-register",
        "--node-args=--enable-source-maps",
        "--on-key=r:restart:Restart server",
        "--on-key=c:clear:Clear screen",
        `--on-key=f:shell(rm ${apiRootPath}/sonamu.lock):restart:Force restart`,
        "src/index.ts",
      ],
      spawnOptions: { cwd: apiRootPath, stdio: "inherit", env: environment },
    });
  };
}

const processHandlers: CliHandlers = {
  "dev.all": hmrHandler(false),
  "dev.api": hmrHandler(true),
  "dev.web": async (input) => {
    const { findAppRootPath } = await import("sonamu");
    return runChildProcess({
      executable: "pnpm",
      args: ["exec", "vite", ...z.array(z.string()).catch([]).parse(input.passthrough)],
      spawnOptions: {
        cwd: path.join(findAppRootPath(), "web"),
        stdio: "inherit",
      },
    });
  },
  start: async () => {
    const { findApiRootPath } = await import("sonamu");
    const apiRootPath = findApiRootPath();
    const entryPoint = path.join(apiRootPath, "dist/index.js");
    try {
      await access(entryPoint);
    } catch {
      throw Object.assign(new Error(`${entryPoint} not found. Build the project first.`), {
        code: "BUILD_NOT_FOUND",
      });
    }
    return runChildProcess({
      executable: process.execPath,
      args: ["--enable-source-maps", "-r", "dotenv/config", entryPoint],
      spawnOptions: { cwd: apiRootPath, stdio: "inherit" },
    });
  },
};

// 이전 프로젝트의 postinstall이 호출하던 명령이라 설치를 실패시키지 않는 안내 전용 no-op으로 유지합니다.
const compatibilityHandlers: CliHandlers = {
  "skills.sync": () => ({
    status: "unsupported",
    message:
      "sonamu skills sync is no longer supported and changes no files. Install Sonamu skills with the command below, then remove the postinstall script from packages/api/package.json.",
    command: "npx skills@latest add cartanova-ai/skills",
  }),
};

export const CLI_HANDLERS: CliHandlers = {
  ...createLazyToolingHandlers(),
  ...processHandlers,
  ...compatibilityHandlers,
};
