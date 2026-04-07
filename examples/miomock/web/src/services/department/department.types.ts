/**
 * @generated
 * API에서 동기화된 파일입니다. 직접 수정하지 마세요.
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
