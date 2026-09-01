import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { Sonamu } from "../../api/sonamu";
import { EntityManager } from "../entity-manager";

const temporaryRoots: string[] = [];

const POST_ENTITY_JSON = {
  id: "Post",
  table: "posts",
  title: "게시글",
  props: [
    { name: "id", type: "integer" },
    { name: "title", type: "string", length: 128 },
  ],
  indexes: [],
  subsets: {},
  enums: {},
};

async function createApiRootWithEntity(): Promise<string> {
  const apiRootPath = await mkdtemp(path.join(os.tmpdir(), "sonamu-explicit-root-"));
  temporaryRoots.push(apiRootPath);
  const entityDirectory = path.join(apiRootPath, "src", "application", "post");
  await mkdir(entityDirectory, { recursive: true });
  await writeFile(
    path.join(entityDirectory, "post.entity.json"),
    JSON.stringify(POST_ENTITY_JSON, null, 2),
    "utf8",
  );
  return apiRootPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("EntityManager 명시적 API 루트 등록", () => {
  it("Sonamu 초기화 전에도 명시한 루트의 entity.json을 등록한다", async () => {
    const apiRootPath = await createApiRootWithEntity();
    const previousAutoloaded = EntityManager.isAutoloaded;
    EntityManager.isAutoloaded = false;

    // 명시적 루트 경로는 Sonamu singleton 초기화 없이 동작해야 합니다.
    expect(() => Sonamu.apiRootPath).toThrow(/init/i);
    try {
      await expect(EntityManager.autoload(true, apiRootPath)).resolves.toBeUndefined();

      expect(EntityManager.isAutoloaded).toBe(true);
      expect(EntityManager.exists("Post")).toBe(true);
      expect(EntityManager.get("Post").table).toBe("posts");
      expect(EntityManager.modulePaths.get("PostBaseSchema")).toBe("sonamu.generated");
    } finally {
      EntityManager.isAutoloaded = previousAutoloaded;
    }
  });

  it("reload()는 autoload에 넘긴 명시적 루트를 그대로 다시 읽는다", async () => {
    const apiRootPath = await createApiRootWithEntity();
    const previousAutoloaded = EntityManager.isAutoloaded;
    EntityManager.isAutoloaded = false;

    expect(() => Sonamu.apiRootPath).toThrow(/init/i);
    try {
      await EntityManager.autoload(true, apiRootPath);
      expect(EntityManager.exists("Post")).toBe(true);

      // 보존한 루트를 잃으면 초기화되지 않은 Sonamu.apiRootPath로 폴백해 throw합니다.
      await expect(EntityManager.reload(true)).resolves.toBeUndefined();
      expect(EntityManager.exists("Post")).toBe(true);
      expect(EntityManager.get("Post").table).toBe("posts");
    } finally {
      EntityManager.isAutoloaded = previousAutoloaded;
    }
  });

  it("reload()에 넘긴 루트는 보존된 루트보다 우선한다", async () => {
    const firstRootPath = await createApiRootWithEntity();
    const secondRootPath = await createApiRootWithEntity();
    // 두 번째 루트에만 존재하는 entity로 어느 루트를 읽었는지 구분합니다.
    const commentDirectory = path.join(secondRootPath, "src", "application", "comment");
    await mkdir(commentDirectory, { recursive: true });
    await writeFile(
      path.join(commentDirectory, "comment.entity.json"),
      JSON.stringify({ ...POST_ENTITY_JSON, id: "Comment", table: "comments" }, null, 2),
      "utf8",
    );

    const previousAutoloaded = EntityManager.isAutoloaded;
    EntityManager.isAutoloaded = false;
    try {
      await EntityManager.autoload(true, firstRootPath);
      expect(EntityManager.exists("Comment")).toBe(false);

      await EntityManager.reload(true, secondRootPath);
      expect(EntityManager.exists("Comment")).toBe(true);
    } finally {
      EntityManager.isAutoloaded = previousAutoloaded;
    }
  });
});
