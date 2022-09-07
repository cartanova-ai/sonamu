import { z } from "zod";
import { SubsetQuery, zArrayable } from "../../typeframe/shared";
import {
  AppconfType,
  AppconfSearchField,
  AppconfOrderBy,
} from "./appconf.enums";

export const AppconfBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  type: AppconfType,
  key: z.string().max(64),
  desc: z.string().max(256),
  content: z.string(),
  created_at: z.string(),
  admin_history: z.string(),
});
export type AppconfBaseSchema = z.infer<typeof AppconfBaseSchema>;
export const AppconfBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: AppconfSearchField,
    keyword: z.string(),
    orderBy: AppconfOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
    type: AppconfType,
  })
  .partial();
export type AppconfBaseListParams = z.infer<typeof AppconfBaseListParams>;

export const AppconfSubsetA = z.object({
  id: z.number().int().nonnegative(),
  type: AppconfType,
  key: z.string().max(64),
  desc: z.string().max(256),
  content: z.string(),
  created_at: z.string(),
  admin_history: z.string(),
});
export type AppconfSubsetA = z.infer<typeof AppconfSubsetA>;

export const AppconfSubsetP = z.object({
  id: z.number().int().nonnegative(),
  type: AppconfType,
  key: z.string().max(64),
  desc: z.string().max(256),
  content: z.string(),
});
export type AppconfSubsetP = z.infer<typeof AppconfSubsetP>;

export type AppconfSubsetMapping = {
  A: AppconfSubsetA;
  P: AppconfSubsetP;
};
export const AppconfSubsetKey = z.enum(["A", "P"]);
export type AppconfSubsetKey = z.infer<typeof AppconfSubsetKey>;

export const appconfSubsetQueries: { [key in AppconfSubsetKey]: SubsetQuery } =
  {
    A: {
      select: [
        "appconfs.id",
        "appconfs.type",
        "appconfs.key",
        "appconfs.desc",
        "appconfs.content",
        "appconfs.created_at",
        "appconfs.admin_history",
      ],
      virtual: [],
      joins: [],
      loaders: [],
    },
    P: {
      select: [
        "appconfs.id",
        "appconfs.type",
        "appconfs.key",
        "appconfs.desc",
        "appconfs.content",
      ],
      virtual: [],
      joins: [],
      loaders: [],
    },
  };
export type AppconfFieldExpr =
  | "id"
  | "type"
  | "key"
  | "desc"
  | "content"
  | "created_at"
  | "admin_history";
