import type { BetterAuthEntityDef } from "./types";

/**
 * better-auth 2FA (Two-Factor Authentication) 플러그인 엔티티 정의
 * https://www.better-auth.com/docs/plugins/2fa
 *
 * User 테이블에 2FA 활성화 필드를 추가하고,
 * TwoFactor 테이블을 생성하여 2FA 설정을 저장합니다.
 */
export const twoFactorEntityDef: BetterAuthEntityDef = {
  id: "2fa",
  name: "Two-Factor Authentication",
  entities: [
    {
      id: "TwoFactor",
      table: "two_factors",
      title: "2FA 설정",
      props: [
        { name: "id", type: "string", desc: "ID" },
        { name: "secret", type: "string", desc: "비밀 키" },
        { name: "backup_codes", type: "string", desc: "백업 코드" },
        { name: "created_at", type: "date", dbDefault: "CURRENT_TIMESTAMP", desc: "생성일시" },
        { name: "updated_at", type: "date", dbDefault: "CURRENT_TIMESTAMP", desc: "수정일시" },
        {
          type: "relation",
          name: "user",
          with: "User",
          relationType: "BelongsToOne",
          onDelete: "CASCADE",
          desc: "사용자",
        },
      ],
      indexes: [{ type: "index", name: "two_factors_user_id_idx", columns: [{ name: "user_id" }] }],
      subsets: {
        A: ["id", "secret", "backup_codes", "created_at", "updated_at", "user.id"],
      },
      enums: {
        TwoFactorOrderBy: { "id-desc": "ID최신순" },
        TwoFactorSearchField: { id: "ID" },
      },
    },
  ],
  additionalProps: {
    User: [
      {
        name: "two_factor_enabled",
        type: "boolean",
        nullable: true,
        desc: "2FA 활성화 여부",
      },
    ],
  },
};
