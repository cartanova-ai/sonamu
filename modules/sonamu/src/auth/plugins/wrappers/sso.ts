import { sso as _sso } from "@better-auth/sso";
import { type SSOOptions } from "@better-auth/sso";

export type { SSOOptions } from "@better-auth/sso";

/**
 * SSO 플러그인 스키마
 *
 * better-auth sso 플러그인 호출 시 전달합니다:
 * ```typescript
 * sso({ schema: SSO_SCHEMA })
 * ```
 */
export const SSO_SCHEMA: SSOOptions = {
  modelName: "sso_providers",
  fields: {
    oidcConfig: "oidc_config",
    samlConfig: "saml_config",
    userId: "user_id",
    providerId: "provider_id",
    organizationId: "organization_id",
  },
};

/**
 * sso 플러그인 래퍼
 *
 * Sonamu의 스키마 매핑을 자동으로 병합합니다.
 */
export const sso = (options: SSOOptions = {}) => {
  options.modelName = "sso_providers";
  options.fields = {
    oidcConfig: "oidc_config",
    samlConfig: "saml_config",
    userId: "user_id",
    providerId: "provider_id",
    organizationId: "organization_id",
    ...options.fields,
  };
  return _sso(options);
};
