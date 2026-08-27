import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { exists } from "../../../../../modules/sonamu/dist/utils/fs-utils";

describe("fs-utils", () => {
  let testRoot: string;

  beforeEach(async () => {
    testRoot = await mkdtemp(join(tmpdir(), "sonamu-fs-utils-"));
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  describe("기본 존재 여부 체크", () => {
    test("파일이 존재하는 경우 true를 반환한다", async () => {
      const filePath = join(testRoot, "existing.txt");
      await writeFile(filePath, "내용");

      await expect(exists(filePath)).resolves.toBe(true);
    });

    test("파일이 존재하지 않는 경우 false를 반환한다", async () => {
      await expect(exists(join(testRoot, "missing.txt"))).resolves.toBe(false);
    });
  });

  describe("실제 사용 패턴", () => {
    test("디렉터리가 없으면 생성한다", async () => {
      const dirPath = join(testRoot, "new", "directory");

      if (!(await exists(dirPath))) {
        await mkdir(dirPath, { recursive: true });
      }

      await expect(exists(dirPath)).resolves.toBe(true);
    });

    test("기존 디렉터리를 유지한다", async () => {
      const dirPath = join(testRoot, "existing");
      await mkdir(dirPath);
      let mkdirBranchTaken = false;

      if (!(await exists(dirPath))) {
        mkdirBranchTaken = true;
        await mkdir(dirPath, { recursive: true });
      }

      expect(mkdirBranchTaken).toBe(false);
      await expect(exists(dirPath)).resolves.toBe(true);
    });

    test("파일이 있으면 삭제한다", async () => {
      const filePath = join(testRoot, "delete.txt");
      await writeFile(filePath, "삭제 대상");

      if (await exists(filePath)) {
        await rm(filePath, { force: true });
      }

      await expect(exists(filePath)).resolves.toBe(false);
    });

    test("파일이 없으면 삭제하지 않는다", async () => {
      const filePath = join(testRoot, "missing.txt");
      let rmBranchTaken = false;

      if (await exists(filePath)) {
        rmBranchTaken = true;
        await rm(filePath, { force: true });
      }

      expect(rmBranchTaken).toBe(false);
      await expect(exists(filePath)).resolves.toBe(false);
    });

    test("파일이 있을 때만 읽는다", async () => {
      const configPath = join(testRoot, "app.config.json");
      await writeFile(configPath, '{"key":"value"}');

      const content = (await exists(configPath)) ? await readFile(configPath, "utf8") : undefined;

      expect(content).toBe('{"key":"value"}');
    });

    test("파일이 없으면 읽지 않는다", async () => {
      const configPath = join(testRoot, "missing.json");
      const content = (await exists(configPath)) ? await readFile(configPath, "utf8") : undefined;

      expect(content).toBeUndefined();
    });
  });
});
