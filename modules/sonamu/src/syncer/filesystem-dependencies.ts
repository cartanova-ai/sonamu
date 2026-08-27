import {
  constants,
  type MakeDirectoryOptions,
  type PathLike,
  type RmOptions,
  type Stats,
} from "node:fs";
import { access, mkdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";

export type SyncerFilesystemDependencies = {
  access(path: PathLike, mode?: number): Promise<void>;
  mkdir(path: PathLike, options?: MakeDirectoryOptions): Promise<string | undefined>;
  readFile(path: PathLike, encoding: BufferEncoding): Promise<string>;
  rm(path: PathLike, options?: RmOptions): Promise<void>;
  stat(path: PathLike): Promise<Stats>;
  unlink(path: PathLike): Promise<void>;
  writeFile(
    path: PathLike,
    data: string | NodeJS.ArrayBufferView,
    encoding?: BufferEncoding,
  ): Promise<void>;
};

const defaults: SyncerFilesystemDependencies = {
  access: (path, mode) => access(path, mode),
  mkdir: (path, options) => mkdir(path, options),
  readFile: (path, encoding) => readFile(path, encoding),
  rm: (path, options) => rm(path, options),
  stat: (path) => stat(path),
  unlink: (path) => unlink(path),
  writeFile: (path, data, encoding) => writeFile(path, data, encoding),
};

export const syncerFilesystem: SyncerFilesystemDependencies = { ...defaults };

export async function syncerFileExists(path: PathLike): Promise<boolean> {
  try {
    await syncerFilesystem.access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** 테스트와 임베딩 환경에서 Syncer의 파일시스템 경계를 교체합니다. */
export function configureSyncerFilesystem(
  dependencies: Partial<SyncerFilesystemDependencies>,
): () => void {
  const restorers: Array<() => void> = [];
  const override = <Key extends keyof SyncerFilesystemDependencies>(key: Key): void => {
    if (!(key in dependencies)) return;

    const previousDependency = syncerFilesystem[key];
    Object.assign(syncerFilesystem, { [key]: dependencies[key] });
    restorers.push(() => Object.assign(syncerFilesystem, { [key]: previousDependency }));
  };

  override("access");
  override("mkdir");
  override("readFile");
  override("rm");
  override("stat");
  override("unlink");
  override("writeFile");

  let configured = true;
  return () => {
    if (!configured) return;
    configured = false;

    for (const restore of restorers) restore();
  };
}
