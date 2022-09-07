import { z } from "zod";
import { zArrayable, SQLDateTimeString } from "../sonamu.shared";
import {
  ProductType,
  ProductStatus,
  ProductSearchField,
  ProductOrderBy,
} from "./product.enums";

export const ProductBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  brand_id: z.number().int(),
  type: ProductType,
  title: z.string().max(128),
  description: z.string().max(16777215),
  price: z.number().int(),
  is_new: z.boolean(),
  visible_until_at: SQLDateTimeString,
  status: ProductStatus,
  created_at: SQLDateTimeString,
  checked_at: SQLDateTimeString.nullable(),
  images: z.array(z.string()),
  // tags: ManyToMany Tag
});
export type ProductBaseSchema = z.infer<typeof ProductBaseSchema>;
export const ProductBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: ProductSearchField,
    keyword: z.string(),
    orderBy: ProductOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
  })
  .partial();
export type ProductBaseListParams = z.infer<typeof ProductBaseListParams>;

export const ProductSubsetA = z.object({
  id: z.number().int().nonnegative(),
  type: ProductType,
  title: z.string().max(128),
  description: z.string().max(16777215),
  price: z.number().int(),
  is_new: z.boolean(),
  visible_until_at: SQLDateTimeString,
  images: z.array(z.string()),
  status: ProductStatus,
  checked_at: SQLDateTimeString.nullable(),
  created_at: SQLDateTimeString,
  brand: z.object({
    id: z.number().int().nonnegative(),
    name: z.string().max(128),
  }),
  tags: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      name: z.string().max(64),
      created_at: SQLDateTimeString,
    })
  ),
});
export type ProductSubsetA = z.infer<typeof ProductSubsetA>;

export type ProductSubsetMapping = {
  A: ProductSubsetA;
};
export const ProductSubsetKey = z.enum(["A"]);
export type ProductSubsetKey = z.infer<typeof ProductSubsetKey>;

