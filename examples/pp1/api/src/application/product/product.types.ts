import { z } from "zod";
import { zArrayable } from "sonamu";
import { TagSaveParams } from "../tag/tag.types";
import { ProductStatus, ProductType } from "./product.enums";
import { ProductBaseSchema, ProductBaseListParams } from "./product.generated";

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
