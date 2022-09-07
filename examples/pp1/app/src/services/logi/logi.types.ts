import { z } from "zod";
import { LogiBaseSchema, LogiBaseListParams } from "./logi.generated";

// Logi - ListParams
export const LogiListParams = LogiBaseListParams;
export type LogiListParams = z.infer<typeof LogiListParams>;

// Logi - SaveParams
export const LogiSaveParams = LogiBaseSchema.partial({ id: true });
export type LogiSaveParams = z.infer<typeof LogiSaveParams>;
