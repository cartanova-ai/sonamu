import { register } from "node:module";
import * as path from "node:path";
import { exists } from "../utils/fs-utils.js";
import { findApiRootPath } from "../utils/utils.js";

/**
 * @sonamu-kit/loader/loader를 등록하는 스크립트입니다.
 * 이 스크립트는 sonamu cli로 dev 실행할 때 --import로 실행됩니다.
 */
async function setupSwcConfig() {
  try {
    const apiRoot = findApiRootPath();

    // 프로젝트 루트에서 .swcrc 찾기
    const projectSwcrcPath = path.join(apiRoot, ".swcrc");
    if (await exists(projectSwcrcPath)) {
      // 사용자 프로젝트에 .swcrc가 있으면 우선으로 사용합니다.
      process.env.SWCRC_PATH = projectSwcrcPath;
      return;
    }

    // 아니라면 sonamu가 관리하는 .swcrc.project-default를 가져다 씁니다.
    const sonamuSwcrcPath = path.join(import.meta.dirname, "..", "..", ".swcrc.project-default");
    if (await exists(sonamuSwcrcPath)) {
      process.env.SWCRC_PATH = sonamuSwcrcPath;
      return;
    }
  } catch {
    // 환경 변수 설정 실패는 무시 (loader가 기본 설정 사용)
  }
}

// swc 설정 파일 경로를 환경 변수로 설정
await setupSwcConfig();

register("@sonamu-kit/loader/loader", {
  parentURL: import.meta.url,
});
