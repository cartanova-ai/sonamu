import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Sonamu, type SonamuTestingSnapshot } from "../../../api/sonamu";
import { type AbsolutePath } from "../../../utils/path-utils";

const createdWorkspaces: string[] = [];
let capturedSnapshot: SonamuTestingSnapshot | null = null;
let capturedInitialized = false;

/**
 * 임시 api root를 만들어 Sonamu singleton의 공개 setter로 주입합니다.
 *
 * tooling 연산은 `Sonamu.isInitialized`가 참이면 초기화를 건너뛰므로,
 * 실제 DB/설정 없이 파일 경로 기반 동작만 검증할 수 있습니다.
 */
export async function attachSonamuTestRoot(): Promise<string> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "sonamu-tooling-"));
  createdWorkspaces.push(workspace);
  const apiRootPath = path.join(workspace, "api");
  await mkdir(path.join(apiRootPath, "src", "application"), { recursive: true });

  capturedSnapshot ??= Sonamu.captureTestingSnapshot();
  capturedInitialized = Sonamu.isInitialized;
  // SAFETY: mkdtemp가 반환한 절대 경로만 주입합니다.
  Sonamu.apiRootPath = apiRootPath as AbsolutePath;
  Sonamu.isInitialized = true;
  return apiRootPath;
}

/** 주입한 Sonamu 상태를 되돌리고 임시 디렉터리를 정리합니다. */
export async function detachSonamuTestRoot(): Promise<void> {
  if (capturedSnapshot !== null) {
    Sonamu.restoreTestingSnapshot(capturedSnapshot);
    capturedSnapshot = null;
  }
  Sonamu.isInitialized = capturedInitialized;
  await Promise.all(
    createdWorkspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })),
  );
}
