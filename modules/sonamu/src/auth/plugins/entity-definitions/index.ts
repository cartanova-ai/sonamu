export { adminEntityDef } from "./admin";
export { anonymousEntityDef } from "./anonymous";
export { apiKeyEntityDef } from "./api-key";
export { auditLogEntityDef } from "./audit-log";
export { jwtEntityDef } from "./jwt";
export { organizationEntityDef } from "./organization";
export { passkeyEntityDef } from "./passkey";
export { phoneNumberEntityDef } from "./phone-number";
export { ssoEntityDef } from "./sso";
export { twoFactorEntityDef } from "./two-factor";
export type { BetterAuthEntityDef, BetterAuthPluginId } from "./types";
export { usernameEntityDef } from "./username";

import { adminEntityDef } from "./admin";
import { anonymousEntityDef } from "./anonymous";
import { apiKeyEntityDef } from "./api-key";
import { auditLogEntityDef } from "./audit-log";
import { jwtEntityDef } from "./jwt";
import { organizationEntityDef } from "./organization";
import { passkeyEntityDef } from "./passkey";
import { phoneNumberEntityDef } from "./phone-number";
import { ssoEntityDef } from "./sso";
import { twoFactorEntityDef } from "./two-factor";
import { type BetterAuthEntityDef, type BetterAuthPluginId } from "./types";
import { usernameEntityDef } from "./username";

/**
 * 엔티티 정의 레지스트리
 * 플러그인 ID로 엔티티 정의에 접근할 수 있습니다.
 */
export const ENTITY_DEFINITIONS = {
  admin: adminEntityDef,
  username: usernameEntityDef,
  "phone-number": phoneNumberEntityDef,
  "2fa": twoFactorEntityDef,
  sso: ssoEntityDef,
  passkey: passkeyEntityDef,
  organization: organizationEntityDef,
  "api-key": apiKeyEntityDef,
  jwt: jwtEntityDef,
  anonymous: anonymousEntityDef,
  "audit-log": auditLogEntityDef,
} satisfies Record<BetterAuthPluginId, BetterAuthEntityDef>;

/**
 * 지원하는 플러그인 ID 목록
 */
export const SUPPORTED_PLUGIN_IDS: BetterAuthPluginId[] =
  /* SAFETY: better-auth 훅과 어댑터 계약이 이 값의 타입을 보장한다. */ Object.keys(
    ENTITY_DEFINITIONS,
  ) as BetterAuthPluginId[];

/**
 * 플러그인 ID가 유효한지 확인합니다.
 */
export function isValidPluginId(id: string): id is BetterAuthPluginId {
  return id in ENTITY_DEFINITIONS;
}
