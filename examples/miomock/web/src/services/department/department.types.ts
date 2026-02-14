/**
 * @generated
 * 이 파일은 API 산출물을 대상(Web/App)용으로 동기화한 파일입니다.
 * 직접 수정하지 마세요. API 측 원본을 수정하면 자동으로 반영됩니다.
 * (sonamu → sonamu.shared import 치환이 적용되어 있습니다)
 */
import { z } from "zod";
import { DepartmentBaseListParams, DepartmentBaseSchema } from "../sonamu.generated";

// Department - ListParams
export const DepartmentListParams = DepartmentBaseListParams.extend({
  company_name: z.string().optional(),
});
export type DepartmentListParams = z.infer<typeof DepartmentListParams>;

// Department - SaveParams
export const DepartmentSaveParams = DepartmentBaseSchema.partial({
  id: true,
  created_at: true,
}).omit({
  employee_count: true,
  code: true,
});
export type DepartmentSaveParams = z.infer<typeof DepartmentSaveParams>;

export const NumberType = z.number();
export type NumberType = z.infer<typeof NumberType>;
