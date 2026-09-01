import { afterEach, describe, expect, it, vi } from "vitest";

import * as authModule from "../../auth";
import { tooling } from "../cli-tooling";

function stubGenerator() {
  return vi.spyOn(authModule, "generateBetterAuthEntities").mockResolvedValue(undefined);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("auth.generate tooling 연산", () => {
  it("plugins 옵션이 없으면 빈 플러그인 목록으로 core 엔티티를 생성한다", async () => {
    const generate = stubGenerator();

    await expect(tooling.auth.generate({})).resolves.toBeUndefined();

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith({ plugins: [] });
  });

  it("plugins 값이 undefined로 전달되어도 빈 플러그인 목록으로 처리한다", async () => {
    const generate = stubGenerator();

    await expect(tooling.auth.generate({ plugins: undefined })).resolves.toBeUndefined();

    expect(generate).toHaveBeenCalledWith({ plugins: [] });
  });

  it.each([
    ["배열", ["admin", "jwt"]],
    ["숫자", 1],
    ["객체", { admin: true }],
    ["불리언", true],
  ])("plugins가 문자열이 아닌 %s이면 인자 오류로 거절한다", async (_label, plugins) => {
    const generate = stubGenerator();

    // 문자열이 아닌 값을 조용히 무시하면 잘못된 입력이 core 전용 생성으로 둔갑합니다.
    await expect(tooling.auth.generate({ plugins })).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
      exitCode: 2,
    });

    expect(generate).not.toHaveBeenCalled();
  });

  it("plugins가 빈 문자열이면 빈 플러그인 목록으로 처리한다", async () => {
    const generate = stubGenerator();

    await expect(tooling.auth.generate({ plugins: "" })).resolves.toBeUndefined();

    expect(generate).toHaveBeenCalledWith({ plugins: [] });
  });

  it("쉼표로 구분한 plugins 목록은 그대로 전달한다", async () => {
    const generate = stubGenerator();

    await tooling.auth.generate({ plugins: "admin, jwt" });

    expect(generate).toHaveBeenCalledWith({ plugins: ["admin", "jwt"] });
  });

  it("지원하지 않는 plugin은 거절하고 엔티티 생성을 시도하지 않는다", async () => {
    const generate = stubGenerator();

    await expect(tooling.auth.generate({ plugins: "bogus" })).rejects.toThrow();

    expect(generate).not.toHaveBeenCalled();
  });
});
