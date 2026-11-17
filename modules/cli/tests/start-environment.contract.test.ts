import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStartEnvironment } from "../src/handlers.js";

describe("sonamu start 환경", () => {
  let apiRootPath = "";

  beforeEach(async () => {
    apiRootPath = await mkdtemp(path.join(os.tmpdir(), "sonamu-cli-start-"));
  });

  afterEach(async () => {
    await rm(apiRootPath, { recursive: true, force: true });
  });

  it.each(["", undefined])("NODE_ENV가 %j이면 production으로 서버를 띄운다", async (nodeEnv) => {
    const env = await createStartEnvironment(apiRootPath, { NODE_ENV: nodeEnv, PATH: "/bin" });

    expect(env.NODE_ENV).toBe("production");
    expect(env.PATH).toBe("/bin");
  });

  it("명시한 NODE_ENV는 그대로 넘긴다", async () => {
    const env = await createStartEnvironment(apiRootPath, { NODE_ENV: "staging" });

    expect(env.NODE_ENV).toBe("staging");
  });

  it("NODE_ENV를 .env에만 둔 경우 그 값을 따른다", async () => {
    await writeFile(path.join(apiRootPath, ".env"), "NODE_ENV=staging\n");

    const env = await createStartEnvironment(apiRootPath, {});

    expect(env.NODE_ENV).toBe("staging");
  });
});
