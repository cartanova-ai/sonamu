import { anonymous as _anonymous } from "better-auth/plugins";
import { type AnonymousOptions } from "better-auth/plugins";

import { merge } from "../../../utils/utils";

export type { AnonymousOptions } from "better-auth/plugins";

/**
 * Anonymous 플러그인 스키마
 *
 * better-auth anonymous 플러그인 호출 시 전달합니다:
 * ```typescript
 * anonymous({ schema: ANONYMOUS_SCHEMA })
 * ```
 */
export const ANONYMOUS_SCHEMA: AnonymousOptions["schema"] = {
  user: {
    fields: {
      isAnonymous: "is_anonymous",
    },
  },
};

/**
 * anonymous 플러그인 래퍼
 *
 * Sonamu의 스키마 매핑을 자동으로 병합합니다.
 */
export const anonymous = (options: AnonymousOptions = {}): ReturnType<typeof _anonymous> => {
  options.schema = merge(ANONYMOUS_SCHEMA, options.schema ?? {});
  return _anonymous(options);
};
