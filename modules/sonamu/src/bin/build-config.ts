/**
 * API 프로젝트 빌드 산출물에 대한 규칙들.
 * cli.ts의 build 함수가 이것을 보고 그대로 실행합니다.
 *
 * 경로(projectPath, outputDir, destDir)는 app root에서 시작하는 상대경로로 작성되어 있습니다.
 * 다만 buildCommand는 projectPath를 기준으로 실행됩니다.
 */
export const API_ARTIFACTS = [
  {
    name: "API",
    description: "API 프로젝트 빌드 산출물",
    projectPath: "api",
    buildCommand: (configFilePath: string) =>
      `tsc --noEmit && swc src -d dist --config-file ${configFilePath} --strip-leading-paths`,
    outputDir: "api/dist",
  },
];

/**
 * 웹 프로젝트 빌드 산출물에 대한 규칙들.
 * cli.ts의 build 함수가 이것을 보고 그대로 실행합니다.
 *
 * 경로(projectPath, outputDir, destDir)는 app root에서 시작하는 상대경로로 작성되어 있습니다.
 * 다만 buildCommand는 projectPath를 기준(cwd)으로 실행됩니다.
 */
export const WEB_ARTIFACTS = [
  {
    name: "Web Client",
    description: "Web 프로젝트 클라이언트 빌드 산출물",
    projectPath: "web",
    buildCommand: () => "tsc && vite build --outDir dist/client",
    outputDir: "web/dist/client",
    destDir: "api/public/web",
  },
  {
    name: "Web Server",
    description: "Web 프로젝트 서버 빌드 산출물",
    projectPath: "web",
    buildCommand: () => "vite build --ssr src/entry-server.generated.tsx --outDir dist/server",
    outputDir: "web/dist/server",
    destDir: "api/dist/ssr",
  },
];
