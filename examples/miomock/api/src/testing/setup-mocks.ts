import type { PathLike } from "fs";
import type { FileHandle } from "fs/promises";
import { Naite, type NaiteMockRegistry } from "sonamu";
import { vi } from "vitest";

declare module "sonamu" {
  export interface NaiteMockRegistry {
    "fs/promises": typeof import("fs/promises");
  }
}

// Proxy 방식 테스트
vi.mock("fs/promises", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("fs/promises");
  const wrapped = wrapMockProxy("fs/promises", actual);
  return {
    ...wrapped,
    writeFile: vi.fn((path: PathLike | FileHandle, data: string | Buffer | Uint8Array) => {
      Naite.t("fs/promises:writeFile", { file: path, data });

      return Promise.resolve();
    }),
  };
});

export function wrapMockProxy<K extends keyof NaiteMockRegistry>(
  moduleKey: K,
  // biome-ignore lint/suspicious/noExplicitAny: mock 대상
  actual: any,
): NaiteMockRegistry[K] {
  // biome-ignore lint/suspicious/noExplicitAny: mock 대상
  const proxy: any = { ...actual };

  for (const key of Object.keys(actual)) {
    const value = actual[key];
    if (typeof value === "function") {
      // biome-ignore lint/suspicious/noExplicitAny: mock 대상
      proxy[key] = vi.fn((...args: any[]) => {
        const config = Naite.getMockConfig(moduleKey, key, args);
        if (!config) {
          return value(...args);
        }

        Naite.t(`mocked:${String(moduleKey)}.${key}`, { args, config });

        if ("handler" in config) {
          return config.handler(...args);
        }
        if ("throws" in config) {
          return Promise.reject(config.throws);
        }
        return Promise.resolve(config.returns);
      });
    }
  }

  return proxy;
}
