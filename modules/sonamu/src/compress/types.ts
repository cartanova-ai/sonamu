/**
 * API 응답의 압축 설정입니다.
 * - `true`: 압축 활성화 (global: false일 때 해당 API만 압축)
 * - `false`: 압축 비활성화
 * - `CompressOptions`: 세부 옵션 설정
 */
export type CompressConfig = boolean | CompressOptions;

/**
 * 압축 세부 옵션입니다.
 * @fastify/compress의 route-level 옵션을 지원합니다.
 */
export type CompressOptions = {
  /** 압축을 적용할 최소 바이트 크기 (기본값: 1024) */
  threshold?: number;
  /** 사용할 인코딩 우선순위 (기본값: ["br", "gzip", "deflate"]) */
  encodings?: ("br" | "gzip" | "deflate" | "identity")[];
  /** 압축할 Content-Type 필터 */
  customTypes?: RegExp | ((contentType: string) => boolean);
};
