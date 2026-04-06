/**
 * @generated
 * API에서 동기화된 파일입니다. 직접 수정하지 마세요.
 */
import  { type z } from "zod";

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
