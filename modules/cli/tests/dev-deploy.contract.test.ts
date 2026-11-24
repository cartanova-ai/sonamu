import { describe, expect, it } from "vitest";

import { createDevEnvironment, createDevHandler } from "../src/handlers.js";
import { type RunChildProcessOptions } from "../src/process.js";
import { createSonamuProgram, parseSonamuArgs, SonamuUsageError } from "../src/program.js";
import { runSonamuCli } from "../src/runtime.js";

describe("sonamu dev --deploy 옵션", () => {
  const program = createSonamuProgram({ version: "0.14.1" });

  it.each([
    { argv: ["dev"], command: "dev.all", deploy: false },
    { argv: ["dev", "--deploy"], command: "dev.all", deploy: true },
    { argv: ["dev", "all"], command: "dev.all", deploy: false },
    { argv: ["dev", "all", "--deploy"], command: "dev.all", deploy: true },
    { argv: ["dev", "api"], command: "dev.api", deploy: false },
    { argv: ["dev", "api", "--deploy"], command: "dev.api", deploy: true },
  ])("$argv 를 $command (deploy=$deploy)로 해석한다", async ({ argv, command, deploy }) => {
    const parsed = await parseSonamuArgs(program, argv);

    expect(parsed).toMatchObject({
      command,
      options: { deploy },
    });
  });

  it("dev web은 기존처럼 Vite 인자를 그대로 전달한다", async () => {
    const parsed = await parseSonamuArgs(program, ["dev", "web", "--port", "3000"]);

    expect(parsed).toEqual({
      command: "dev.web",
      arguments: {},
      options: {},
      passthrough: ["--port", "3000"],
    });
  });

  it("build 명령과 dev의 알 수 없는 옵션은 거부한다", async () => {
    await expect(parseSonamuArgs(program, ["build", "--deploy"])).rejects.toMatchObject({
      name: SonamuUsageError.name,
      code: "UNKNOWN_OPTION",
    });
    await expect(parseSonamuArgs(program, ["dev", "--unknown"])).rejects.toMatchObject({
      name: SonamuUsageError.name,
      code: "UNKNOWN_OPTION",
    });
  });

  it("deploy가 true이면 SONAMU_DEPLOY=yes를 설정한다", () => {
    const env = createDevEnvironment("/tmp/api", { PATH: "/bin" }, { deploy: true });

    expect(env).toMatchObject({
      PATH: "/bin",
      NODE_ENV: "development",
      HOT: "yes",
      API_ROOT_PATH: "/tmp/api",
      SONAMU_DEPLOY: "yes",
    });
    expect(env.SONAMU_DISABLE_INTEGRATED_WEB).toBeUndefined();
  });

  it("deploy가 false이면 부모 환경의 SONAMU_DEPLOY도 제거한다", () => {
    const env = createDevEnvironment(
      "/tmp/api",
      { PATH: "/bin", SONAMU_DEPLOY: "yes" },
      { apiOnly: true, deploy: false },
    );

    expect(env.SONAMU_DISABLE_INTEGRATED_WEB).toBe("yes");
    expect(env.SONAMU_DEPLOY).toBeUndefined();
  });

  it.each([
    { args: ["dev"], expectedDeploy: undefined, expectedApiOnly: undefined },
    { args: ["dev", "--deploy"], expectedDeploy: "yes", expectedApiOnly: undefined },
    { args: ["dev", "all", "--deploy"], expectedDeploy: "yes", expectedApiOnly: undefined },
    { args: ["dev", "api", "--deploy"], expectedDeploy: "yes", expectedApiOnly: "yes" },
  ])(
    "runSonamuCli($args)가 실제 dev 핸들러로 SONAMU_DEPLOY=$expectedDeploy 를 전달한다",
    async ({ args, expectedDeploy, expectedApiOnly }) => {
      const originalDeploy = process.env.SONAMU_DEPLOY;
      process.env.SONAMU_DEPLOY = "yes";
      const calls: RunChildProcessOptions[] = [];
      const deps = {
        findApiRootPath: () => "/tmp/sonamu-dev-deploy-test-api",
        runChildProcess: async (options: RunChildProcessOptions) => {
          calls.push(options);
          return { exitCode: 0 };
        },
      };
      try {
        const result = await runSonamuCli({
          args,
          handlers: {
            "dev.all": createDevHandler(false, deps),
            "dev.api": createDevHandler(true, deps),
          },
          loadPlugins: async () => [],
          output: { stdout: () => {}, stderr: () => {} },
          exit: { setExitCode: () => {} },
        });

        expect(result.exitCode).toBe(0);
        expect(calls).toHaveLength(1);
        expect(calls[0]?.spawnOptions?.env?.SONAMU_DEPLOY).toBe(expectedDeploy);
        expect(calls[0]?.spawnOptions?.env?.SONAMU_DISABLE_INTEGRATED_WEB).toBe(expectedApiOnly);
      } finally {
        if (originalDeploy === undefined) {
          delete process.env.SONAMU_DEPLOY;
        } else {
          process.env.SONAMU_DEPLOY = originalDeploy;
        }
      }
    },
  );
});
