import type { BetterAuthPlugin, PluginSchema } from "./types";

/**
 * Username 플러그인 스키마
 *
 * better-auth username 플러그인 호출 시 전달합니다:
 * ```typescript
 * username({ schema: USERNAME_SCHEMA })
 * ```
 */
export const USERNAME_SCHEMA: PluginSchema = {
  user: {
    fields: {
      // username: "username",
      displayUsername: "display_username",
    },
  },
};

/**
 * better-auth username 플러그인
 * https://www.better-auth.com/docs/plugins/username
 *
 * User 테이블에 사용자명 관련 필드를 추가합니다:
 * - username: 정규화된 사용자명 (소문자, unique)
 * - display_username: 표시용 사용자명 (원본 케이스 유지)
 */
export const usernamePlugin: BetterAuthPlugin = {
  id: "username",
  name: "Username",
  entities: [],
  additionalProps: {
    User: [
      {
        name: "username",
        type: "string",
        nullable: true,
        desc: "사용자명 (정규화)",
      },
      {
        name: "display_username",
        type: "string",
        nullable: true,
        desc: "표시용 사용자명",
      },
    ],
  },
  additionalIndexes: {
    User: [
      {
        type: "unique",
        name: "users_username_unique",
        columns: [{ name: "username" }],
      },
    ],
  },
  schema: USERNAME_SCHEMA,
};
