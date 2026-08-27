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

describe("ensureTsLoaderRegistered", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unmock("node:module");
    resetRegisterState();
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unmock("node:module");
    resetRegisterState();
  });

  it("중복 등록하지 않는다", async () => {
    const registerMock = vi.fn();
    vi.doMock("node:module", async (importOriginal) => ({
      ...(await importOriginal<typeof import("node:module")>()),
      register: registerMock,
    }));

    const module = await import("../ts-loader-registration");

    expect(registerMock).not.toHaveBeenCalled();

    await module.ensureTsLoaderRegistered("/tmp/fixture-api");

    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(registerMock).toHaveBeenCalledWith(
      expect.stringContaining("/modules/ts-loader/dist/loader.js"),
      {
        parentURL: expect.stringContaining("/src/bin/ts-loader-registration"),
      },
    );

    await module.ensureTsLoaderRegistered("/tmp/another-api");

    expect(registerMock).toHaveBeenCalledTimes(1);
  });
});
