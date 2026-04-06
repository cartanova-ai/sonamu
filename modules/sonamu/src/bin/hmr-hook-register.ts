/**
 * hmr-hook 초기화하는 모듈입니다.
 *
 * 이 파일은 --import 플래그로 프로세스 시작 시 로드되어야 합니다.
 *
 * 환경변수:
 * - API_ROOT_PATH: 사용자 프로젝트의 API 루트 경로
 * - HOT: 'yes'일 때만 hmr-hook 활성화
 */

if (process.env.HOT === "yes" && process.env.API_ROOT_PATH) {
  const { hot } = await import("@sonamu-kit/hmr-hook");

  await hot.init({
    rootDirectory: process.env.API_ROOT_PATH, // 이 친구가 프로젝트 API 경로로 잘 설정되어야 아래 바운더리가 작동합니다.
    boundaries: [`./src/**/*.ts`], // 프로젝트의 이 친구들이 바운더리가 됩니다.
  });

  console.log("🔥 HMR-hook initialized");
}

// oxlint-disable-next-line
export {};
