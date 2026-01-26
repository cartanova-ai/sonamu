import { z } from "zod";
import { ProjectBaseListParams, ProjectBaseSchema } from "../sonamu.generated";

// Project - ListParams
export const ProjectListParams = ProjectBaseListParams;
export type ProjectListParams = ProjectBaseListParams;

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
    virtual_query_test: true,
    textsearchable_index_col: true,
  });
export type ProjectSaveParams = z.infer<typeof ProjectSaveParams>;

export const StringArray = z.array(z.string());
export type StringArray = z.infer<typeof StringArray>;

export const StringType = z.string();
export type StringType = z.infer<typeof StringType>;

// Sample SSE Events
export const ProjectAskStreamEvents = z.object({
  onToken: z.object({
    token: z.string(),
  }),
  onComplete: z.object({
    fullText: z.string(),
  }),
  onError: z.object({
    error: z.object({
      name: z.string(),
      message: z.string(),
      cause: z.any().optional(),
      stack: z.string().optional(),
    }),
  }),
});
export type ProjectAskStreamEvents = z.infer<typeof ProjectAskStreamEvents>;
