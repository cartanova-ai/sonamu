/**
 * @generated
 * API에서 동기화된 파일입니다. 직접 수정하지 마세요.
 */

import { type z } from "zod";

import { TagBaseListParams, TagBaseSchema } from "../sonamu.generated";

// Tag - ListParams
export const TagListParams = TagBaseListParams;
export type TagListParams = z.infer<typeof TagListParams>;

// Tag - SaveParams
export const TagSaveParams = TagBaseSchema.partial({
  id: true,
  created_at: true,
  name_ko: true,
  name_en: true,
});
export type TagSaveParams = z.infer<typeof TagSaveParams>;
