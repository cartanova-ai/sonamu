import { type MakeDirectoryOptions, type Mode, type PathLike, type RmOptions } from "fs";
import { type FileHandle } from "fs/promises";

import { Naite } from "sonamu";
import { vi } from "vitest";

// 가상 mtime 추적: mock writeFile이 실제 디스크에 안 쓰지만 syncer.trackWritten은
// stat으로 mtime을 읽으니 그것만큼은 흉내내야 함. path → mtimeMs.
const mockMtimes = new Map<string, number>();

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
      mockMtimes.set(filePath, Date.now());
    }),
    stat: vi.fn(async (path: PathLike) => {
      const filePath = typeof path === "string" ? path : path.toString();
      const mtimeMs = mockMtimes.get(filePath);
      if (mtimeMs !== undefined) {
        // mock writeFile로 기록된 path만 가짜 mtime 반환. 실제 디스크 hit 없음.
        return { mtimeMs } as Awaited<ReturnType<typeof actual.stat>>;
      }
      return actual.stat(path);
    }),
    rm: vi.fn(async (path: PathLike, options?: RmOptions) => {
      const filePath = typeof path === "string" ? path : path.toString();

      Naite.t(`fs/promises:rm`, { path: filePath, options });
      // 실제 삭제하지 않고 기록만 함
      return Promise.resolve();
    }),
  };
});
