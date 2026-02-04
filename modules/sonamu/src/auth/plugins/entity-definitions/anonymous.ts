import type { BetterAuthEntityDef } from "./types";

/**
 * better-auth Anonymous 플러그인 엔티티 정의
 * https://www.better-auth.com/docs/plugins/anonymous
 *
 * 익명 사용자 인증을 지원합니다.
 * 새로운 테이블을 생성하지 않고 User 테이블에 is_anonymous 필드만 추가합니다.
 */
export const anonymousEntityDef: BetterAuthEntityDef = {
  id: "anonymous",
  name: "Anonymous",
  entities: [],
  additionalProps: {
    User: [{ name: "is_anonymous", type: "boolean", nullable: true, desc: "익명 사용자 여부" }],
  },
};
