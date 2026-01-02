import type { CompressConfig, CompressOptions } from "./types";

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
    encodings: ["br", "gzip", "deflate"] as ("br" | "gzip" | "deflate")[],
  },
  /** 적극적 압축 (threshold: 256) */
  aggressive: {
    threshold: 256,
    encodings: ["br", "gzip", "deflate"] as ("br" | "gzip" | "deflate")[],
  },
  /** 보수적 압축 (threshold: 4096, gzip만) */
  conservative: {
    threshold: 4096,
    encodings: ["gzip", "deflate"] as ("gzip" | "deflate")[],
  },
  /** gzip만 사용 */
  gzipOnly: {
    threshold: 1024,
    encodings: ["gzip"] as ["gzip"],
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
 * - false: 비활성화
 * - CompressOptions: 세부 옵션
 */
export function toFastifyCompressOption(
  config: CompressConfig | undefined,
): false | CompressOptions | undefined {
  if (config === undefined) {
    return undefined;
  }
  if (config === false) {
    return false;
  }
  return config;
}
