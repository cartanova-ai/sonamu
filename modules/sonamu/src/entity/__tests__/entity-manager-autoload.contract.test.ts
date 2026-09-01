/// <reference types="node" />

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

interface EntityManagerModule {
  readonly EntityManager: {
    isAutoloaded: boolean;
    autoload(doSilent?: boolean, apiRootPath?: string): Promise<void>;
  };
}

interface SonamuModule {
  readonly Sonamu: {
    readonly apiRootPath: string;
  };
}

const temporaryRoots: string[] = [];

async function importProduction<T>(relativePath: string): Promise<T> {
  const loaded: unknown = await import(
    /* @vite-ignore */ new URL(relativePath, import.meta.url).href
  );
  // SAFETY: 테스트는 명시한 singleton 공개 API만 호출합니다.
  return loaded as T;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("EntityManager 명시적 API 루트", () => {
  it("Sonamu singleton이 초기화되지 않아도 전달한 apiRootPath로 autoload한다", async () => {
    const [{ EntityManager }, { Sonamu }] = await Promise.all([
      importProduction<EntityManagerModule>("../entity-manager.ts"),
      importProduction<SonamuModule>("../../api/sonamu.ts"),
    ]);
    const apiRootPath = await mkdtemp(path.join(os.tmpdir(), "sonamu-entity-autoload-"));
    temporaryRoots.push(apiRootPath);
    const previousAutoloaded = EntityManager.isAutoloaded;
    EntityManager.isAutoloaded = false;

    expect(() => Sonamu.apiRootPath).toThrow(/init/i);
    try {
      await expect(EntityManager.autoload(true, apiRootPath)).resolves.toBeUndefined();
      expect(EntityManager.isAutoloaded).toBe(true);
    } finally {
      EntityManager.isAutoloaded = previousAutoloaded;
    }
  });
});
