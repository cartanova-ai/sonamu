import type { MakeDirectoryOptions, Mode, PathLike } from "fs";
import type { FileHandle } from "fs/promises";
import { Naite } from "sonamu";
import { vi } from "vitest";

// GlobalMock: fs/promises
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
    mkdir: vi.fn(
      async (
        path: PathLike,
        options?: MakeDirectoryOptions | Mode | null,
      ): Promise<string | undefined> => {
        Naite.t("fs:mkdir", { path, options });
        if (typeof options === "object" && options?.recursive) {
          return typeof path === "string" ? path : path.toString();
        }
        return undefined;
      },
    ),
    writeFile: vi.fn((path: PathLike | FileHandle, data: string | Buffer | Uint8Array) => {
      const filePath = typeof path === "string" ? path : path.toString();

      Naite.t(`fs/promises:writeFile`, { path: filePath, data });
    }),
  };
});
