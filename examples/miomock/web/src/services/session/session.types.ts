/**
 * @generated
 * API에서 동기화된 파일입니다. 직접 수정하지 마세요.
 */
import type { z } from "zod";
import { SessionBaseListParams, SessionBaseSchema } from "../sonamu.generated";

// Session - ListParams
export const SessionListParams = SessionBaseListParams;
export type SessionListParams = z.infer<typeof SessionListParams>;

// Session - SaveParams
export const SessionSaveParams = SessionBaseSchema.partial({ id: true, created_at: true });
export type SessionSaveParams = z.infer<typeof SessionSaveParams>;
