/**
 * @generated
 * API에서 동기화된 파일입니다. 직접 수정하지 마세요.
 */
import { z } from "zod";
import { AuditLogBaseListParams, AuditLogBaseSchema } from "../sonamu.generated";

// 커스텀 JSON 타입: AuditLogValue (old_value, new_value에 사용)
export const AuditLogValue = z.record(z.string(), z.unknown());
export type AuditLogValue = z.infer<typeof AuditLogValue>;

// AuditLog - ListParams
export const AuditLogListParams = AuditLogBaseListParams.extend({
  entity_type: z.string().optional(),
  actor_id: z.string().optional(),
  date_from: z.coerce.date().optional(),
  date_to: z.coerce.date().optional(),
});
export type AuditLogListParams = z.infer<typeof AuditLogListParams>;

// AuditLog - SaveParams (내부 log() 메서드 전용)
export const AuditLogSaveParams = AuditLogBaseSchema.partial({
  id: true,
  created_at: true,
  actor_id: true,
  old_value: true,
  new_value: true,
}).extend({
  actor_id: z.string().nullish(),
  old_value: AuditLogValue.nullish(),
  new_value: AuditLogValue.nullish(),
});
export type AuditLogSaveParams = z.infer<typeof AuditLogSaveParams>;
