import { z } from "zod";

export const FileBaseSchema = z.object({});
export type FileBaseSchema = z.infer<typeof FileBaseSchema>;
export type FileFieldExpr = string;
/* END Server-side Only */
