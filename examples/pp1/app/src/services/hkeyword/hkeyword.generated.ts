import { z } from "zod";
import { SubsetQuery, zArrayable } from "../../typeframe/shared";
import {
  HkeywordIsFixed,
  HkeywordStatus,
  HkeywordSearchField,
  HkeywordOrderBy,
} from "./hkeyword.enums";

export const HkeywordBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  title: z.string().max(64),
  cnt: z.number().int().nonnegative(),
  cnt_100: z.number().int(),
  cnt_200: z.number().int(),
  is_fixed: HkeywordIsFixed,
  status: HkeywordStatus,
  created_at: z.string(),
  updated_at: z.string(),
});
export type HkeywordBaseSchema = z.infer<typeof HkeywordBaseSchema>;
export const HkeywordBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: HkeywordSearchField,
    keyword: z.string(),
    orderBy: HkeywordOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
    is_fixed: HkeywordIsFixed,
    status: HkeywordStatus,
  })
  .partial();
export type HkeywordBaseListParams = z.infer<typeof HkeywordBaseListParams>;

export const HkeywordSubsetA = z.object({
  id: z.number().int().nonnegative(),
  title: z.string().max(64),
  cnt: z.number().int().nonnegative(),
  cnt_100: z.number().int(),
  cnt_200: z.number().int(),
  is_fixed: HkeywordIsFixed,
  status: HkeywordStatus,
  created_at: z.string(),
  updated_at: z.string(),
});
export type HkeywordSubsetA = z.infer<typeof HkeywordSubsetA>;

export const HkeywordSubsetP = z.object({
  id: z.number().int().nonnegative(),
  title: z.string().max(64),
  cnt: z.number().int().nonnegative(),
  cnt_100: z.number().int(),
  cnt_200: z.number().int(),
});
export type HkeywordSubsetP = z.infer<typeof HkeywordSubsetP>;

export type HkeywordSubsetMapping = {
  A: HkeywordSubsetA;
  P: HkeywordSubsetP;
};
export const HkeywordSubsetKey = z.enum(["A", "P"]);
export type HkeywordSubsetKey = z.infer<typeof HkeywordSubsetKey>;

export const hkeywordSubsetQueries: {
  [key in HkeywordSubsetKey]: SubsetQuery;
} = {
  A: {
    select: [
      "hkeywords.id",
      "hkeywords.title",
      "hkeywords.cnt",
      "hkeywords.cnt_100",
      "hkeywords.cnt_200",
      "hkeywords.is_fixed",
      "hkeywords.status",
      "hkeywords.created_at",
      "hkeywords.updated_at",
    ],
    virtual: [],
    joins: [],
    loaders: [],
  },
  P: {
    select: [
      "hkeywords.id",
      "hkeywords.title",
      "hkeywords.cnt",
      "hkeywords.cnt_100",
      "hkeywords.cnt_200",
    ],
    virtual: [],
    joins: [],
    loaders: [],
  },
};
export type HkeywordFieldExpr =
  | "id"
  | "title"
  | "cnt"
  | "cnt_100"
  | "cnt_200"
  | "is_fixed"
  | "status"
  | "created_at"
  | "updated_at";
