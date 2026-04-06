import { jwt as _jwt, type JwtOptions } from "better-auth/plugins";

import { merge } from "../../../utils/utils";

export type { JwtOptions } from "better-auth/plugins";

/**
 * JWT 플러그인 스키마
 *
 * better-auth jwt 플러그인 호출 시 전달합니다:
 * ```typescript
 * jwt({ schema: JWT_SCHEMA })
 * ```
 */
export const JWT_SCHEMA: JwtOptions["schema"] = {
  jwks: {
    modelName: "jwks",
    fields: {
      publicKey: "public_key",
      privateKey: "private_key",
      createdAt: "created_at",
      expiresAt: "expires_at",
    },
  },
};

/**
 * jwt 플러그인 래퍼
 *
 * Sonamu의 스키마 매핑을 자동으로 병합합니다.
 */
export const jwt = (options: JwtOptions = {}): ReturnType<typeof _jwt> => {
  options.schema = merge(JWT_SCHEMA, options.schema ?? {});
  return _jwt(options);
};
