/**
 * @generated
 * 이 파일은 API 산출물을 대상(Web/App)용으로 동기화한 파일입니다.
 * 직접 수정하지 마세요. API 측 원본을 수정하면 자동으로 반영됩니다.
 * (sonamu → sonamu.shared import 치환이 적용되어 있습니다)
 */
import { z } from "zod";
import { UserBaseListParams, UserBaseSchema } from "../sonamu.generated";

// User - ListParams
export const UserListParams = UserBaseListParams.extend({
  test: z.string().optional(),
});
export type UserListParams = z.infer<typeof UserListParams>;

// User - SaveParams
export const UserSaveParams = UserBaseSchema.partial({
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
