import crypto from "crypto";
import { createReadStream, type PathLike } from "fs";
import path from "path";

import equal from "fast-deep-equal";
import { isEqual } from "radashi";

import { Sonamu } from "../api/sonamu";
import { globAsync } from "../utils/async-utils";
import { type AbsolutePath, type AppRelativePath } from "../utils/path-utils";
import { differenceWith } from "../utils/utils";
import { getChecksumPatternGroupInAbsolutePath, GLOB_EXCLUDE } from "./file-patterns";
import { syncerFileExists, syncerFilesystem } from "./filesystem-dependencies";

type PathAndChecksum = {
  path: AbsolutePath;
  checksum: string;
};

/**
 * 체크섬 파일에 저장된 내용과 현재 실제 파일의 체크섬을 비교하여 변경된 파일을 찾습니다.
 * @returns 변경된 파일 경로 배열. 프로젝트 루트부터 슬래시로 시작합니다. 예시: "/src/application/user/user.model.ts"
 */
export async function findChangedFilesUsingChecksums(): Promise<AbsolutePath[]> {
  const calculatedChecksums = await getCurrentChecksums();
  const savedChecksums = await getPreviousChecksums();

  const isSame = equal(calculatedChecksums, savedChecksums);
  if (isSame) {
    return [];
  }

  return differenceWith(calculatedChecksums, savedChecksums, isEqual).map((r) => r.path);
}

/**
 * 체크섬을 갱신합니다.
 * 현재 파일들의 체크섬을 계산해서 구한 다음, 체크섬 파일에 저장된 내용과 다르면 체크섬 파일을 갱신합니다.
 */
export async function renewChecksums(): Promise<void> {
  const calculatedChecksums = await getCurrentChecksums();
  const savedChecksums = await getPreviousChecksums();

  const isSame = equal(calculatedChecksums, savedChecksums);
  if (isSame) {
    return;
  }

  await saveChecksums(calculatedChecksums);
}

async function getCurrentChecksums(): Promise<PathAndChecksum[]> {
  const allPaths = (
    await Promise.all(
      Object.entries(getChecksumPatternGroupInAbsolutePath()).map(([_fileType, pattern]) => {
        return globAsync(pattern, { exclude: GLOB_EXCLUDE });
      }),
    )
  ).flat();

  // 동일 파일이 여러 패턴에 매치될 수 있으므로(예: sd.generated.ts는 generated와 sdGenerated에 모두 매치)
  // 중복 제거 후 안정 정렬.
  const filePaths =
    /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ Array.from(
      new Set(allPaths),
    ).toSorted() as AbsolutePath[];

  return await Promise.all(
    filePaths.map(async (filePath) => {
      return {
        path: filePath,
        checksum: await getChecksumOfFile(filePath),
      };
    }),
  );
}

async function getPreviousChecksums(): Promise<PathAndChecksum[]> {
  const checksumFilePath = getChecksumFilePath();
  if (!(await syncerFileExists(checksumFilePath))) {
    return [];
  }

  try {
    const previousChecksums =
      /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ JSON.parse(
        await syncerFilesystem.readFile(checksumFilePath, "utf-8"),
      ).map((r: { path: AppRelativePath; checksum: string }) => ({
        path: path.join(Sonamu.appRootPath, r.path), // 체크섬 파일에서 읽을 때: appRoot 상대 경로 → 절대 경로
        checksum: r.checksum,
      })) as PathAndChecksum[];
    return previousChecksums;
  } catch (e) {
    // 체크섬 파일이 손상된 경우 빈 배열 반환 (전체 재동기화 유도)
    console.warn(
      `체크섬 파일(${checksumFilePath})을 파싱하는 데 실패했습니다. 전체 재동기화를 진행합니다.`,
      e,
    );
    return [];
  }
}

function getChecksumFilePath(): AbsolutePath {
  return /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ path.join(
    Sonamu.apiRootPath,
    "sonamu.lock",
  ) as AbsolutePath;
}

async function saveChecksums(checksums: PathAndChecksum[]): Promise<void> {
  const checksumFilePath = getChecksumFilePath();
  // appRoot 상대 경로로 직렬화 + 알파벳 안정 정렬 (PR diff 깨끗하게 유지)
  const serialized = checksums
    .map((r) => ({
      path: path.relative(Sonamu.appRootPath, r.path), // 체크섬 파일에 저장할 때: 절대 경로 → appRoot 상대 경로
      checksum: r.checksum,
    }))
    .toSorted((a, b) => a.path.localeCompare(b.path));
  await syncerFilesystem.writeFile(checksumFilePath, JSON.stringify(serialized, null, 2), "utf-8");
}

async function getChecksumOfFile(filePath: PathLike): Promise<string> {
  const hash = crypto.createHash("sha1");
  const input = createReadStream(filePath);
  for await (const chunk of input) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}
