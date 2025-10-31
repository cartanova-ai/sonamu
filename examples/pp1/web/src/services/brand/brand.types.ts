import { z } from "zod";
import { BrandBaseListParams, BrandBaseSchema } from "../sonamu.generated";

// Brand - ListParams
export const BrandListParams = BrandBaseListParams;
export type BrandListParams = z.infer<typeof BrandListParams>;

// Brand - SaveParams
export const BrandSaveParams = BrandBaseSchema.partial({
  id: true,
  created_at: true,
});
export type BrandSaveParams = z.infer<typeof BrandSaveParams>;
