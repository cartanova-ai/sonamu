import { type CompressConfig, type CompressOptions } from "./types";

/**
 * 압축 프리셋입니다.
 * 일반적인 사용 사례에 맞는 미리 정의된 설정을 제공합니다.
 */
export const CompressPresets = {
  /** 압축 비활성화 */
  disabled: false as const,
  /** 기본 설정 (threshold: 1024, br > gzip > deflate) */
  default: {
    threshold: 1024,
    encodings: /* SAFETY: 호출 경계의 선행 검증과 소유 타입 계약이 이 값의 타입을 보장한다. */ [
      "br",
      "gzip",
      "deflate",
    ] as ("br" | "gzip" | "deflate")[],
  },
  /** 적극적 압축 (threshold: 256) */
  aggressive: {
    threshold: 256,
    encodings: /* SAFETY: 호출 경계의 선행 검증과 소유 타입 계약이 이 값의 타입을 보장한다. */ [
      "br",
      "gzip",
      "deflate",
    ] as ("br" | "gzip" | "deflate")[],
  },
  /** 보수적 압축 (threshold: 4096, gzip만) */
  conservative: {
    threshold: 4096,
    encodings: /* SAFETY: 호출 경계의 선행 검증과 소유 타입 계약이 이 값의 타입을 보장한다. */ [
      "gzip",
      "deflate",
    ] as ("gzip" | "deflate")[],
  },
  /** gzip만 사용 */
  gzipOnly: {
    threshold: 1024,
    encodings: /* SAFETY: 호출 경계의 선행 검증과 소유 타입 계약이 이 값의 타입을 보장한다. */ [
      "gzip",
    ] as ["gzip"],
  },
} as const;

/**
 * CompressConfig가 비활성화 상태인지 확인합니다.
 */
export function isCompressDisabled(config: CompressConfig | undefined): config is false {
  return config === false;
}

/**
 * CompressConfig를 Fastify route compress 옵션으로 변환합니다.
 * - undefined: 전역 설정 따름
 * - true: 압축 활성화 (global: false일 때 해당 라우트만 압축) → 전역 설정 사용
 * - false: 비활성화
 * - CompressOptions: 세부 옵션
 *
 * @param config 라우트별 compress 설정
 * @param defaultOptions 전역 compress 설정 (true일 때 사용)
 */
export function toFastifyCompressOption(
  config: CompressConfig | undefined,
  defaultOptions?: CompressOptions,
): false | CompressOptions | undefined {
  if (config === undefined) {
    return undefined;
  }
  if (config === true) {
    // true는 전역 설정으로 압축 활성화 (global: false일 때 해당 라우트만 압축)
    return defaultOptions ?? {};
  }
  return config;
}
