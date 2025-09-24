import { z } from "zod";
import { ProjectBaseSchema, ProjectBaseListParams } from "../sonamu.generated";

// Project - ListParams
export const ProjectListParams = ProjectBaseListParams;
export type ProjectListParams = z.infer<typeof ProjectListParams>;

// Project - SaveParams
export const ProjectSaveParams = ProjectBaseSchema.partial({
  id: true,
  created_at: true,
}).extend({
  employee_ids: z.array(z.number().int().positive()),
});
export type ProjectSaveParams = z.infer<typeof ProjectSaveParams>;
