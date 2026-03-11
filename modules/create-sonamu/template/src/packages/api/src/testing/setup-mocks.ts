import type { PathLike } from "fs";
// import { Naite } from "sonamu";
import { vi } from "vitest";

// GlobalMock: fs/promises (사용 예시 - 필요시 활성화)
vi.mock("fs/promises", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("fs/promises");
  return {
    ...actual,
    access: vi.fn((path: PathLike, mode?: number) => {
      // const vfs = Naite.get("mock:fs/promises:virtualFileSystem").result();
      // if (vfs.some((v) => v === path)) {
      //   return Promise.resolve();
      // }

      return actual.access(path, mode);
    }),
    // mkdir: vi.fn(
    //   async (
    //     path: PathLike,
    //     options?: MakeDirectoryOptions | Mode | null,
    //   ): Promise<string | undefined> => {
    //     // Naite.t("fs:mkdir", { path, options });
    //     if (typeof options === "object" && options?.recursive) {
    //       return typeof path === "string" ? path : path.toString();
    //     }
    //     return undefined;
    //   },
    // ),
    // writeFile: vi.fn((path: PathLike | FileHandle, data: string | Buffer | Uint8Array) => {
    //   const filePath = typeof path === "string" ? path : path.toString();

    //   // Naite.t(`fs/promises:writeFile`, { path: filePath, data });
    // }),
    // rm: vi.fn(async (path: PathLike, options?: RmOptions) => {
    //   const filePath = typeof path === "string" ? path : path.toString();

    //   // Naite.t(`fs/promises:rm`, { path: filePath, options });
    //   // 실제 삭제하지 않고 기록만 함
    //   return Promise.resolve();
    // }),
  };
});
