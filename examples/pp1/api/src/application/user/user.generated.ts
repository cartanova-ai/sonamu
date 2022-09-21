import { z } from "zod";
import { zArrayable, SQLDateTimeString } from "sonamu";
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

/* BEGIN- Server-side Only */
import { SubsetQuery } from "sonamu";
export const userSubsetQueries: { [key in UserSubsetKey]: SubsetQuery } = {
  A: {
    select: [
      "users.id",
      "users.role",
      "users.string_id",
      "users.pw",
      "users.name",
      "users.birthyear",
      "users.status",
      "users.created_at",
    ],
    virtual: [],
    joins: [],
    loaders: [
      {
        as: "posts",
        table: "posts",
        manyJoin: {
          fromTable: "users",
          fromCol: "id",
          idField: "id",
          toTable: "posts",
          toCol: "author_id",
        },
        oneJoins: [],
        select: ["posts.id", "posts.title"],
        loaders: [],
      },
    ],
  },
  D: {
    select: [
      "users.id",
      "users.role",
      "users.string_id",
      "users.name",
      "users.birthyear",
      "users.status",
      "users.created_at",
    ],
    virtual: [],
    joins: [],
    loaders: [],
  },
  SS: {
    select: [
      "users.id",
      "users.role",
      "users.string_id",
      "users.name",
      "users.birthyear",
      "users.status",
      "users.created_at",
    ],
    virtual: [],
    joins: [],
    loaders: [],
  },
};

export type UserFieldExpr =
  | "id"
  | "role"
  | "string_id"
  | "pw"
  | "name"
  | "birthyear"
  | "status"
  | "created_at"
  | "posts.id"
  | "posts.type"
  | "posts.title"
  | "posts.content"
  | "posts.status"
  | "posts.rating"
  | "posts.next_post"
  | "posts.images"
  | "posts.source_url"
  | "posts.is_public"
  | "posts.created_at";
/* END Server-side Only */
