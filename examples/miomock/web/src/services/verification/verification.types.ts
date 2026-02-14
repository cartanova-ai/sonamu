/**
 * @generated
 * 이 파일은 API 산출물을 대상(Web/App)용으로 동기화한 파일입니다.
 * 직접 수정하지 마세요. API 측 원본을 수정하면 자동으로 반영됩니다.
 * (sonamu → sonamu.shared import 치환이 적용되어 있습니다)
 */
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
