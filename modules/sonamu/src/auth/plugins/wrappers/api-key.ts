import { apiKey as _apiKey } from "better-auth/plugins";
import { type ApiKeyOptions } from "better-auth/plugins";

import { merge } from "../../../utils/utils";

export type { ApiKeyOptions } from "better-auth/plugins";

/**
 * API Key 플러그인 스키마
 *
 * better-auth apiKey 플러그인 호출 시 전달합니다:
 * ```typescript
 * apiKey({ schema: API_KEY_SCHEMA })
 * ```
 */
export const API_KEY_SCHEMA: ApiKeyOptions["schema"] = {
  apikey: {
    modelName: "api_keys",
    fields: {
      userId: "user_id",
      lastRequest: "last_request",
      requestCount: "request_count",
      rateLimitEnabled: "rate_limit_enabled",
      rateLimitTimeWindow: "rate_limit_time_window",
      rateLimitMax: "rate_limit_max",
      refillInterval: "refill_interval",
      refillAmount: "refill_amount",
      lastRefillAt: "last_refill_at",
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
};

/**
 * apiKey 플러그인 래퍼
 *
 * Sonamu의 스키마 매핑을 자동으로 병합합니다.
 */
export const apiKey = (options: ApiKeyOptions = {}): ReturnType<typeof _apiKey> => {
  options.schema = merge(API_KEY_SCHEMA, options.schema ?? {});
  return _apiKey(options);
};
