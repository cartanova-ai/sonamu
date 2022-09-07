import { z } from "zod";
import { SubsetQuery, zArrayable } from "../../typeframe/shared";
import { LogiSearchField, LogiOrderBy } from "./logi.enums";

export const LogiBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  title: z.string().max(64),
  method: z.string().max(256),
  logicompany_id: z.number().int(),
  base_fee: z.number().int().nonnegative(),
  added_fee: z.number().int().nonnegative(),
  free_price: z.number().int().nonnegative(),
  est_days: z.string().max(512),
  created_at: z.string(),
});
export type LogiBaseSchema = z.infer<typeof LogiBaseSchema>;
export const LogiBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: LogiSearchField,
    keyword: z.string(),
    orderBy: LogiOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
  })
  .partial();
export type LogiBaseListParams = z.infer<typeof LogiBaseListParams>;

export const LogiSubsetA = z.object({
  id: z.number().int().nonnegative(),
  title: z.string().max(64),
  method: z.string().max(256),
  base_fee: z.number().int().nonnegative(),
  added_fee: z.number().int().nonnegative(),
  free_price: z.number().int().nonnegative(),
  est_days: z.string().max(512),
  created_at: z.string(),
  logicompany: z.object({
    id: z.number().int().nonnegative(),
    name: z.string().max(64),
    st_code: z.string().max(4),
  }),
});
export type LogiSubsetA = z.infer<typeof LogiSubsetA>;

export type LogiSubsetMapping = {
  A: LogiSubsetA;
};
export const LogiSubsetKey = z.enum(["A"]);
export type LogiSubsetKey = z.infer<typeof LogiSubsetKey>;

export const logiSubsetQueries: { [key in LogiSubsetKey]: SubsetQuery } = {
  A: {
    select: [
      "logis.id",
      "logis.title",
      "logis.method",
      "logis.base_fee",
      "logis.added_fee",
      "logis.free_price",
      "logis.est_days",
      "logis.created_at",
      "logicompany.id as logicompany__id",
      "logicompany.name as logicompany__name",
      "logicompany.st_code as logicompany__st_code",
    ],
    virtual: [],
    joins: [
      {
        as: "logicompany",
        join: "outer",
        table: "logicompanies",
        from: "logis.logicompany_id",
        to: "logicompany.id",
      },
    ],
    loaders: [],
  },
};
export type LogiFieldExpr =
  | "id"
  | "title"
  | "method"
  | "logicompany.id"
  | "logicompany.name"
  | "logicompany.st_code"
  | "base_fee"
  | "added_fee"
  | "free_price"
  | "est_days"
  | "created_at";
