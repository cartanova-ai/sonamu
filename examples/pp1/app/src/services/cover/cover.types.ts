import { z } from "zod";
import { CoverBaseSchema, CoverBaseListParams } from "./cover.generated";

// Cover - ListParams
export const CoverListParams = CoverBaseListParams;
export type CoverListParams = z.infer<typeof CoverListParams>;

// Cover - SaveParams
export const CoverSaveParams = CoverBaseSchema.partial({ id: true });
export type CoverSaveParams = z.infer<typeof CoverSaveParams>;
