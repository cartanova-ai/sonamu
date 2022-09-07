import { z } from "zod";
import { SubsetQuery, zArrayable } from "../../typeframe/shared";
import {
  UserKeywordSearchField,
  UserKeywordOrderBy,
} from "./user-keyword.enums";

export const UserKeywordBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  user_key: z.string().max(128),
  type: z.number().int(),
  keyword: z.string().max(128),
  result_count: z.number().int(),
  created_at: z.string(),
});
export type UserKeywordBaseSchema = z.infer<typeof UserKeywordBaseSchema>;
export const UserKeywordBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: UserKeywordSearchField,
    keyword: z.string(),
    orderBy: UserKeywordOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
  })
  .partial();
export type UserKeywordBaseListParams = z.infer<
  typeof UserKeywordBaseListParams
>;

export const UserKeywordSubsetA = z.object({
  id: z.number().int().nonnegative(),
  user_key: z.string().max(128),
  type: z.number().int(),
  keyword: z.string().max(128),
  result_count: z.number().int(),
  created_at: z.string(),
});
export type UserKeywordSubsetA = z.infer<typeof UserKeywordSubsetA>;

export const UserKeywordSubsetP = z.object({
  id: z.number().int().nonnegative(),
  user_key: z.string().max(128),
  type: z.number().int(),
  keyword: z.string().max(128),
  result_count: z.number().int(),
  created_at: z.string(),
});
export type UserKeywordSubsetP = z.infer<typeof UserKeywordSubsetP>;

export type UserKeywordSubsetMapping = {
  A: UserKeywordSubsetA;
  P: UserKeywordSubsetP;
};
export const UserKeywordSubsetKey = z.enum(["A", "P"]);
export type UserKeywordSubsetKey = z.infer<typeof UserKeywordSubsetKey>;

export const userKeywordSubsetQueries: {
  [key in UserKeywordSubsetKey]: SubsetQuery;
} = {
  A: {
    select: [
      "user_keywords.id",
      "user_keywords.user_key",
      "user_keywords.type",
      "user_keywords.keyword",
      "user_keywords.result_count",
      "user_keywords.created_at",
    ],
    virtual: [],
    joins: [],
    loaders: [],
  },
  P: {
    select: [
      "user_keywords.id",
      "user_keywords.user_key",
      "user_keywords.type",
      "user_keywords.keyword",
      "user_keywords.result_count",
      "user_keywords.created_at",
    ],
    virtual: [],
    joins: [],
    loaders: [],
  },
};
export type UserKeywordFieldExpr =
  | "id"
  | "user_key"
  | "type"
  | "keyword"
  | "result_count"
  | "created_at";
