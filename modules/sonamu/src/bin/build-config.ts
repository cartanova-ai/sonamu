/**
 * 소스 코드가 담길 디렉토리 경로
 */
export const SRC_DIR = "src";

/**
 * 빌드 결과물이 담길 디렉토리 경로
 */
export const BUILD_DIR = "dist";

/**
 * SWC 빌드 명령어
 * .swcrc 설정 사용
 */
export const SWC_BUILD_COMMAND = (configFilePath: string) =>
    `swc ${SRC_DIR} -d ${BUILD_DIR} --config-file ${configFilePath}  --strip-leading-paths`;
  
/**
 * TSC 타입 체크 명령어
 */
export const TSC_TYPE_CHECK_COMMAND = `tsc --noEmit`;
