import type { PathLike } from "fs";
import type { FileHandle } from "fs/promises";
import { Naite } from "sonamu";
import { vi } from "vitest";

// Proxy 방식 테스트
vi.mock("fs/promises", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("fs/promises");
  return {
    ...actual,
    access: vi.fn((path: PathLike, mode?: number) => {
      const vfs = Naite.get("mock:fs/promises:virtualFileSystem").result();
      if (vfs.some((v) => v === path)) {
        return Promise.resolve();
      }

      return actual.access(path, mode);
    }),
    writeFile: vi.fn((path: PathLike | FileHandle, data: string | Buffer | Uint8Array) => {
      Naite.t("fs/promises:writeFile", { file: path, data });
    }),
  };
});
