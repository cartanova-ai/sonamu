/**
 * @generated
 * API에서 동기화된 파일입니다. 직접 수정하지 마세요.
 */
import { z } from "zod";

import { UserBaseListParams, UserBaseSchema } from "../sonamu.generated";

// User - ListParams
export const UserListParams = UserBaseListParams.extend({
  test: z.string().optional(),
});
export type UserListParams = z.infer<typeof UserListParams>;

// User - SaveParams
// ban 관련 필드(banned/ban_reason/ban_expires)는 admin 플러그인 전용이므로 일반 save 페이로드에서 제외합니다.
export const UserSaveParams = UserBaseSchema.omit({
  banned: true,
  ban_reason: true,
  ban_expires: true,
}).partial({
  id: true,
  created_at: true,
  birth_date: true,
  last_login_at: true,
  bio: true,
  is_verified: true,
  deleted_at: true,
  password: true,
  image: true,
  updated_at: true,
  two_factor_enabled: true,
});

export type UserSaveParams = z.infer<typeof UserSaveParams>;

// User - LoginParams
export const UserLoginParams = z.object({
  email: z.string().email(),
  password: z.string(),
});
export type UserLoginParams = z.infer<typeof UserLoginParams>;

// User - RegisterParams
export const UserRegisterParams = z.object({
  email: z.string().email(),
  username: z.string(),
  password: z.string().min(6),
  role: z.enum(["normal", "admin"]).default("normal"),
});
export type UserRegisterParams = z.infer<typeof UserRegisterParams>;

// User - SearchParams
export const UserSearchParams = z.object({
  keyword: z.string(),
});
export type UserSearchParams = z.infer<typeof UserSearchParams>;
