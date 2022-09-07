import { z } from "zod";
import { ExrefBaseSchema, ExrefBaseListParams } from "./exref.generated";

// Exref - ListParams
export const ExrefListParams = ExrefBaseListParams;
export type ExrefListParams = z.infer<typeof ExrefListParams>;

// Exref - SaveParams
export const ExrefSaveParams = ExrefBaseSchema.partial({ id: true });
export type ExrefSaveParams = z.infer<typeof ExrefSaveParams>;
