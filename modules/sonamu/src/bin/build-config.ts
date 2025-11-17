/**
 * 빌드 결과물이 담길 디렉토리 경로
 */
export const BUILD_DIR = "dist";

/**
 * SWC 빌드 명령어
 * .swcrc 설정 사용
 */
export const SWC_BUILD_COMMAND = `swc src -d ${BUILD_DIR} --strip-leading-paths`;

/**
 * TSC 타입 체크 명령어
 */
export const TSC_TYPE_CHECK_COMMAND = `tsc --noEmit`;
