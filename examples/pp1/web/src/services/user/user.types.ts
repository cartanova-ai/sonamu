import { z } from "zod";
import { zArrayable } from "src/services/sonamu.shared";
import {
  UserRole,
  UserStatus,
  UserBaseListParams,
  UserBaseSchema,
} from "../sonamu.generated";

export const UserListParams = UserBaseListParams.extend({
  role: UserRole.optional(),
  status: zArrayable(UserStatus).optional(),
});
export type UserListParams = z.infer<typeof UserListParams>;

export const UserLoginParams = UserBaseSchema.pick({
  string_id: true,
  pw: true,
});
export type UserLoginParams = z.infer<typeof UserLoginParams>;

export const UserJoinParams = UserBaseSchema.pick({
  string_id: true,
  pw: true,
  name: true,
  birthyear: true,
});
export type UserJoinParams = z.infer<typeof UserJoinParams>;
