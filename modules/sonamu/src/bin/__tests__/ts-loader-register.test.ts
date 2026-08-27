import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureTsLoaderRegistered } from "../ts-loader-registration";

const tsLoaderRegisterStateKey = Symbol.for("sonamu.ts-loader-register.state");

type TsLoaderRegisterState = {
  registered: boolean;
};

type GlobalWithTsLoaderRegisterState = typeof globalThis & {
  [tsLoaderRegisterStateKey]?: TsLoaderRegisterState;
};

function resetRegisterState() {
  const globalState =
    /* SAFETY: CLI 파서와 빌드 도구 입력 계약이 이 값의 타입을 보장한다. */ globalThis as GlobalWithTsLoaderRegisterState;
  delete globalState[tsLoaderRegisterStateKey];
}

describe("ensureTsLoaderRegistered", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetRegisterState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetRegisterState();
  });

  it("중복 등록하지 않는다", async () => {
    const registerFake = vi.fn();
    const dependencies = {
      registerLoader: registerFake,
      resolveLoaderPath: () => "/modules/ts-loader/dist/loader.js",
    };

    expect(registerFake).not.toHaveBeenCalled();

    await ensureTsLoaderRegistered("/tmp/fixture-api", dependencies);

    expect(registerFake).toHaveBeenCalledTimes(1);
    expect(registerFake).toHaveBeenCalledWith(
      expect.stringContaining("/modules/ts-loader/dist/loader.js"),
      {
        parentURL: expect.stringContaining("/src/bin/ts-loader-registration"),
      },
    );

    await ensureTsLoaderRegistered("/tmp/another-api", dependencies);

    expect(registerFake).toHaveBeenCalledTimes(1);
  });
});
