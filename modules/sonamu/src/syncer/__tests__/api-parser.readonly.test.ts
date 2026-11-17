import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { registeredApis } from "../../api/decorators";
import { type AbsolutePath } from "../../utils/path-utils";
import { readApisFromFile } from "../api-parser";

describe("readApisFromFile readonly 타입 연산자", () => {
  let originalApis: Array<(typeof registeredApis)[number]> = [];
  let tempDir: string | null = null;

  beforeEach(() => {
    originalApis = [...registeredApis];
  });

  afterEach(async () => {
    registeredApis.splice(0, registeredApis.length, ...originalApis);
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("readonly 배열·튜플 파라미터를 내부 타입으로 풀어낸다", async () => {
    registeredApis.push({
      modelName: "RoModel",
      methodName: "foo",
      path: "/ro/foo",
      options: { httpMethod: "POST" },
    });

    tempDir = await mkdtemp(path.join(tmpdir(), "sonamu-api-parser-"));
    const filePath: AbsolutePath = `/${path.relative("/", path.join(tempDir, "ro.model.ts"))}`;
    await writeFile(
      filePath,
      `
class RoModelClass {
  @api({ httpMethod: "POST" })
  async foo(ids: readonly number[], pair: readonly [string, number]): Promise<number> {
    return 1;
  }
}
`,
    );

    const [api] = await readApisFromFile(filePath);
    expect(api?.parameters.map((p) => p.type)).toEqual([
      { t: "array", elementsType: "number" },
      { t: "tuple-type", elements: ["string", "number"] },
    ]);
  });
});
