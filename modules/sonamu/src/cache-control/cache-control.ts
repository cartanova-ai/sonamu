import type { FastifyReply } from "fastify";
import type { CacheControlConfig } from "./types.js";

/**
 * 자주 사용하는 Cache-Control 프리셋입니다.
 *
 * @example
 * ```typescript
 * // API에서 사용
 * @api({
 *   httpMethod: 'GET',
 *   cacheControl: CachePresets.shortLived,
 * })
 *
 * // SSR 라우트에서 사용
 * registerSSR({
 *   path: '/products',
 *   cacheControl: CachePresets.ssr,
 * });
 * ```
 */
export const CachePresets = {
  /** 캐시 금지 (민감한 데이터, mutation 요청) */
  noStore: {
    noStore: true,
  },

  /** 캐시하되 매번 재검증 */
  noCache: {
    noCache: true,
  },

  /** 짧은 캐시 (1분) - CSR fallback, 자주 변경되는 데이터에 적합 */
  shortLived: {
    visibility: "public" as const,
    maxAge: 60,
  },

  /** SSR 캐시 (10초 + stale-while-revalidate 30초) */
  ssr: {
    visibility: "public" as const,
    maxAge: 10,
    staleWhileRevalidate: 30,
  },

  /** 중간 캐시 (5분) - 거의 변경되지 않는 데이터 (약관, 설정 등) */
  mediumLived: {
    visibility: "public" as const,
    maxAge: 300,
  },

  /** 긴 캐시 (1시간) - 정적 컨텐츠 */
  longLived: {
    visibility: "public" as const,
    maxAge: 3600,
  },

  /** 영구 캐시 (1년 + immutable) - 해시가 포함된 정적 파일 */
  immutable: {
    visibility: "public" as const,
    maxAge: 31536000,
    immutable: true,
  },

  /** 개인화된 데이터 (로그인 사용자별 다른 응답) */
  private: {
    visibility: "private" as const,
    noCache: true,
  },
} as const satisfies Record<string, CacheControlConfig>;

/**
 * CacheControlConfig 객체를 HTTP Cache-Control 헤더 문자열로 변환합니다.
 *
 * @example
 * ```typescript
 * buildCacheControl({ visibility: 'public', maxAge: 60 });
 * // => 'public, max-age=60'
 *
 * buildCacheControl({ noStore: true });
 * // => 'no-store'
 *
 * buildCacheControl(CachePresets.immutable);
 * // => 'public, max-age=31536000, immutable'
 * ```
 */
export function buildCacheControl(config: CacheControlConfig): string {
  const parts: string[] = [];

  // noStore가 설정되면 다른 모든 것을 무시합니다.
  if (config.noStore) {
    return "no-store";
  }

  // noCache가 설정되면 visibility와 함께 반환합니다.
  if (config.noCache) {
    if (config.visibility === "private") {
      return "private, no-cache";
    }
    return "no-cache";
  }

  // visibility (기본값: public)
  parts.push(config.visibility ?? "public");

  // TTL 설정
  if (config.maxAge !== undefined) {
    parts.push(`max-age=${config.maxAge}`);
  }

  if (config.sMaxAge !== undefined) {
    parts.push(`s-maxage=${config.sMaxAge}`);
  }

  // 재검증 옵션
  if (config.mustRevalidate) {
    parts.push("must-revalidate");
  }

  if (config.proxyRevalidate) {
    parts.push("proxy-revalidate");
  }

  if (config.immutable) {
    parts.push("immutable");
  }

  // Stale 옵션
  if (config.staleWhileRevalidate !== undefined) {
    parts.push(`stale-while-revalidate=${config.staleWhileRevalidate}`);
  }

  if (config.staleIfError !== undefined) {
    parts.push(`stale-if-error=${config.staleIfError}`);
  }

  return parts.join(", ");
}

/**
 * Cache-Control 헤더와 관련 헤더(Vary)를 FastifyReply에 설정합니다.
 *
 * @example
 * ```typescript
 * applyCacheHeaders(reply, {
 *   visibility: "public",
 *   maxAge: 300,
 *   vary: ["Accept-Language"],
 * });
 * // => Cache-Control: public, max-age=300
 * // => Vary: Accept-Language
 * ```
 */
export function applyCacheHeaders(reply: FastifyReply, config: CacheControlConfig): void {
  reply.header("Cache-Control", buildCacheControl(config));

  if (config.vary && config.vary.length > 0) {
    reply.header("Vary", config.vary.join(", "));
  }
}
