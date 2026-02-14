/**
 * @generated
 * API에서 동기화된 파일입니다. 직접 수정하지 마세요.
 */
import type { z } from "zod";
import { CompanyBaseListParams, CompanyBaseSchema } from "../sonamu.generated";

// Company - ListParams
export const CompanyListParams = CompanyBaseListParams;
export type CompanyListParams = z.infer<typeof CompanyListParams>;

// Company - SaveParams
export const CompanySaveParams = CompanyBaseSchema.partial({
  id: true,
  created_at: true,
});
export type CompanySaveParams = z.infer<typeof CompanySaveParams>;
