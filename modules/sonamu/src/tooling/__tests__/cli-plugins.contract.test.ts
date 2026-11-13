import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { Sonamu } from "../../api/sonamu";
import { DB } from "../../database/db";
import { EntityManager } from "../../entity/entity-manager";
import { Syncer } from "../../syncer/syncer";
import { TemplateManager } from "../../template";
import { type AbsolutePath } from "../../utils/path-utils";
import { loadCliPlugins, SonamuCliPluginError, validateCliPlugins } from "../index";

const temporaryRoots: string[] = [];
const envBeforeTest = { ...process.env };

function restoreEnv(snapshot: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(process.env)) {
    if (!Object.hasOwn(snapshot, key)) delete process.env[key];
  }
  Object.assign(process.env, snapshot);
}

async function createProject(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "sonamu-cli-plugins-"));
  temporaryRoots.push(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, ".env"), "SONAMU_DB_HOST=common-host\n");
  await writeFile(path.join(root, ".env.development"), "SONAMU_DB_NAME=dev_db\n");
  await writeFile(path.join(root, ".env.production"), "SONAMU_DB_NAME=prod_db\n");
  await writeFile(
    path.join(root, "src", "sonamu.config.ts"),
    `
export default {
  projectName: "PluginEnv",
  api: { dir: "api", route: { prefix: "/api" } },
  database: {},
  i18n: { defaultLocale: "ko", supportedLocales: ["ko"] },
  sync: { targets: [] },
  logging: false,
  server: { apiConfig: { contextProvider: (context) => context, guardHandler: () => {} } },
  cli: { plugins: [{ name: "probe", commands: [{ path: ["probe"], run: () => null }] }] },
};
`,
  );
  return root;
}

const run = () => null;

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  restoreEnv(envBeforeTest);
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("CLI 플러그인 로딩", () => {
  it("설정의 플러그인을 검증한 원본 객체 그대로 반환한다", async () => {
    const root = await createProject();

    const plugins = await loadCliPlugins(root);

    expect(plugins.map((plugin) => plugin.name)).toEqual(["probe"]);
    expect(plugins[0].commands[0].path).toEqual(["probe"]);
  });

  it("sonamu 설정이 없는 디렉터리에는 플러그인이 없다", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "sonamu-cli-plugins-empty-"));
    temporaryRoots.push(root);

    await expect(loadCliPlugins(root)).resolves.toEqual([]);
  });

  it("빌드되지 않은 프로젝트는 빌드가 필요하다는 오류로 실패한다", async () => {
    const root = await createProject();
    // Without VITEST or HOT the loader reads dist/sonamu.config.js, which this project lacks.
    delete process.env.VITEST;
    delete process.env.HOT;

    await expect(loadCliPlugins(root)).rejects.toMatchObject({
      code: "CONFIG_NOT_BUILT",
      message: expect.stringMatching(/Build the project first/),
    });
  });

  it("미리 로딩해도 이후 Sonamu.init의 dbConfig와 process.env가 달라지지 않는다", async () => {
    const root = await createProject();
    vi.stubEnv("NODE_ENV", "development");
    vi.spyOn(DB, "setConfig").mockImplementation(() => {});
    vi.spyOn(EntityManager, "autoload").mockResolvedValue(undefined);
    vi.spyOn(Syncer.prototype, "autoloadTypes").mockResolvedValue(undefined);
    vi.spyOn(Syncer.prototype, "autoloadModels").mockResolvedValue(undefined);
    vi.spyOn(Syncer.prototype, "autoloadApis").mockResolvedValue(undefined);
    vi.spyOn(Syncer.prototype, "autoloadWorkflows").mockResolvedValue(undefined);
    vi.spyOn(Syncer.prototype, "autoloadSsrRoutes").mockResolvedValue(undefined);
    vi.spyOn(TemplateManager, "autoload").mockResolvedValue(undefined);
    const snapshot = Sonamu.captureTestingSnapshot();
    const initialized = Sonamu.isInitialized;
    const initializeWorkflows = Sonamu["initializeWorkflows"];
    const dbConfig = Sonamu["dbConfigValue"];
    Sonamu["initializeWorkflows"] = async () => {};
    const envBefore = { ...process.env };

    async function initialize(earlyLoad: boolean) {
      restoreEnv(envBefore);
      Sonamu.isInitialized = false;
      if (earlyLoad) {
        await loadCliPlugins(root);
        expect({ ...process.env }).toEqual(envBefore);
      }
      // SAFETY: mkdtemp returns an absolute path.
      await Sonamu.init(true, false, root as AbsolutePath);
      return { dbConfig: structuredClone(Sonamu.dbConfig), env: { ...process.env } };
    }

    try {
      const withoutEarlyLoad = await initialize(false);
      const withEarlyLoad = await initialize(true);

      expect(withoutEarlyLoad.dbConfig.production.connection).toMatchObject({
        database: "prod_db",
      });
      expect(withEarlyLoad).toEqual(withoutEarlyLoad);
    } finally {
      Sonamu.restoreTestingSnapshot(snapshot);
      Sonamu.isInitialized = initialized;
      Sonamu["initializeWorkflows"] = initializeWorkflows;
      Reflect.set(Sonamu, "dbConfigValue", dbConfig);
    }
  });
});

describe("CLI 플러그인 선언 검증", () => {
  it.each([
    ["빈 플러그인 이름", [{ name: " ", commands: [] }], " ", undefined, /name must not be empty/],
    [
      "CLI 단어가 아닌 경로",
      [{ name: "p", commands: [{ path: ["Search"], run }] }],
      "p",
      "Search",
      /path words/,
    ],
    [
      "camelCase가 아닌 옵션 키",
      [
        {
          name: "p",
          commands: [{ path: ["a"], options: { "max-rounds": { type: "integer" } }, run }],
        },
      ],
      "p",
      "a",
      /option key "max-rounds"/,
    ],
    [
      "camelCase가 아닌 인자 이름",
      [{ name: "p", commands: [{ path: ["a"], arguments: [{ name: "Index" }], run }] }],
      "p",
      "a",
      /argument names/,
    ],
    [
      "중복된 인자 이름",
      [{ name: "p", commands: [{ path: ["a"], arguments: [{ name: "x" }, { name: "x" }], run }] }],
      "p",
      "a",
      /declared twice/,
    ],
    [
      "선택 인자 뒤의 필수 인자",
      [
        {
          name: "p",
          commands: [
            { path: ["a"], arguments: [{ name: "x", required: false }, { name: "y" }], run },
          ],
        },
      ],
      "p",
      "a",
      /required arguments must come before optional/,
    ],
    [
      "마지막이 아닌 가변 인자",
      [
        {
          name: "p",
          commands: [
            { path: ["a"], arguments: [{ name: "x", variadic: true }, { name: "y" }], run },
          ],
        },
      ],
      "p",
      "a",
      /only the last argument may be variadic/,
    ],
    [
      "boolean 옵션의 required",
      [
        {
          name: "p",
          commands: [{ path: ["a"], options: { force: { type: "boolean", required: true } }, run }],
        },
      ],
      "p",
      "a",
      /required and multiple apply only/,
    ],
    [
      "string이 아닌 옵션의 choices",
      [
        {
          name: "p",
          commands: [{ path: ["a"], options: { size: { type: "integer", choices: ["1"] } }, run }],
        },
      ],
      "p",
      "a",
      /choices apply only to string/,
    ],
    [
      "함수가 아닌 run",
      [{ name: "p", commands: [{ path: ["a"], run: "noop" }] }],
      "p",
      "a",
      /run must be a function/,
    ],
    [
      "플러그인 간 중복 경로",
      [
        { name: "p", commands: [{ path: ["a", "b"], run }] },
        { name: "q", commands: [{ path: ["a", "b"], run }] },
      ],
      "q",
      "a b",
      /already declared by plugin "p"/,
    ],
    [
      "다른 명령의 접두사인 경로",
      [
        {
          name: "p",
          commands: [
            { path: ["a", "b"], run },
            { path: ["a"], run },
          ],
        },
      ],
      "p",
      "a",
      /must not be a prefix/,
    ],
  ])("%s 선언을 거부한다", (_title, plugins, plugin, command, rule) => {
    let thrown: unknown;
    try {
      validateCliPlugins(plugins);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SonamuCliPluginError);
    expect(thrown).toMatchObject({
      code: "INVALID_CLI_PLUGIN",
      plugin,
      command,
      rule: expect.stringMatching(rule),
    });
  });
});
