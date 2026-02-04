export { adminEntityDef } from "./admin";
export { phoneNumberEntityDef } from "./phone-number";
export { twoFactorEntityDef } from "./two-factor";
export type { BetterAuthEntityDef, BetterAuthPluginId } from "./types";
export { usernameEntityDef } from "./username";

import { adminEntityDef } from "./admin";
import { phoneNumberEntityDef } from "./phone-number";
import { twoFactorEntityDef } from "./two-factor";
import type { BetterAuthEntityDef, BetterAuthPluginId } from "./types";
import { usernameEntityDef } from "./username";

/**
 * 엔티티 정의 레지스트리
 * 플러그인 ID로 엔티티 정의에 접근할 수 있습니다.
 */
export const ENTITY_DEFINITIONS: Record<BetterAuthPluginId, BetterAuthEntityDef> = {
  admin: adminEntityDef,
  username: usernameEntityDef,
  "phone-number": phoneNumberEntityDef,
  "2fa": twoFactorEntityDef,
};

/**
 * 지원하는 플러그인 ID 목록
 */
export const SUPPORTED_PLUGIN_IDS: BetterAuthPluginId[] = Object.keys(
  ENTITY_DEFINITIONS,
) as BetterAuthPluginId[];

/**
 * 플러그인 ID가 유효한지 확인합니다.
 */
export function isValidPluginId(id: string): id is BetterAuthPluginId {
  return id in ENTITY_DEFINITIONS;
}
