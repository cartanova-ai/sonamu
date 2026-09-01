export type { GenerateBetterAuthEntitiesOptions } from "./auth-generator";
export { addCompanionsToEntities, generateBetterAuthEntities } from "./auth-generator";
export { ingestAuditEvent } from "./audit-log-ingestor";
export { type AuditLogEvent } from "./audit-log/events";
export { sonamuAuditLog } from "./audit-log/plugin";
export { BASE_FIELD_MAPPINGS, betterAuthV1 } from "./better-auth-entities";
export { sonamuKnexAdapter } from "./knex-adapter";

// 외부로는 wrappers만 export (admin, twoFactor 등 래퍼 함수와 SCHEMA)
export * from "./plugins";
