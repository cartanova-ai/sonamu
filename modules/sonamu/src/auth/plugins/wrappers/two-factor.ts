import { twoFactor as _twoFactor } from "better-auth/plugins";
import type { TwoFactorOptions } from "better-auth/plugins";

import { merge } from "../../../utils/utils";

export type { TwoFactorOptions } from "better-auth/plugins";

/**
 * Two-Factor 플러그인 스키마
 *
 * better-auth twoFactor 플러그인 호출 시 전달합니다:
 * ```typescript
 * twoFactor({ schema: TWO_FACTOR_SCHEMA })
 * ```
 */
export const TWO_FACTOR_SCHEMA: TwoFactorOptions["schema"] = {
  user: {
    fields: {
      twoFactorEnabled: "two_factor_enabled",
    },
  },
  twoFactor: {
    modelName: "two_factors",
    fields: {
      userId: "user_id",
      backupCodes: "backup_codes",
    },
  },
};

/**
 * twoFactor 플러그인 래퍼
 *
 * Sonamu의 스키마 매핑을 자동으로 병합합니다.
 */
export const twoFactor = (options: TwoFactorOptions = {}) => {
  options.schema = merge(TWO_FACTOR_SCHEMA, options.schema ?? {});
  return _twoFactor(options);
};
