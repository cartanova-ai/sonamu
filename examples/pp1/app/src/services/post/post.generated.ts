import { z } from "zod";
import { zArrayable, SQLDateTimeString } from "../sonamu.shared";
import {
  PostType,
  PostStatus,
  PostSearchField,
  PostOrderBy,
} from "./post.enums";

export const PostBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  type: PostType,
  title: z.string().max(256).nullable(),
  content: z.string().max(65535),
  author_id: z.number().int(),
  status: PostStatus,
  rating: z.string().nullable(),
  next_post: z.object({
    a: z.string(),
    b: z.number(),
    c: z.date(),
  }),
  images: z.array(z.string()),
  source_url: z.string().max(512).nullable(),
  is_public: z.boolean(),
  created_at: SQLDateTimeString,
});
export type PostBaseSchema = z.infer<typeof PostBaseSchema>;
export const PostBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: PostSearchField,
    keyword: z.string(),
    orderBy: PostOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
    type: PostType,
    status: PostStatus,
  })
  .partial();
export type PostBaseListParams = z.infer<typeof PostBaseListParams>;

export const PostSubsetA = z.object({
  id: z.number().int().nonnegative(),
  type: PostType,
  title: z.string().max(256).nullable(),
  content: z.string().max(65535),
  rating: z.string().nullable(),
  status: PostStatus,
  next_post: z.object({
    a: z.string(),
    b: z.number(),
    c: z.date(),
  }),
  images: z.array(z.string()),
  source_url: z.string().max(512).nullable(),
  is_public: z.boolean(),
  created_at: SQLDateTimeString,
  author: z.object({
    id: z.number().int().nonnegative(),
    name: z.string().max(64),
  }),
});
export type PostSubsetA = z.infer<typeof PostSubsetA>;

export const PostSubsetD = z.object({
  id: z.number().int().nonnegative(),
  type: PostType,
  title: z.string().max(256).nullable(),
  content: z.string().max(65535),
  created_at: SQLDateTimeString,
  author_id: z.number().int().nonnegative(),
});
export type PostSubsetD = z.infer<typeof PostSubsetD>;

export type PostSubsetMapping = {
  A: PostSubsetA;
  D: PostSubsetD;
};
export const PostSubsetKey = z.enum(["A", "D"]);
export type PostSubsetKey = z.infer<typeof PostSubsetKey>;

