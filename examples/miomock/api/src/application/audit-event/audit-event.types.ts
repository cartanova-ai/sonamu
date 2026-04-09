import { z } from "zod";

import { AuditEventBaseListParams, AuditEventBaseSchema } from "../sonamu.generated";

// 커스텀 JSON 타입: AuditEventPayload (payload_json에 사용)
export const AuditEventPayload = z.record(z.string(), z.unknown());
export type AuditEventPayload = z.infer<typeof AuditEventPayload>;

// AuditEvent - ListParams
export const AuditEventListParams = AuditEventBaseListParams;
export type AuditEventListParams = z.infer<typeof AuditEventListParams>;

// AuditEvent - SaveParams
export const AuditEventSaveParams = AuditEventBaseSchema.partial({
  id: true,
  ingested_at: true,
  source_version: true,
  actor_user_id: true,
  subject_user_id: true,
  organization_id: true,
  team_id: true,
  session_id: true,
  provider_id: true,
  login_method: true,
  identifier: true,
  visitor_id: true,
  reason: true,
  action: true,
  trigger_context: true,
  ip_address: true,
  country_code: true,
  country: true,
  city: true,
  user_agent: true,
}).extend({
  source_version: z.string().nullish(),
  actor_user_id: z.string().nullish(),
  subject_user_id: z.string().nullish(),
  organization_id: z.string().nullish(),
  team_id: z.string().nullish(),
  session_id: z.string().nullish(),
  provider_id: z.string().nullish(),
  login_method: z.string().nullish(),
  identifier: z.string().nullish(),
  visitor_id: z.string().nullish(),
  reason: z.string().nullish(),
  action: z.string().nullish(),
  trigger_context: z.string().nullish(),
  ip_address: z.string().nullish(),
  country_code: z.string().nullish(),
  country: z.string().nullish(),
  city: z.string().nullish(),
  user_agent: z.string().nullish(),
});
export type AuditEventSaveParams = z.infer<typeof AuditEventSaveParams>;
