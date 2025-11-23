import { z } from "zod";
import { ProjectBaseListParams, ProjectBaseSchema } from "../sonamu.generated";

// Project - ListParams
export const ProjectListParams = ProjectBaseListParams;
export type ProjectListParams = z.infer<typeof ProjectListParams>;

// Project - SaveParams
export const ProjectSaveParams = ProjectBaseSchema.partial({
  id: true,
  created_at: true,
})
  .extend({
    employee_ids: z.array(z.number().int().positive()),
    tag_ids: z.array(z.number().int().positive()),
  })
  .omit({
    virtual_test: true,
  });
export type ProjectSaveParams = z.infer<typeof ProjectSaveParams>;

export const StringArray = z.array(z.string());
export type StringArray = z.infer<typeof StringArray>;

export const Boolean = z.boolean();
export type Boolean = z.infer<typeof Boolean>;
