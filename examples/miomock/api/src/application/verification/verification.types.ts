import type { z } from "zod";

import { VerificationBaseListParams, VerificationBaseSchema } from "../sonamu.generated";

// Verification - ListParams
export const VerificationListParams = VerificationBaseListParams;
export type VerificationListParams = z.infer<typeof VerificationListParams>;

// Verification - SaveParams
export const VerificationSaveParams = VerificationBaseSchema.partial({
  id: true,
  created_at: true,
});
export type VerificationSaveParams = z.infer<typeof VerificationSaveParams>;
