import { z } from "zod";
import { zArrayable } from "@sonamu/core";
import { PostType } from "./post.enums";
import { PostBaseListParams, PostBaseSchema } from "./post.generated";

export const PostListParams = PostBaseListParams.extend({
  type: zArrayable(PostType).optional(),
});
export type PostListParams = z.infer<typeof PostListParams>;

export const PostSaveParams = PostBaseSchema.partial({
  id: true,
  created_at: true,
}).omit({
  next_post: true,
  author_id: true,
});
export type PostSaveParams = z.infer<typeof PostSaveParams>;
