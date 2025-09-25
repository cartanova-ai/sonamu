import { z } from "zod";
import { UserBaseSchema, UserBaseListParams } from "../sonamu.generated";

// User - ListParams
export const UserListParams = UserBaseListParams;
export type UserListParams = z.infer<typeof UserListParams>;

// User - SaveParams
export const UserSaveParams = UserBaseSchema.partial({
  id: true,
  created_at: true,
});
export type UserSaveParams = z.infer<typeof UserSaveParams>;
