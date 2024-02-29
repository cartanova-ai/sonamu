import { z } from "zod";
import { zArrayable } from "sonamu";
import {
  ProductStatus,
  ProductType,
  ProductBaseSchema,
  ProductBaseListParams,
} from "../sonamu.generated";
import { TagSaveParams } from "../tag/tag.types";

// Product - ListParams
export const ProductListParams = ProductBaseListParams.extend({
  type: ProductType.optional(),
  status: ProductStatus.optional(),
  brand_id: zArrayable(z.number()).optional(),
  tag_id: zArrayable(z.number()).optional(),
});
export type ProductListParams = z.infer<typeof ProductListParams>;

// Product - SaveParams
export const ProductSaveParams = ProductBaseSchema.partial({
  id: true,
  created_at: true,
}).extend({
  tags: TagSaveParams.array(),
});
export type ProductSaveParams = z.infer<typeof ProductSaveParams>;
