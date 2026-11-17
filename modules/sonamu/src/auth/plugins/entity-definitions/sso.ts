import { type BetterAuthEntityDef } from "./types";

/**
 * better-auth SSO 플러그인 엔티티 정의
 * https://www.better-auth.com/docs/plugins/sso
 *
 * 외부 IdP(OIDC, SAML)를 통한 SSO 로그인을 지원합니다.
 * SsoProvider 테이블을 생성하여 SSO 제공자 설정을 저장합니다.
 */
export const ssoEntityDef: BetterAuthEntityDef = {
  id: "sso",
  name: "SSO",
  entities: [
    {
      id: "SsoProvider",
      table: "sso_providers",
      title: "SSO 제공자",
      props: [
        { name: "id", type: "string", desc: "ID" },
        { name: "created_at", type: "date", dbDefault: "CURRENT_TIMESTAMP", desc: "생성일시" },
        { name: "issuer", type: "string", readonly: true, desc: "발급자 URL" },
        {
          name: "oidc_config",
          type: "string",
          nullable: true,
          readonly: true,
          desc: "OIDC 설정 (JSON)",
        },
        {
          name: "saml_config",
          type: "string",
          nullable: true,
          readonly: true,
          desc: "SAML 설정 (JSON)",
        },
        { name: "provider_id", type: "string", readonly: true, desc: "제공자 ID" },
        { name: "domain", type: "string", nullable: true, readonly: true, desc: "도메인" },
        {
          type: "relation",
          name: "user",
          readonly: true,
          with: "User",
          relationType: "BelongsToOne",
          onDelete: "CASCADE",
          desc: "생성자",
        },
      ],
      indexes: [
        {
          type: "unique",
          name: "sso_providers_provider_id_unique",
          columns: [{ name: "provider_id" }],
        },
        { type: "index", name: "sso_providers_user_id_idx", columns: [{ name: "user_id" }] },
      ],
      subsets: {
        // OIDC/SAML 설정은 client secret을 담을 수 있으므로 subset에 넣지 않는다.
        A: ["id", "issuer", "provider_id", "domain", "created_at", "user.id"],
      },
      enums: {
        SsoProviderOrderBy: { "id-desc": "ID최신순" },
        SsoProviderSearchField: { id: "ID", provider_id: "제공자ID" },
      },
    },
  ],
  additionalProps: {},
};
