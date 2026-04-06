/**
 * @generated
 * API에서 동기화된 파일입니다. 직접 수정하지 마세요.
 */
import  { type z } from "zod";

import { EmployeeBaseListParams, EmployeeBaseSchema } from "../sonamu.generated";

// Employee - ListParams
export const EmployeeListParams = EmployeeBaseListParams;
export type EmployeeListParams = z.infer<typeof EmployeeListParams>;

// Employee - SaveParams
export const EmployeeSaveParams = EmployeeBaseSchema.partial({
  id: true,
  created_at: true,
});
export type EmployeeSaveParams = z.infer<typeof EmployeeSaveParams>;
