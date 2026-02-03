export type { GenerateBetterAuthEntitiesOptions } from "./auth-generator";
export { generateBetterAuthEntities } from "./auth-generator";
export { BASE_FIELD_MAPPINGS, betterAuthV1 } from "./better-auth-entities";
export type { BetterAuthPlugin, BetterAuthPluginId, PluginSchema } from "./plugins";
// 플러그인 관련 export
export {
  isValidPluginId,
  PHONE_NUMBER_SCHEMA,
  PLUGINS,
  phoneNumberPlugin,
  SUPPORTED_PLUGIN_IDS,
  TWO_FACTOR_SCHEMA,
  twoFactorPlugin,
} from "./plugins";
