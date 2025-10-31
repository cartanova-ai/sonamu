import { z } from "zod";
import { zArrayable } from "src/services/sonamu.shared";
import {
  PostType,
  PostBaseListParams,
  PostBaseSchema,
} from "../sonamu.generated";

export const PostListParams = PostBaseListParams.extend({
  type: zArrayable(PostType).optional(),
});
export type PostListParams = z.infer<typeof PostListParams>;

export const PostSaveParams = PostBaseSchema.partial({
  id: true,
  created_at: true,
}).omit({
  author_id: true,
});
export type PostSaveParams = z.infer<typeof PostSaveParams>;

export const StringArray = z.string().array();
export type StringArray = z.infer<typeof StringArray>;
