import { z } from "zod";
import { zArrayable, SQLDateTimeString } from "@sonamu/core";
import { BrandSearchField, BrandOrderBy } from "./brand.enums";

export const BrandBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().max(128),
  created_at: SQLDateTimeString,
});
export type BrandBaseSchema = z.infer<typeof BrandBaseSchema>;
export const BrandBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: BrandSearchField,
    keyword: z.string(),
    orderBy: BrandOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
  })
  .partial();
export type BrandBaseListParams = z.infer<typeof BrandBaseListParams>;

export const BrandSubsetA = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().max(128),
  created_at: SQLDateTimeString,
});
export type BrandSubsetA = z.infer<typeof BrandSubsetA>;

export type BrandSubsetMapping = {
  A: BrandSubsetA;
};
export const BrandSubsetKey = z.enum(["A"]);
export type BrandSubsetKey = z.infer<typeof BrandSubsetKey>;

/* BEGIN- Server-side Only */
import { SubsetQuery } from "@sonamu/core";
export const brandSubsetQueries: { [key in BrandSubsetKey]: SubsetQuery } = {
  A: {
    select: ["brands.id", "brands.name", "brands.created_at"],
    virtual: [],
    joins: [],
    loaders: [],
  },
};

export type BrandFieldExpr = "id" | "name" | "created_at";
/* END Server-side Only */
