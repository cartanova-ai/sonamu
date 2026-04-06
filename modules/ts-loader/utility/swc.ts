import * as fs from "node:fs/promises";

import { transform } from "@swc/core";
import type { Options } from "@swc/core";
import JSON5 from "json5";

// .swcrc 파일을 로드하는 캐시
let swcConfigCache: { path: string; config: Options } | null = null;

/**
 * 환경 변수에서 설정된 swcrc 파일 경로를 읽어서 로드합니다
 * 환경 변수가 필수입니다.
 */
async function loadSwcConfig(): Promise<Options> {
  // 환경 변수에서 설정된 경로 확인
  const swcrcPath = process.env.SWCRC_PATH;
  if (!swcrcPath) {
    throw new Error("SWCRC_PATH environment variable is required");
  }

  // 캐시 확인
  if (swcConfigCache?.path === swcrcPath) {
    return swcConfigCache.config;
  }

  // 파일 읽기
  const content = await fs.readFile(swcrcPath, "utf8");
  const config = JSON5.parse(content);
  swcConfigCache = { path: swcrcPath, config };
  return config;
}

/** @internal */
export async function transpileSource(
  sourceText: string,
  sourceLocation: URL,
  packageDirectory?: URL,
): Promise<string> {
  const filename = sourceLocation.pathname;
  const baseUrl = packageDirectory?.pathname ?? process.cwd();

  // .swcrc 설정 로드 (환경 변수에서 경로를 읽어서 사용)
  const swcConfig = await loadSwcConfig();

  // .swcrc 설정을 그대로 사용 (baseUrl만 동적으로 설정)
  const transformOptions = {
    ...swcConfig,
    filename, // filename은 항상 동적으로 결정된 값 사용
    jsc: {
      ...swcConfig.jsc,
      baseUrl, // baseUrl은 항상 동적으로 결정된 값 사용
    },
  };

  const result = await transform(sourceText, transformOptions);
  if (!result.code) {
    console.log(JSON.stringify(transformOptions, null, 2));

    throw new Error(
      `Failed to transpile source. Options: ${JSON.stringify(transformOptions, null, 2)}`,
    );
  }

  if (transformOptions.sourceMaps === "inline") {
    return result.code;
  } else {
    // inline 아니어도 여기서는 어차피 inline 해야 해요. ㅎㅎ
    if (!result.map) {
      throw new Error(
        "Source map is required when sourceMaps is not inline, but it is not provided in the result.",
      );
    }
    return `${result.code}\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(result.map).toString("base64")}`;
  }
}
