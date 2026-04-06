import type { z } from "zod";

import { TwoFactorBaseListParams, TwoFactorBaseSchema } from "../sonamu.generated";

// TwoFactor - ListParams
export const TwoFactorListParams = TwoFactorBaseListParams;
export type TwoFactorListParams = z.infer<typeof TwoFactorListParams>;

// TwoFactor - SaveParams
export const TwoFactorSaveParams = TwoFactorBaseSchema.partial({ id: true, created_at: true });
export type TwoFactorSaveParams = z.infer<typeof TwoFactorSaveParams>;
