/**
 * @generated
 * API에서 동기화된 파일입니다. 직접 수정하지 마세요.
 */

import { type z } from "zod";

import { AccountBaseListParams, AccountBaseSchema } from "../sonamu.generated";

// Account - ListParams
export const AccountListParams = AccountBaseListParams;
export type AccountListParams = z.infer<typeof AccountListParams>;

// Account - SaveParams
export const AccountSaveParams = AccountBaseSchema.partial({ id: true, created_at: true });
export type AccountSaveParams = z.infer<typeof AccountSaveParams>;
