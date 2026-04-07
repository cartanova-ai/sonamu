import { username as _username } from "better-auth/plugins";
import { type UsernameOptions } from "better-auth/plugins";

import { merge } from "../../../utils/utils";

export type { UsernameOptions } from "better-auth/plugins";

/**
 * Username 플러그인 스키마
 *
 * better-auth username 플러그인 호출 시 전달합니다:
 * ```typescript
 * username({ schema: USERNAME_SCHEMA })
 * ```
 */
export const USERNAME_SCHEMA: UsernameOptions["schema"] = {
  user: {
    fields: {
      // username: "username",
      displayUsername: "display_username",
    },
  },
};

/**
 * username 플러그인 래퍼
 *
 * Sonamu의 스키마 매핑을 자동으로 병합합니다.
 */
export const username = (options: UsernameOptions = {}) => {
  options.schema = merge(USERNAME_SCHEMA, options.schema ?? {});
  return _username(options);
};
