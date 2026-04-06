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
  delete process.env.TS_LOADER_TRANSFORM_CONFIG_PATH;
}

describe("ensureTsLoaderRegistered", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unmock("node:module");
    vi.unmock("../../utils/fs-utils.js");
    resetRegisterState();
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unmock("node:module");
    vi.unmock("../../utils/fs-utils.js");
    resetRegisterState();
  });

  it("프로젝트 .swcrc를 우선 사용하고 중복 등록하지 않는다", async () => {
    const registerMock = vi.fn();
    vi.doMock("node:module", () => ({
      register: registerMock,
    }));
    vi.doMock("../../utils/fs-utils.js", () => ({
      exists: vi.fn(async (candidate: string) => candidate === "/tmp/fixture-api/.swcrc"),
    }));

    const module = await import("../ts-loader-registration");

    expect(registerMock).not.toHaveBeenCalled();

    await module.ensureTsLoaderRegistered("/tmp/fixture-api");

    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(registerMock).toHaveBeenCalledWith("@sonamu-kit/ts-loader/loader", {
      parentURL: expect.stringContaining("/src/bin/ts-loader-registration"),
    });
    expect(process.env.TS_LOADER_TRANSFORM_CONFIG_PATH).toBe("/tmp/fixture-api/.swcrc");

    await module.ensureTsLoaderRegistered("/tmp/another-api");

    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(process.env.TS_LOADER_TRANSFORM_CONFIG_PATH).toBe("/tmp/fixture-api/.swcrc");
  });
});
