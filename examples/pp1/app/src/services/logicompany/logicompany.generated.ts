import { z } from "zod";
import { SubsetQuery, zArrayable } from "../../typeframe/shared";
import {
  LogicompanySearchField,
  LogicompanyOrderBy,
} from "./logicompany.enums";

export const LogicompanyBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().max(64),
  st_code: z.string().max(4),
});
export type LogicompanyBaseSchema = z.infer<typeof LogicompanyBaseSchema>;
export const LogicompanyBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: LogicompanySearchField,
    keyword: z.string(),
    orderBy: LogicompanyOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
  })
  .partial();
export type LogicompanyBaseListParams = z.infer<
  typeof LogicompanyBaseListParams
>;

export const LogicompanySubsetA = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().max(64),
  st_code: z.string().max(4),
});
export type LogicompanySubsetA = z.infer<typeof LogicompanySubsetA>;

export type LogicompanySubsetMapping = {
  A: LogicompanySubsetA;
};
export const LogicompanySubsetKey = z.enum(["A"]);
export type LogicompanySubsetKey = z.infer<typeof LogicompanySubsetKey>;

export const logicompanySubsetQueries: {
  [key in LogicompanySubsetKey]: SubsetQuery;
} = {
  A: {
    select: ["logicompanies.id", "logicompanies.name", "logicompanies.st_code"],
    virtual: [],
    joins: [],
    loaders: [],
  },
};
export type LogicompanyFieldExpr = "id" | "name" | "st_code";
