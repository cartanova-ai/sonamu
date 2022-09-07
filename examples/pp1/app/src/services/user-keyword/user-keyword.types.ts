import { z } from "zod";
import {
  UserKeywordBaseSchema,
  UserKeywordBaseListParams,
} from "./user-keyword.generated";

// UserKeyword - ListParams
export const UserKeywordListParams = UserKeywordBaseListParams.pick({
  num: true,
  page: true,
});
export type UserKeywordListParams = z.infer<typeof UserKeywordListParams>;

// UserKeyword - SaveParams
export const UserKeywordSaveParams = UserKeywordBaseSchema.partial({
  id: true,
});
export type UserKeywordSaveParams = z.infer<typeof UserKeywordSaveParams>;
