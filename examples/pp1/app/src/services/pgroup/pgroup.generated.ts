import { z } from "zod";
import { SubsetQuery, zArrayable } from "../../typeframe/shared";
import {
  PgroupType,
  PgroupToShowCategory,
  PgroupToShowSoldout,
  PgroupStatus,
  PgroupFilter,
  PgroupSearchField,
  PgroupOrderBy,
} from "./pgroup.enums";

export const PgroupBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  type: PgroupType,
  name: z.string().max(64),
  content: z.string(),
  d_img_url: z.string().max(128),
  m_img_url: z.string().max(128),
  s_img_url: z.string().max(128),
  to_show_category: PgroupToShowCategory,
  to_show_soldout: PgroupToShowSoldout,
  status: PgroupStatus,
  filter: PgroupFilter,
  orderno: z.number().int().nonnegative(),
  created_at: z.string(),
  url_json: z.string().nullable(),
  option_json: z.string().nullable(),
  subtitle: z.string().nullable(),
});
export type PgroupBaseSchema = z.infer<typeof PgroupBaseSchema>;
export const PgroupBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: PgroupSearchField,
    keyword: z.string(),
    orderBy: PgroupOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
    type: PgroupType,
    to_show_category: PgroupToShowCategory,
    to_show_soldout: PgroupToShowSoldout,
    status: PgroupStatus,
    filter: PgroupFilter,
  })
  .partial();
export type PgroupBaseListParams = z.infer<typeof PgroupBaseListParams>;

export const PgroupSubsetA = z.object({
  id: z.number().int().nonnegative(),
  type: PgroupType,
  name: z.string().max(64),
  content: z.string(),
  d_img_url: z.string().max(128),
  m_img_url: z.string().max(128),
  s_img_url: z.string().max(128),
  to_show_category: PgroupToShowCategory,
  to_show_soldout: PgroupToShowSoldout,
  status: PgroupStatus,
  filter: PgroupFilter,
  orderno: z.number().int().nonnegative(),
  created_at: z.string(),
  url_json: z.string().nullable(),
  option_json: z.string().nullable(),
  subtitle: z.string().nullable(),
});
export type PgroupSubsetA = z.infer<typeof PgroupSubsetA>;

export type PgroupSubsetMapping = {
  A: PgroupSubsetA;
};
export const PgroupSubsetKey = z.enum(["A"]);
export type PgroupSubsetKey = z.infer<typeof PgroupSubsetKey>;

export const pgroupSubsetQueries: { [key in PgroupSubsetKey]: SubsetQuery } = {
  A: {
    select: [
      "pgroups.id",
      "pgroups.type",
      "pgroups.name",
      "pgroups.content",
      "pgroups.d_img_url",
      "pgroups.m_img_url",
      "pgroups.s_img_url",
      "pgroups.to_show_category",
      "pgroups.to_show_soldout",
      "pgroups.status",
      "pgroups.filter",
      "pgroups.orderno",
      "pgroups.created_at",
      "pgroups.url_json",
      "pgroups.option_json",
      "pgroups.subtitle",
    ],
    virtual: [],
    joins: [],
    loaders: [],
  },
};
export type PgroupFieldExpr =
  | "id"
  | "type"
  | "name"
  | "content"
  | "d_img_url"
  | "m_img_url"
  | "s_img_url"
  | "to_show_category"
  | "to_show_soldout"
  | "status"
  | "filter"
  | "orderno"
  | "created_at"
  | "url_json"
  | "option_json"
  | "subtitle";
