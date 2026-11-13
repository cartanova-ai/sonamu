/**
 * @generated
 * API에서 동기화된 파일입니다. 직접 수정하지 마세요.
 */

import { z } from "zod";

import { ProjectBaseListParams, ProjectBaseSchema, ProjectStatus } from "../sonamu.generated";

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
    virtual_query_test: true,
    textsearchable_index_col: true,
  });
export type ProjectSaveParams = z.infer<typeof ProjectSaveParams>;

// Project - IndexedSearch
/** Highlight fragments are not HTML-escaped: split them on these markers and render text, never HTML. */
export const PROJECT_SEARCH_HIGHLIGHT_START = "\uE000";
export const PROJECT_SEARCH_HIGHLIGHT_END = "\uE001";

export const ProjectIndexedSearchParams = z.object({
  q: z.string().trim().min(1).max(200),
  size: z.number().int().min(1).max(50).optional(),
  // Valid only with the same q that produced it.
  cursor: z.string().min(1).max(4096).optional(),
});
export type ProjectIndexedSearchParams = z.infer<typeof ProjectIndexedSearchParams>;

export const ProjectIndexedSearchHit = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  status: ProjectStatus,
  // Empty when the indexed text differs from the current text.
  highlights: z.object({
    name: z.array(z.string()),
    description: z.array(z.string()),
  }),
});
export type ProjectIndexedSearchHit = z.infer<typeof ProjectIndexedSearchHit>;

export const ProjectIndexedSearchResult = z.object({
  rows: z.array(ProjectIndexedSearchHit),
  nextCursor: z.string().nullable(),
});
export type ProjectIndexedSearchResult = z.infer<typeof ProjectIndexedSearchResult>;

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
