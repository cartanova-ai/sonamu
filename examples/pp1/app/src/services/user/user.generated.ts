import { z } from "zod";
import { zArrayable, SQLDateTimeString } from "../sonamu.shared";
import {
  UserRole,
  UserStatus,
  UserSearchField,
  UserOrderBy,
} from "./user.enums";

export const UserBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  role: UserRole,
  string_id: z.string().max(128),
  pw: z.string().max(256),
  name: z.string().max(64),
  birthyear: z.number().int().nonnegative(),
  status: UserStatus,
  created_at: SQLDateTimeString,
  // posts: HasMany Post
});
export type UserBaseSchema = z.infer<typeof UserBaseSchema>;
export const UserBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: UserSearchField,
    keyword: z.string(),
    orderBy: UserOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
  })
  .partial();
export type UserBaseListParams = z.infer<typeof UserBaseListParams>;

export const UserSubsetA = z.object({
  id: z.number().int().nonnegative(),
  role: UserRole,
  string_id: z.string().max(128),
  pw: z.string().max(256),
  name: z.string().max(64),
  birthyear: z.number().int().nonnegative(),
  status: UserStatus,
  created_at: SQLDateTimeString,
  posts: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      title: z.string().max(256).nullable(),
    })
  ),
});
export type UserSubsetA = z.infer<typeof UserSubsetA>;

export const UserSubsetD = z.object({
  id: z.number().int().nonnegative(),
  role: UserRole,
  string_id: z.string().max(128),
  name: z.string().max(64),
  birthyear: z.number().int().nonnegative(),
  status: UserStatus,
  created_at: SQLDateTimeString,
});
export type UserSubsetD = z.infer<typeof UserSubsetD>;

export const UserSubsetSS = z.object({
  id: z.number().int().nonnegative(),
  role: UserRole,
  string_id: z.string().max(128),
  name: z.string().max(64),
  birthyear: z.number().int().nonnegative(),
  status: UserStatus,
  created_at: SQLDateTimeString,
});
export type UserSubsetSS = z.infer<typeof UserSubsetSS>;

export type UserSubsetMapping = {
  A: UserSubsetA;
  D: UserSubsetD;
  SS: UserSubsetSS;
};
export const UserSubsetKey = z.enum(["A", "D", "SS"]);
export type UserSubsetKey = z.infer<typeof UserSubsetKey>;

