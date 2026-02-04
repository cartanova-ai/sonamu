import { admin as _admin, type AdminOptions } from "better-auth/plugins";
import { merge } from "../../../utils/utils";

export type { AdminOptions } from "better-auth/plugins";

/**
 * Admin 플러그인 스키마
 *
 * better-auth admin 플러그인 호출 시 전달합니다:
 * ```typescript
 * admin({ schema: ADMIN_SCHEMA })
 * ```
 */
export const ADMIN_SCHEMA: AdminOptions["schema"] = {
  user: {
    fields: {
      // role: "role",
      // banned: "banned",
      banReason: "ban_reason",
      banExpires: "ban_expires",
    },
  },
  session: {
    fields: {
      impersonatedBy: "impersonated_by",
    },
  },
};

/**
 * admin 플러그인 래퍼
 *
 * Sonamu의 스키마 매핑을 자동으로 병합합니다.
 */
export const admin = (options: AdminOptions = {}) => {
  if (options.schema) {
    options.schema = merge(ADMIN_SCHEMA, options.schema);
  }
  return _admin(options);
};
