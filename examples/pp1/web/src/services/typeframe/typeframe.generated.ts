import { z } from "zod";

export const TypeframeBaseSchema = z.object({});
export type TypeframeBaseSchema = z.infer<typeof TypeframeBaseSchema>;
export type TypeframeFieldExpr = string;
/* END Server-side Only */
