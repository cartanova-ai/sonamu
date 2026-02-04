import type { BetterAuthPlugin, PluginSchema } from "./types";

/**
 * Phone Number 플러그인 스키마
 *
 * better-auth phoneNumber 플러그인 호출 시 전달합니다:
 * ```typescript
 * phoneNumber({ schema: PHONE_NUMBER_SCHEMA })
 * ```
 */
export const PHONE_NUMBER_SCHEMA: PluginSchema = {
  user: {
    fields: {
      phoneNumber: "phone_number",
      phoneNumberVerified: "phone_number_verified",
    },
  },
};

/**
 * better-auth phone-number 플러그인
 * https://www.better-auth.com/docs/plugins/phone-number
 *
 * User 테이블에 전화번호 관련 필드를 추가합니다:
 * - phone_number: 전화번호 (unique)
 * - phone_number_verified: 전화번호 인증 여부
 */
export const phoneNumberPlugin: BetterAuthPlugin = {
  id: "phone-number",
  name: "Phone Number",
  entities: [],
  additionalProps: {
    User: [
      {
        name: "phone_number",
        type: "string",
        nullable: true,
        desc: "전화번호",
      },
      {
        name: "phone_number_verified",
        type: "boolean",
        nullable: true,
        desc: "전화번호 인증 여부",
      },
    ],
  },
  additionalIndexes: {
    User: [
      {
        type: "unique",
        name: "users_phone_number_unique",
        columns: [{ name: "phone_number" }],
      },
    ],
  },
  schema: PHONE_NUMBER_SCHEMA,
};
