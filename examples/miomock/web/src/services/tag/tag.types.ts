import type { z } from "zod";
import { TagBaseListParams, TagBaseSchema } from "../sonamu.generated";

// Tag - ListParams
export const TagListParams = TagBaseListParams;
export type TagListParams = z.infer<typeof TagListParams>;

// Tag - SaveParams
export const TagSaveParams = TagBaseSchema.partial({
  id: true,
  created_at: true,
});
export type TagSaveParams = z.infer<typeof TagSaveParams>;
