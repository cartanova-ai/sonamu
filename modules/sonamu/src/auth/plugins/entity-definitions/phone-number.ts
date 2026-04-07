import { type BetterAuthEntityDef } from "./types";

/**
 * better-auth phone-number 플러그인 엔티티 정의
 * https://www.better-auth.com/docs/plugins/phone-number
 *
 * User 테이블에 전화번호 관련 필드를 추가합니다:
 * - phone_number: 전화번호 (unique)
 * - phone_number_verified: 전화번호 인증 여부
 */
export const phoneNumberEntityDef: BetterAuthEntityDef = {
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
};
