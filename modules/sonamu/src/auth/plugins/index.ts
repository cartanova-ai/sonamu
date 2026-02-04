import { adminPlugin } from "./admin";
import { phoneNumberPlugin } from "./phone-number";
import { twoFactorPlugin } from "./two-factor";
import type { BetterAuthPlugin, BetterAuthPluginId } from "./types";
import { usernamePlugin } from "./username";

export { ADMIN_SCHEMA, adminPlugin } from "./admin";
export { PHONE_NUMBER_SCHEMA, phoneNumberPlugin } from "./phone-number";
export { TWO_FACTOR_SCHEMA, twoFactorPlugin } from "./two-factor";
export type { BetterAuthPlugin, BetterAuthPluginId, PluginSchema } from "./types";
export { USERNAME_SCHEMA, usernamePlugin } from "./username";

/**
 * 플러그인 레지스트리
 * 플러그인 ID로 플러그인 정의에 접근할 수 있습니다.
 */
export const PLUGINS: Record<BetterAuthPluginId, BetterAuthPlugin> = {
  admin: adminPlugin,
  "phone-number": phoneNumberPlugin,
  "2fa": twoFactorPlugin,
  username: usernamePlugin,
};

/**
 * 지원하는 플러그인 ID 목록
 */
export const SUPPORTED_PLUGIN_IDS: BetterAuthPluginId[] = Object.keys(
  PLUGINS,
) as BetterAuthPluginId[];

/**
 * 플러그인 ID가 유효한지 확인합니다.
 */
export function isValidPluginId(id: string): id is BetterAuthPluginId {
  return id in PLUGINS;
}
