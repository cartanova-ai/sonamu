import { type MakeDirectoryOptions, type PathLike, type RmOptions } from "node:fs";
import { access, stat } from "node:fs/promises";

import { Naite } from "sonamu";
import { configureSyncerFilesystem, type SyncerFilesystemDependencies } from "sonamu/test";
import { vi } from "vitest";

// Syncer가 파일 수정 시각을 다시 읽으므로 기록된 경로의 mtime을 함께 재현합니다.
const mockMtimes = new Map<string, number>();

const mockAccess = vi.fn<SyncerFilesystemDependencies["access"]>(
  async (path: PathLike, mode?: number) => {
    const virtualFiles = Naite.get("mock:fs/promises:virtualFileSystem").result();
    if (virtualFiles.some((virtualFile) => virtualFile === path)) {
      return;
    }
    await access(path, mode);
  },
);

const mockMkdir = vi.fn<SyncerFilesystemDependencies["mkdir"]>(
  async (path: PathLike, options?: MakeDirectoryOptions) => {
    Naite.t("fs:mkdir", { path, options });
    return options?.recursive ? path.toString() : undefined;
  },
);

const mockWriteFile = vi.fn<SyncerFilesystemDependencies["writeFile"]>(async (path, data) => {
  const filePath = path.toString();
  Naite.t("fs/promises:writeFile", { path: filePath, data });
  mockMtimes.set(filePath, Date.now());
});

const mockStat = vi.fn<SyncerFilesystemDependencies["stat"]>(async (path) => {
  const mtimeMs = mockMtimes.get(path.toString());
  if (mtimeMs !== undefined) {
    const stats = await stat(import.meta.filename);
    stats.mtimeMs = mtimeMs;
    stats.mtime = new Date(mtimeMs);
    return stats;
  }
  return stat(path);
});

const mockRm = vi.fn<SyncerFilesystemDependencies["rm"]>(
  async (path: PathLike, options?: RmOptions) => {
    Naite.t("fs/promises:rm", { path: path.toString(), options });
  },
);

configureSyncerFilesystem({
  access: mockAccess,
  mkdir: mockMkdir,
  rm: mockRm,
  stat: mockStat,
  writeFile: mockWriteFile,
});
