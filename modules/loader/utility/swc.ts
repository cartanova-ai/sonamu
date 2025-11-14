import { transform } from "@swc/core";

/** @internal */
export async function transpileSource(
  sourceText: string,
  sourceLocation: URL,
  packageDirectory?: URL
): Promise<string> {
  // export declare function transform(src: string | Program, options?: Options): Promise<Output>;

  const filename = sourceLocation.pathname;
  const baseUrl = packageDirectory?.pathname ?? process.cwd();

  const result = await transform(sourceText, {
    // 이하 .swcrc 내용과 동일합니다.
    filename, // resolveFully가 제대로 작동하도록 파일 경로 전달
    module: {
      type: "es6", // import/export 쓰는 esm으로 가겠습니다.
      resolveFully: true, // esm이 요구하는 대로, 임포트 경로를 실제 파일 경로(확장자 포함)로 풀어줍니다.
    },
    jsc: {
      parser: {
        syntax: "typescript",
        decorators: true,
      },
      baseUrl,
      target: "esnext", // 타겟은 그냥 최신 문법으로.
    },
    minify: false, // 어차피 용량 10%정도 차이밖에 안 남. minify를 끄면 혹시 혹시 정말 혹시나 나중에 소스맵 없이 코드를 봐야 하는 끔찍한 상황에 조금이나마 도움이 될 수 있지 않을까 해서 끔.
    sourceMaps: true, // 소스맵 생성. 선언맵은 밖에서 tsc로 따로 만들거예요.
  });

  if (!result.code || !result.map) {
    throw new Error("Failed to transpile source");
  }

  return `${result.code}\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(result.map).toString("base64")}`;
}
