import { z } from "zod";
import { zArrayable, SQLDateTimeString } from "../sonamu.shared";
import { TagSearchField, TagOrderBy } from "./tag.enums";

export const TagBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().max(64),
  created_at: SQLDateTimeString,
});
export type TagBaseSchema = z.infer<typeof TagBaseSchema>;
export const TagBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: TagSearchField,
    keyword: z.string(),
    orderBy: TagOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
  })
  .partial();
export type TagBaseListParams = z.infer<typeof TagBaseListParams>;

export const TagSubsetA = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().max(64),
  created_at: SQLDateTimeString,
});
export type TagSubsetA = z.infer<typeof TagSubsetA>;

export type TagSubsetMapping = {
  A: TagSubsetA;
};
export const TagSubsetKey = z.enum(["A"]);
export type TagSubsetKey = z.infer<typeof TagSubsetKey>;

