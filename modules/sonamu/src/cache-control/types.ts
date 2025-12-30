import type { ExtendedApi } from "../api/decorators.js";
import type { SSRRoute } from "../ssr/types.js";

/**
 * Cache-Control 헤더 설정을 위한 타입입니다.
 *
 * @example
 * ```typescript
 * // 캐시 금지
 * const noStore: CacheControlConfig = { noStore: true };
 *
 * // 1시간 캐시
 * const oneHour: CacheControlConfig = {
 *   visibility: 'public',
 *   maxAge: 3600,
 * };
 *
 * // CDN용 설정 (stale-while-revalidate 포함)
 * const cdnOptimized: CacheControlConfig = {
 *   visibility: 'public',
 *   maxAge: 60,
 *   sMaxAge: 300,
 *   staleWhileRevalidate: 600,
 * };
 * ```
 */
export type CacheControlConfig = {
  /** 캐시 저장 위치. 기본값: 'public' */
  visibility?: "public" | "private";

  /** 캐시하되 매번 재검증 (no-cache) */
  noCache?: boolean;

  /** 캐시 자체를 금지 (no-store) */
  noStore?: boolean;

  /** 브라우저 캐시 시간 (초) */
  maxAge?: number;

  /** CDN/프록시 캐시 시간 (초). s-maxage 헤더로 변환됩니다. */
  sMaxAge?: number;

  /** 만료 후 반드시 재검증 필요 */
  mustRevalidate?: boolean;

  /** 프록시에서만 만료 후 재검증 필요 */
  proxyRevalidate?: boolean;

  /** 캐시된 응답이 변경되지 않음을 명시 (해시가 포함된 정적 파일에 유용) */
  immutable?: boolean;

  /** 백그라운드 재검증 중 stale 응답 허용 시간 (초). CloudFront 지원. */
  staleWhileRevalidate?: number;

  /** 오류 발생 시 stale 응답 허용 시간 (초). CloudFront 지원. */
  staleIfError?: number;
};

/**
 * Cache-Control 핸들러에 전달되는 요청 정보입니다.
 */
export type CacheControlRequest = {
  /** 요청 타입 */
  type: "api" | "assets" | "ssr" | "csr";

  /** 전체 URL (쿼리 스트링 포함) */
  url: string;

  /** 경로 (쿼리 스트링 제외) */
  path: string;

  /** HTTP 메서드 */
  method: string;

  /** API 요청일 때만 존재하는 추가 정보 */
  api?: ExtendedApi;

  /** SSR 요청일 때만 존재하는 추가 정보 */
  route?: SSRRoute;
};

/**
 * 전역 Cache-Control 핸들러 타입입니다.
 * undefined를 반환하면 기본값이 적용됩니다.
 *
 * @example
 * ```typescript
 * const handler: CacheControlHandler = (req) => {
 *   if (req.type === 'assets') {
 *     return CachePresets.immutable;
 *   }
 *   if (req.type === 'api' && req.method === 'GET') {
 *     return CachePresets.shortLived;
 *   }
 *   return undefined; // 기본값 사용
 * };
 * ```
 */
export type CacheControlHandler = (req: CacheControlRequest) => CacheControlConfig | undefined;
