import path from "path";
import { globAsync } from "../utils/async-utils";
import { createReadStream, PathLike } from "fs";
import { readFile, writeFile } from "fs/promises";
import { exists } from "../utils/fs-utils";

import crypto from "crypto";
import equal from "fast-deep-equal";
import * as _ from "lodash-es";
import { Sonamu } from "../api/sonamu";
import {
  AbsolutePath,
  ProjectRelativePath,
  toProjectRelativePath,
} from "../utils/path-utils";
import { getChecksumPatternGroupInAbsolutePath } from "./config";

type PathAndChecksum = {
  path: AbsolutePath;
  checksum: string;
};

/**
 * 체크섬 관련된 일을 맡아서 Syncer의 부담을 덜어주는 친구입니다.
 * "체크섬"이 들어가는 일은 얘가 다 한다고 보면 됩니다.
 */
export class ChecksumHelper {
  get checksumFilePath(): AbsolutePath {
    return path.join(Sonamu.apiRootPath, "sonamu.lock") as AbsolutePath;
  }

  /**
   * 체크섬 파일에 저장된 내용과 현재 실제 파일의 체크섬을 비교하여 변경된 파일을 찾습니다.
   * @returns 변경된 파일 경로 배열. 프로젝트 루트부터 슬래시로 시작합니다. 예시: "/src/application/user/user.model.ts"
   */
  async findChangedFilesUsingChecksums(): Promise<AbsolutePath[]> {
    let calculatedChecksums = await this.getCurrentChecksums();
    const savedChecksums = await this.getPreviousChecksums();

    const isSame = equal(calculatedChecksums, savedChecksums);
    if (isSame) {
      return [];
    }

    const diff = _.differenceWith(
      calculatedChecksums,
      savedChecksums,
      _.isEqual
    );

    return diff.map((r) => r.path);
  }

  /**
   * 체크섬을 갱신합니다.
   * 현재 파일들의 체크섬을 계산해서 구한 다음, 체크섬 파일에 저장된 내용과 다르면 체크섬 파일을 갱신합니다.
   * @returns
   */
  async renewChecksums(): Promise<void> {
    let calculatedChecksums = await this.getCurrentChecksums();
    const savedChecksums = await this.getPreviousChecksums();

    const isSame = equal(calculatedChecksums, savedChecksums);
    if (isSame) {
      return;
    }

    await this.saveChecksums(calculatedChecksums);
  }

  private async getCurrentChecksums(): Promise<PathAndChecksum[]> {
    const filePaths = (
      await Promise.all(
        Object.entries(getChecksumPatternGroupInAbsolutePath()).map(
          async ([_fileType, pattern]) => {
            return globAsync(pattern) as Promise<AbsolutePath[]>;
          }
        )
      )
    )
      .flat()
      .sort();

    const fileChecksums = await Promise.all(
      filePaths.map(async (filePath) => {
        return {
          path: filePath,
          checksum: await this.getChecksumOfFile(filePath),
        };
      })
    );

    return fileChecksums;
  }

  private async getPreviousChecksums(): Promise<PathAndChecksum[]> {
    if (!(await exists(this.checksumFilePath))) {
      return [];
    }

    const previousChecksums = JSON.parse(
      await readFile(this.checksumFilePath, "utf-8")
    ).map((r: { path: ProjectRelativePath; checksum: string }) => ({
      path: path.join(Sonamu.apiRootPath, r.path), // 체크섬 파일에 저장할 때에는 상대 경로로 저장해요.
      checksum: r.checksum,
    })) as PathAndChecksum[];
    return previousChecksums;
  }

  private async saveChecksums(checksums: PathAndChecksum[]): Promise<void> {
    await writeFile(
      this.checksumFilePath,
      JSON.stringify(
        checksums.map((r) => ({
          path: toProjectRelativePath(r.path), // 체크섬 파일에서 꺼내올 때에는 절대 경로로 꺼내와요.
          checksum: r.checksum,
        })),
        null,
        2
      ),
      "utf-8"
    );
    console.log("checksum saved", this.checksumFilePath);
  }

  /**
   * 두 파일의 내용이 같은지 체크섬으로 비교합니다.
   * 만약 파일이 둘 중 하나라도 없다면 비교 불가로 false 반환합니다.
   * @param one 파일 경로
   * @param two 파일 경로
   * @returns boolean
   */
  async areFilesSame(one: PathLike, two: PathLike): Promise<boolean> {
    if (!(await exists(one)) || !(await exists(two))) {
      return false;
    }

    const oneChecksum = await this.getChecksumOfFile(one);
    const twoChecksum = await this.getChecksumOfFile(two);

    return oneChecksum === twoChecksum;
  }

  private async getChecksumOfFile(filePath: PathLike): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const hash = crypto.createHash("sha1");
      const input = createReadStream(filePath);
      input.on("error", reject);
      input.on("data", function (chunk: any) {
        hash.update(chunk);
      });
      input.on("close", function () {
        resolve(hash.digest("hex"));
      });
    });
  }
}
