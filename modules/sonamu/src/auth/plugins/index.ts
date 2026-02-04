import { merge } from "../../utils/utils";
import { ADMIN_SCHEMA, adminPlugin } from "./admin";
import { PHONE_NUMBER_SCHEMA, phoneNumberPlugin } from "./phone-number";
import { TWO_FACTOR_SCHEMA, twoFactorPlugin } from "./two-factor";
import type { BetterAuthPlugin, BetterAuthPluginId } from "./types";
import { USERNAME_SCHEMA, usernamePlugin } from "./username";

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

import {
  admin as _admin,
  phoneNumber as _phoneNumber,
  twoFactor as _twoFactor,
  username as _username,
  type AdminOptions,
  type PhoneNumberOptions,
  type TwoFactorOptions,
  type UsernameOptions,
} from "better-auth/plugins";

/**
 * 스키마 옵션 병합을 위한 래퍼 함수
 */
export const admin = (options: AdminOptions = {}) => {
  if (options.schema) {
    options.schema = merge(ADMIN_SCHEMA, options.schema);
  }
  return _admin(options);
};

export const phoneNumber = (options: PhoneNumberOptions) => {
  if (options.schema) {
    options.schema = merge(PHONE_NUMBER_SCHEMA, options.schema);
  }
  return _phoneNumber(options);
};

export const twoFactor = (options: TwoFactorOptions = {}) => {
  if (options.schema) {
    options.schema = merge(TWO_FACTOR_SCHEMA, options.schema);
  }
  return _twoFactor(options);
};

export const username = (options: UsernameOptions = {}) => {
  if (options.schema) {
    options.schema = merge(USERNAME_SCHEMA, options.schema);
  }
  return _username(options);
};
