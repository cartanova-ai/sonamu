import type { z } from "zod";
import { AccountBaseListParams, AccountBaseSchema } from "../sonamu.generated";

// Account - ListParams
export const AccountListParams = AccountBaseListParams;
export type AccountListParams = z.infer<typeof AccountListParams>;

// Account - SaveParams
export const AccountSaveParams = AccountBaseSchema.partial({ id: true, created_at: true });
export type AccountSaveParams = z.infer<typeof AccountSaveParams>;
