import path from "path";
import { Sonamu } from "sonamu";
import { startServers } from "./index";

/**
 * Sonamu UI 서버를 실행합니다.
 *
 * 이 스크립트는 --import @sonamu-kit/hmr-hook과 함께 실행되어야 합니다.
 *
 * 환경변수:
 * - API_ROOT_PATH: API 루트 경로
 */

// UI가 시작되려면 얘만 있으면 됩니다.
// 나머지 프로젝트 이름이나 포트 등은 알아서 저 경로에 가서 설정 파일을 읽어와서 처리할 겁니다.
const apiRootPath = process.env.API_ROOT_PATH;
if (!apiRootPath) {
  console.error("❌ API_ROOT_PATH environment variables are required");
  process.exit(1);
}

// Sonamu 초기화 (sync 비활성화, silent 모드)
await Sonamu.init(true, false, apiRootPath as `/${string}`);

const projectName = Sonamu.config.projectName ?? path.basename(Sonamu.apiRootPath);
const port = Sonamu.config.ui?.port ?? 57000;

await startServers({
  projectName,
  apiRootPath,
  port,
});
