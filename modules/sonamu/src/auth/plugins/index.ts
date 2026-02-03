import { phoneNumberPlugin } from "./phone-number";
import { twoFactorPlugin } from "./two-factor";
import type { BetterAuthPlugin, BetterAuthPluginId } from "./types";

export { PHONE_NUMBER_SCHEMA, phoneNumberPlugin } from "./phone-number";
export { TWO_FACTOR_SCHEMA, twoFactorPlugin } from "./two-factor";
export type { BetterAuthPlugin, BetterAuthPluginId, PluginSchema } from "./types";

/**
 * 플러그인 레지스트리
 * 플러그인 ID로 플러그인 정의에 접근할 수 있습니다.
 */
export const PLUGINS: Record<BetterAuthPluginId, BetterAuthPlugin> = {
  "phone-number": phoneNumberPlugin,
  "2fa": twoFactorPlugin,
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
