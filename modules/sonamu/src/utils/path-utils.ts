import { isHotReloadServer } from "./esm-utils.js";

/**
 * API 패키지 내부 상대 경로 (src/ 또는 dist/로 시작)
 *
 * **사용 위치**: API 패키지 내부 파일 참조
 * **예시**:
 * - `"src/application/user/user.model.ts"`
 * - `"dist/application/user/user.model.js"`
 *
 * **기준점**: `Sonamu.apiRootPath` (일반적으로 프로젝트의 `/api` 디렉토리)
 */
export type ApiRelativePath = `${"src" | "dist"}/${string}`;

/**
 * 앱 루트 기준 상대 경로 (api/, web/ 등 타겟 디렉토리로 시작)
 *
 * **사용 위치**: 다른 타겟(api, web 등)의 파일 참조
 * **예시**:
 * - `"api/src/application/user/user.model.ts"`
 * - `"web/src/pages/admin/users/index.tsx"`
 * - `"app/dist/index.js"`
 *
 * **기준점**: `Sonamu.appRootPath` (일반적으로 모노레포 루트)
 */
export type AppRelativePath = `${string}/${"src" | "dist"}/${string}`;

/**
 * 시스템 절대 경로 (루트 / 부터 시작)
 *
 * **사용 위치**: 파일시스템 직접 접근, glob 패턴
 * **예시**: `"/Users/potados/Projects/sonamu/api/src/application/user/user.model.ts"`
 *
 * **중요**:
 * - import 시에는 로더가 알아서 src/dist 변환해주므로 어느 경로든 가능
 * - fs 직접 접근 시에는 실제 존재하는 경로를 사용해야 함
 *   - Dev: src/*.ts 경로 사용
 *   - Prod: dist/*.js 경로 사용
 */
export type AbsolutePath = `/${string}`;

/**
 * 어떤 경로가 들어오든, 현재 실행 환경에 맞는 경로로 바꿔줍니다.
 *
 * "src/application/user/user.model.ts"가 들어왔을 때 개발 모드라면?
 * -> "src/application/user/user.model.ts"
 * "src/application/user/user.model.ts"가 들어왔을 때 배포 모드라면?
 * -> "dist/application/user/user.model.js"
 * "dist/application/user/user.model.js"가 들어왔을 때 개발 모드라면?
 * -> "src/application/user/user.model.ts"
 * "dist/application/user/user.model.js"가 들어왔을 때 배포 모드라면?
 * -> "dist/application/user/user.model.js"
 *
 * "/src/application/user/user.model.ts"가 들어왔을 때 개발 모드라면?
 * -> "/src/application/user/user.model.ts"
 * "/src/application/user/user.model.ts"가 들어왔을 때 배포 모드라면?
 * -> "/dist/application/user/user.model.js"
 * "/dist/application/user/user.model.js"가 들어왔을 때 개발 모드라면?
 * -> "/dist/application/user/user.model.js"
 * "/dist/application/user/user.model.js"가 들어왔을 때 배포 모드라면?
 * -> "/dist/application/user/user.model.js"
 *
 * "/Users/potados/Projects/sonamu/api/src/application/user/user.model.ts"가 들어왔을 때 개발 모드라면?
 * -> "/Users/potados/Projects/sonamu/api/src/application/user/user.model.ts"
 * "/Users/potados/Projects/sonamu/api/src/application/user/user.model.ts"가 들어왔을 때 배포 모드라면?
 * -> "/Users/potados/Projects/sonamu/api/dist/application/user/user.model.js"
 * "/Users/potados/Projects/sonamu/api/dist/application/user/user.model.js"가 들어왔을 때 개발 모드라면?
 * -> "/Users/potados/Projects/sonamu/api/src/application/user/user.model.ts"
 * "/Users/potados/Projects/sonamu/api/dist/application/user/user.model.js"가 들어왔을 때 배포 모드라면?
 * -> "/Users/potados/Projects/sonamu/api/dist/application/user/user.model.js"
 *
 * "src/application/user/user.model.ts?hot=1234567890"가 들어왔을 때 개발 모드라면?
 * -> "src/application/user/user.model.ts?hot=1234567890"
 * "src/application/user/user.model.ts?hot=1234567890"가 들어왔을 때 배포 모드라면?
 * -> "dist/application/user/user.model.js?hot=1234567890"
 * "dist/application/user/user.model.js?hot=1234567890"가 들어왔을 때 개발 모드라면?
 * -> "src/application/user/user.model.ts?hot=1234567890"
 * "dist/application/user/user.model.js?hot=1234567890"가 들어왔을 때 배포 모드라면?
 * -> "dist/application/user/user.model.js?hot=1234567890"
 *
 * "/Users/potados/Projects/sonamu/api/src/application/user/user.model.ts?hot=1234567890"가 들어왔을 때 개발 모드라면?
 * -> "/Users/potados/Projects/sonamu/api/src/application/user/user.model.ts?hot=1234567890"
 * "/Users/potados/Projects/sonamu/api/src/application/user/user.model.ts?hot=1234567890"가 들어왔을 때 배포 모드라면?
 * -> "/Users/potados/Projects/sonamu/api/dist/application/user/user.model.js?hot=1234567890"
 * "/Users/potados/Projects/sonamu/api/dist/application/user/user.model.js?hot=1234567890"가 들어왔을 때 개발 모드라면?
 * -> "/Users/potados/Projects/sonamu/api/src/application/user/user.model.ts?hot=1234567890"
 * "/Users/potados/Projects/sonamu/api/dist/application/user/user.model.js?hot=1234567890"가 들어왔을 때 배포 모드라면?
 * -> "/Users/potados/Projects/sonamu/api/dist/application/user/user.model.js?hot=1234567890"
 *
 * @param anyPath
 * @returns
 */
export function runtimePath(
  anyPath: string,
  isDev: boolean = isHotReloadServer()
): string {
  if (isDev) {
    return anyPath.replace(/dist\//, "src/").replace(/\.js/, ".ts");
  } else {
    return anyPath.replace(/src\//, "dist/").replace(/\.ts/, ".js");
  }
}
