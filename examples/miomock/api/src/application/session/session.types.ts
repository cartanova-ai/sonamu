import { type z } from "zod";

import { SessionBaseListParams, SessionBaseSchema } from "../sonamu.generated";

// Session - ListParams
export const SessionListParams = SessionBaseListParams;
export type SessionListParams = z.infer<typeof SessionListParams>;

// Session - SaveParams
export const SessionSaveParams = SessionBaseSchema.partial({ id: true, created_at: true });
export type SessionSaveParams = z.infer<typeof SessionSaveParams>;
