import { z } from "zod";
import { zArrayable, SQLDateTimeString } from "@sonamu/core";
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

/* BEGIN- Server-side Only */
import { SubsetQuery } from "@sonamu/core";
export const productSubsetQueries: { [key in ProductSubsetKey]: SubsetQuery } =
  {
    A: {
      select: [
        "products.id",
        "products.type",
        "products.title",
        "products.description",
        "products.price",
        "products.is_new",
        "products.visible_until_at",
        "products.images",
        "products.status",
        "products.checked_at",
        "products.created_at",
        "brand.id as brand__id",
        "brand.name as brand__name",
      ],
      virtual: [],
      joins: [
        {
          as: "brand",
          join: "outer",
          table: "brands",
          from: "products.brand_id",
          to: "brand.id",
        },
      ],
      loaders: [
        {
          as: "tags",
          table: "tags",
          manyJoin: {
            fromTable: "products",
            fromCol: "id",
            idField: "id",
            through: {
              table: "products__tags",
              fromCol: "product_id",
              toCol: "tag_id",
            },
            toTable: "tags",
            toCol: "id",
          },
          oneJoins: [],
          select: ["tags.id", "tags.name", "tags.created_at"],
          loaders: [],
        },
      ],
    },
  };

export type ProductFieldExpr =
  | "id"
  | "brand.id"
  | "brand.name"
  | "brand.created_at"
  | "type"
  | "title"
  | "description"
  | "price"
  | "is_new"
  | "visible_until_at"
  | "status"
  | "created_at"
  | "checked_at"
  | "images"
  | "tags.id"
  | "tags.name"
  | "tags.created_at";
/* END Server-side Only */
