import crypto, { type BinaryLike } from "crypto";
import equal from "fast-deep-equal";
import { createReadStream, type PathLike } from "fs";
import { readFile, writeFile } from "fs/promises";
import differenceWith from "lodash-es/differenceWith.js";
import isEqual from "lodash-es/isEqual.js";
import path from "path";
import { Sonamu } from "../api/sonamu";
import { globAsync } from "../utils/async-utils";
import { exists } from "../utils/fs-utils";
import type { AbsolutePath, ApiRelativePath } from "../utils/path-utils";
import { getChecksumPatternGroupInAbsolutePath } from "./file-patterns";

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

  const diff = differenceWith(calculatedChecksums, savedChecksums, isEqual);

  return diff.map((r) => r.path);
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

/**
 * 두 파일의 내용이 같은지 체크섬으로 비교합니다.
 * 만약 파일이 둘 중 하나라도 없다면 비교 불가로 false 반환합니다.
 * @param one 파일 경로
 * @param two 파일 경로
 * @returns boolean
 */
export async function areFilesSame(one: PathLike, two: PathLike): Promise<boolean> {
  if (!(await exists(one)) || !(await exists(two))) {
    return false;
  }

  const oneChecksum = await getChecksumOfFile(one);
  const twoChecksum = await getChecksumOfFile(two);

  return oneChecksum === twoChecksum;
}

async function getCurrentChecksums(): Promise<PathAndChecksum[]> {
  const filePaths = (
    await Promise.all(
      Object.entries(getChecksumPatternGroupInAbsolutePath()).map(async ([_fileType, pattern]) => {
        return globAsync(pattern) as Promise<AbsolutePath[]>;
      }),
    )
  )
    .flat()
    .sort();

  const fileChecksums = await Promise.all(
    filePaths.map(async (filePath) => {
      return {
        path: filePath,
        checksum: await getChecksumOfFile(filePath),
      };
    }),
  );

  return fileChecksums;
}

async function getPreviousChecksums(): Promise<PathAndChecksum[]> {
  const checksumFilePath = getChecksumFilePath();
  if (!(await exists(checksumFilePath))) {
    return [];
  }

  const previousChecksums = JSON.parse(await readFile(checksumFilePath, "utf-8")).map(
    (r: { path: ApiRelativePath; checksum: string }) => ({
      path: path.join(Sonamu.apiRootPath, r.path), // 체크섬 파일에서 읽을 때: API 상대 경로 → 절대 경로
      checksum: r.checksum,
    }),
  ) as PathAndChecksum[];
  return previousChecksums;
}

function getChecksumFilePath(): AbsolutePath {
  return path.join(Sonamu.apiRootPath, "sonamu.lock") as AbsolutePath;
}

async function saveChecksums(checksums: PathAndChecksum[]): Promise<void> {
  const checksumFilePath = getChecksumFilePath();
  await writeFile(
    checksumFilePath,
    JSON.stringify(
      checksums.map((r) => ({
        path: path.relative(Sonamu.apiRootPath, r.path), // 체크섬 파일에 저장할 때: 절대 경로 → API 상대 경로
        checksum: r.checksum,
      })),
      null,
      2,
    ),
    "utf-8",
  );
  console.log("checksum saved", checksumFilePath);
}

async function getChecksumOfFile(filePath: PathLike): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash("sha1");
    const input = createReadStream(filePath);
    input.on("error", reject);
    input.on("data", (chunk: BinaryLike) => {
      hash.update(chunk);
    });
    input.on("close", () => {
      resolve(hash.digest("hex"));
    });
  });
}
