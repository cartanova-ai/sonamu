import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tsLoaderRegisterStateKey = Symbol.for("sonamu.ts-loader-register.state");

type TsLoaderRegisterState = {
  registered: boolean;
};

type GlobalWithTsLoaderRegisterState = typeof globalThis & {
  [tsLoaderRegisterStateKey]?: TsLoaderRegisterState;
};

function resetRegisterState() {
  const globalState = globalThis as GlobalWithTsLoaderRegisterState;
  delete globalState[tsLoaderRegisterStateKey];
}

async function createTempRoot(): Promise<string> {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "sonamu-config-test-"));
  await writeFile(path.join(rootPath, ".env"), "SONAMU_DB_HOST=localhost\n");
  return rootPath;
}

async function writeSourceFixture(rootPath: string): Promise<void> {
  await mkdir(path.join(rootPath, "src"), { recursive: true });
  await writeFile(
    path.join(rootPath, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          experimentalDecorators: true,
          module: "esnext",
          target: "esnext",
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(rootPath, "src", "support.ts"),
    `
export const fastifyOptions = { keepAliveTimeout: 4321 };
export function customPlugin() {
  return "plugin";
}
export function contextProvider(defaultContext) {
  return defaultContext;
}
export function guardHandler() {}
`,
  );
  await writeFile(
    path.join(rootPath, "src", "sonamu.config.ts"),
    `
import { customPlugin, contextProvider, fastifyOptions, guardHandler } from "./support";

export default {
  api: {
    dir: "./src",
    route: {
      prefix: "/api",
    },
  },
  i18n: {
    defaultLocale: "ko",
    supportedLocales: ["ko"],
  },
  sync: {
    targets: ["web"],
  },
  server: {
    fastify: fastifyOptions,
    plugins: {
      custom: customPlugin,
    },
    apiConfig: {
      contextProvider,
      guardHandler,
    },
  },
  test: {
    parallel: true,
    maxWorkers: 3,
    devRunner: {
      enabled: true,
      routePrefix: "/__test__",
    },
  },
};
`,
  );
}

async function writeDistFixture(rootPath: string): Promise<void> {
  await mkdir(path.join(rootPath, "dist"), { recursive: true });
  await writeFile(
    path.join(rootPath, "dist", "sonamu.config.js"),
    `
export default {
  api: {
    dir: "./dist",
    route: {
      prefix: "/api",
    },
  },
  i18n: {
    defaultLocale: "en",
    supportedLocales: ["en"],
  },
  sync: {
    targets: ["web"],
  },
  server: {
    apiConfig: {
      contextProvider(defaultContext) {
        return defaultContext;
      },
      guardHandler() {},
    },
  },
  test: {
    devRunner: {
      enabled: false,
    },
  },
};
`,
  );
}

describe("loadConfig", () => {
  const tempRoots: string[] = [];
  const originalHot = process.env.HOT;
  const originalVitest = process.env.VITEST;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unmock("../../bin/ts-loader-registration");
    resetRegisterState();
  });

  afterEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unmock("../../bin/ts-loader-registration");
    resetRegisterState();

    if (originalHot === undefined) {
      delete process.env.HOT;
    } else {
      process.env.HOT = originalHot;
    }

    if (originalVitest === undefined) {
      delete process.env.VITEST;
    } else {
      process.env.VITEST = originalVitest;
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    await Promise.all(
      tempRoots.splice(0).map((rootPath) => rm(rootPath, { recursive: true, force: true })),
    );
  });

  it("source config 로드 전에 ts-loader 등록을 보장한다", async () => {
    const rootPath = await createTempRoot();
    tempRoots.push(rootPath);
    await writeSourceFixture(rootPath);

    process.env.VITEST = "true";
    const ensureTsLoaderRegistered = vi.fn(async () => {});
    vi.doMock("../../bin/ts-loader-registration", () => ({
      ensureTsLoaderRegistered,
    }));

    const { loadConfig } = await import("../config");
    const config = await loadConfig(rootPath);

    expect(ensureTsLoaderRegistered).toHaveBeenCalledTimes(1);
    expect(ensureTsLoaderRegistered).toHaveBeenCalledWith(rootPath);
    expect(config.test?.devRunner?.enabled).toBe(true);
  });

  it("dist config 로딩 경로는 기존과 동일하게 유지한다", async () => {
    const rootPath = await createTempRoot();
    tempRoots.push(rootPath);
    await writeDistFixture(rootPath);

    delete process.env.HOT;
    delete process.env.VITEST;
    const ensureTsLoaderRegistered = vi.fn(async () => {});
    vi.doMock("../../bin/ts-loader-registration", () => ({
      ensureTsLoaderRegistered,
    }));

    const { loadConfig } = await import("../config");
    const config = await loadConfig(rootPath);

    expect(ensureTsLoaderRegistered).not.toHaveBeenCalled();
    expect(config.api.dir).toBe("./dist");
    expect(config.test?.devRunner?.enabled).toBe(false);
  });

  it("source config가 확장자 없는 상대 import와 런타임 객체를 유지하며 반복 로드된다", async () => {
    const rootPath = await createTempRoot();
    tempRoots.push(rootPath);
    await writeSourceFixture(rootPath);

    process.env.VITEST = "true";
    vi.unmock("../../bin/ts-loader-registration");
    const { loadConfig } = await import("../config");
    const firstConfig = await loadConfig(rootPath);
    const secondConfig = await loadConfig(rootPath);
    const fastify = {} as FastifyInstance;

    expect(firstConfig.server.fastify).toStrictEqual({ keepAliveTimeout: 4321 });
    expect(firstConfig.server.plugins?.custom?.(fastify)).toBe("plugin");
    expect(firstConfig.test?.parallel).toBe(true);
    expect(firstConfig.test?.maxWorkers).toBe(3);
    expect(firstConfig.test?.devRunner?.enabled).toBe(true);
    expect(secondConfig.server.plugins?.custom?.(fastify)).toBe("plugin");
    expect(secondConfig.server.fastify).toStrictEqual({ keepAliveTimeout: 4321 });
  });
});
