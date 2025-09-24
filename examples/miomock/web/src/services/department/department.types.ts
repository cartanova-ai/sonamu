import { z } from "zod";
import {
  DepartmentBaseSchema,
  DepartmentBaseListParams,
} from "../sonamu.generated";

// Department - ListParams
export const DepartmentListParams = DepartmentBaseListParams;
export type DepartmentListParams = z.infer<typeof DepartmentListParams>;

// Department - SaveParams
export const DepartmentSaveParams = DepartmentBaseSchema.partial({
  id: true,
  created_at: true,
}).omit({
  employee_count: true,
});
export type DepartmentSaveParams = z.infer<typeof DepartmentSaveParams>;

export const Number = z.number();
export type Number = z.infer<typeof Number>;
