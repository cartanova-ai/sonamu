import { Sonamu } from "sonamu";
import { startServers } from "./index";

/**
 * Sonamu UI 서버를 실행합니다.
 *
 * 이 스크립트는 --import @sonamu-kit/hot-hook과 함께 실행되어야 합니다.
 *
 * 환경변수:
 * - PROJECT_NAME: 프로젝트 이름
 * - API_ROOT_PATH: API 루트 경로
 * - UI_PORT: UI 서버 포트
 */

const projectName = process.env.PROJECT_NAME!;
const apiRootPath = process.env.API_ROOT_PATH!;
const port = parseInt(process.env.UI_PORT || "57000");

if (!projectName || !apiRootPath) {
  console.error(
    "❌ PROJECT_NAME and API_ROOT_PATH environment variables are required"
  );
  process.exit(1);
}

// Sonamu 초기화 (sync 비활성화, silent 모드)
await Sonamu.init(true, false, apiRootPath as `/${string}`);

await startServers({
  projectName,
  apiRootPath,
  port,
});
