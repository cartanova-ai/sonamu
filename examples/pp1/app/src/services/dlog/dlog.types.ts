import { z } from "zod";
import { DlogBaseSchema, DlogBaseListParams } from "./dlog.generated";

// Dlog - ListParams
export const DlogListParams = DlogBaseListParams;
export type DlogListParams = z.infer<typeof DlogListParams>;

// Dlog - SaveParams
export const DlogSaveParams = DlogBaseSchema.partial({ id: true });
export type DlogSaveParams = z.infer<typeof DlogSaveParams>;
