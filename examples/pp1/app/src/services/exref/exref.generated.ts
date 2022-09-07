import { z } from "zod";
import { SubsetQuery, zArrayable } from "../../typeframe/shared";
import { ExrefSearchField, ExrefOrderBy } from "./exref.enums";

export const ExrefBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  title: z.string().max(64),
  fee: z.number().int().nonnegative(),
  fee_text: z.string().max(1024),
  req_date_text: z.string().max(1024),
  restrict_text: z.string().max(1024),
  created_at: z.string(),
});
export type ExrefBaseSchema = z.infer<typeof ExrefBaseSchema>;
export const ExrefBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: ExrefSearchField,
    keyword: z.string(),
    orderBy: ExrefOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
  })
  .partial();
export type ExrefBaseListParams = z.infer<typeof ExrefBaseListParams>;

export const ExrefSubsetA = z.object({
  id: z.number().int().nonnegative(),
  title: z.string().max(64),
  fee: z.number().int().nonnegative(),
  fee_text: z.string().max(1024),
  req_date_text: z.string().max(1024),
  restrict_text: z.string().max(1024),
  created_at: z.string(),
});
export type ExrefSubsetA = z.infer<typeof ExrefSubsetA>;

export type ExrefSubsetMapping = {
  A: ExrefSubsetA;
};
export const ExrefSubsetKey = z.enum(["A"]);
export type ExrefSubsetKey = z.infer<typeof ExrefSubsetKey>;

export const exrefSubsetQueries: { [key in ExrefSubsetKey]: SubsetQuery } = {
  A: {
    select: [
      "exrefs.id",
      "exrefs.title",
      "exrefs.fee",
      "exrefs.fee_text",
      "exrefs.req_date_text",
      "exrefs.restrict_text",
      "exrefs.created_at",
    ],
    virtual: [],
    joins: [],
    loaders: [],
  },
};
export type ExrefFieldExpr =
  | "id"
  | "title"
  | "fee"
  | "fee_text"
  | "req_date_text"
  | "restrict_text"
  | "created_at";
