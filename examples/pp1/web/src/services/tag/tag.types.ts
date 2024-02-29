import { z } from "zod";
import { TagBaseSchema, TagBaseListParams } from "../sonamu.generated";

// Tag - ListParams
export const TagListParams = TagBaseListParams;
export type TagListParams = z.infer<typeof TagListParams>;

// Tag - SaveParams
export const TagSaveParams = TagBaseSchema.partial({ id: true }).omit({
  created_at: true,
});
export type TagSaveParams = z.infer<typeof TagSaveParams>;
