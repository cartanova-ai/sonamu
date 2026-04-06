import { type BetterAuthEntityDef } from "./types";

/**
 * better-auth JWT 플러그인 엔티티 정의
 * https://www.better-auth.com/docs/plugins/jwt
 *
 * JWT 토큰 발급 및 JWKS 키 관리를 지원합니다.
 */
export const jwtEntityDef: BetterAuthEntityDef = {
  id: "jwt",
  name: "JWT",
  entities: [
    {
      id: "Jwks",
      table: "jwks",
      title: "JWKS",
      props: [
        { name: "id", type: "string", desc: "ID" },
        { name: "public_key", type: "string", desc: "공개키" },
        { name: "private_key", type: "string", desc: "비밀키" },
        { name: "created_at", type: "date", dbDefault: "CURRENT_TIMESTAMP", desc: "생성일시" },
        { name: "expires_at", type: "date", nullable: true, desc: "만료일시" },
      ],
      indexes: [],
      subsets: {
        A: ["id", "public_key", "private_key", "created_at", "expires_at"],
      },
      enums: {
        JwksOrderBy: { "id-desc": "ID최신순", "created_at-desc": "생성일최신순" },
        JwksSearchField: { id: "ID" },
      },
    },
  ],
  additionalProps: {},
};
