import { z } from "zod";
import { SubsetQuery, zArrayable } from "../../typeframe/shared";
import {
  CategoryStatus,
  CategoryCanShowOnMain,
  CategorySearchField,
  CategoryOrderBy,
} from "./category.enums";

export const CategoryBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  prefix: z.string().max(64).nullable(),
  name: z.string().max(128),
  name_ko: z.string().max(128),
  top_id: z.number().int(),
  parent_id: z.number().int(),
  orderno: z.number().int().nonnegative(),
  css_class: z.string().max(16),
  status: CategoryStatus,
  img_url: z.string().max(256),
  can_show_on_main: CategoryCanShowOnMain,
  text: z.string().max(1024),
  products_cnt: z.number().int().nonnegative(),
  // children: HasMany Category
});
export type CategoryBaseSchema = z.infer<typeof CategoryBaseSchema>;
export const CategoryBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: CategorySearchField,
    keyword: z.string(),
    orderBy: CategoryOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
    status: CategoryStatus,
    can_show_on_main: CategoryCanShowOnMain,
  })
  .partial();
export type CategoryBaseListParams = z.infer<typeof CategoryBaseListParams>;

export const CategorySubsetA = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().max(128),
  name_ko: z.string().max(128),
  orderno: z.number().int().nonnegative(),
  status: CategoryStatus,
  img_url: z.string().max(256),
  text: z.string().max(1024),
  products_cnt: z.number().int().nonnegative(),
  top_id: z.number().int().nonnegative(),
  parent_id: z.number().int().nonnegative(),
  children: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      name: z.string().max(128),
      name_ko: z.string().max(128),
      orderno: z.number().int().nonnegative(),
      status: CategoryStatus,
      products_cnt: z.number().int().nonnegative(),
    })
  ),
});
export type CategorySubsetA = z.infer<typeof CategorySubsetA>;

export const CategorySubsetP = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().max(128),
  name_ko: z.string().max(128),
  orderno: z.number().int().nonnegative(),
  status: CategoryStatus,
  products_cnt: z.number().int().nonnegative(),
  top_id: z.number().int().nonnegative(),
  parent_id: z.number().int().nonnegative(),
  children: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      name: z.string().max(128),
      name_ko: z.string().max(128),
      orderno: z.number().int().nonnegative(),
      status: CategoryStatus,
      products_cnt: z.number().int().nonnegative(),
    })
  ),
});
export type CategorySubsetP = z.infer<typeof CategorySubsetP>;

export type CategorySubsetMapping = {
  A: CategorySubsetA;
  P: CategorySubsetP;
};
export const CategorySubsetKey = z.enum(["A", "P"]);
export type CategorySubsetKey = z.infer<typeof CategorySubsetKey>;

export const categorySubsetQueries: {
  [key in CategorySubsetKey]: SubsetQuery;
} = {
  A: {
    select: [
      "categories.id",
      "categories.name",
      "categories.name_ko",
      "categories.orderno",
      "categories.status",
      "categories.img_url",
      "categories.text",
      "categories.products_cnt",
      "categories.top_id",
      "categories.parent_id",
    ],
    virtual: [],
    joins: [],
    loaders: [
      {
        as: "children",
        table: "categories",
        manyJoin: { from: "categories.id", to: "categories.id" },
        oneJoins: [],
        select: [
          "categories.id",
          "categories.name",
          "categories.name_ko",
          "categories.orderno",
          "categories.status",
          "categories.products_cnt",
        ],
      },
    ],
  },
  P: {
    select: [
      "categories.id",
      "categories.name",
      "categories.name_ko",
      "categories.orderno",
      "categories.status",
      "categories.products_cnt",
      "categories.top_id",
      "categories.parent_id",
    ],
    virtual: [],
    joins: [],
    loaders: [
      {
        as: "children",
        table: "categories",
        manyJoin: { from: "categories.id", to: "categories.id" },
        oneJoins: [],
        select: [
          "categories.id",
          "categories.name",
          "categories.name_ko",
          "categories.orderno",
          "categories.status",
          "categories.products_cnt",
        ],
      },
    ],
  },
};
export type CategoryFieldExpr =
  | "id"
  | "prefix"
  | "name"
  | "name_ko"
  | "top.id"
  | "top.prefix"
  | "top.name"
  | "top.name_ko"
  | "top.orderno"
  | "top.css_class"
  | "top.status"
  | "top.img_url"
  | "top.can_show_on_main"
  | "top.text"
  | "top.products_cnt"
  | "parent.id"
  | "parent.prefix"
  | "parent.name"
  | "parent.name_ko"
  | "parent.orderno"
  | "parent.css_class"
  | "parent.status"
  | "parent.img_url"
  | "parent.can_show_on_main"
  | "parent.text"
  | "parent.products_cnt"
  | "orderno"
  | "css_class"
  | "status"
  | "img_url"
  | "can_show_on_main"
  | "text"
  | "products_cnt"
  | "children.id"
  | "children.prefix"
  | "children.name"
  | "children.name_ko"
  | "children.orderno"
  | "children.css_class"
  | "children.status"
  | "children.img_url"
  | "children.can_show_on_main"
  | "children.text"
  | "children.products_cnt";
