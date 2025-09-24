import { z } from "zod";
import {
  EmployeeBaseSchema,
  EmployeeBaseListParams,
} from "../sonamu.generated";

// Employee - ListParams
export const EmployeeListParams = EmployeeBaseListParams;
export type EmployeeListParams = z.infer<typeof EmployeeListParams>;

// Employee - SaveParams
export const EmployeeSaveParams = EmployeeBaseSchema.partial({
  id: true,
  created_at: true,
});
export type EmployeeSaveParams = z.infer<typeof EmployeeSaveParams>;
