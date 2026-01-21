export type BuildArtifact<BuildCommandArgs = {}> = {
  name: string;
  description: string;
  projectPath: string;
  preBuildCommand?: () => string;
  buildCommand: (args: BuildCommandArgs) => string;
  postBuildCommand?: () => string;
};

/**
 * API 프로젝트 빌드 산출물에 대한 규칙들.
 * cli.ts의 build 함수가 이것을 보고 그대로 실행합니다.
 */
export const API_ARTIFACTS: BuildArtifact<{ configFilePath: string }>[] = [
  {
    name: "API",
    description: "API 프로젝트 빌드 산출물",
    projectPath: "api",
    preBuildCommand: () => "rm -rf dist",
    buildCommand: ({ configFilePath }) =>
      `tsc --noEmit && swc src -d dist --config-file ${configFilePath} --strip-leading-paths`,
  },
];

/**
 * 웹 프로젝트 빌드 산출물에 대한 규칙들.
 * cli.ts의 build 함수가 이것을 보고 그대로 실행합니다.
 */
export const WEB_ARTIFACTS: BuildArtifact[] = [
  {
    name: "Web Client",
    description: "Web 프로젝트 클라이언트 빌드 산출물",
    projectPath: "web",
    preBuildCommand: () => "rm -rf dist/client && rm -rf ../api/public/web",
    buildCommand: () => "tsc --noEmit && vite build --outDir dist/client",
    postBuildCommand: () => "mkdir -p ../api/public/web && cp -r dist/client/* ../api/public/web",
  },
  {
    name: "Web Server",
    description: "Web 프로젝트 서버 빌드 산출물",
    projectPath: "web",
    preBuildCommand: () => "rm -rf dist/server", // api/dist/ssr은 안 지웁니다! 거기는 api의 빌드 결과물이 들어있음!
    buildCommand: () =>
      "tsc --noEmit && vite build --ssr src/entry-server.generated.tsx --outDir dist/server",
    postBuildCommand: () => "mkdir -p ../api/dist/ssr && cp -r dist/server/* ../api/dist/ssr",
  },
];
