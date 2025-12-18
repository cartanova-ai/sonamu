import { z } from "zod";
import { DocumentBaseListParams, DocumentBaseSchema } from "../sonamu.generated";

// Document - ListParams
export const DocumentListParams = DocumentBaseListParams.extend({
  semanticQuery: z
    .object({
      embedding: z.array(z.number()).min(1024).max(1024),
      threshold: z.number().optional(),
      method: z.enum(["cosine", "l2", "inner_product"]).optional(),
      which: z.enum(["title", "content"]).optional(),
    })
    .optional(),
});
export type DocumentListParams = z.infer<typeof DocumentListParams>;

// Document - SaveParams
export const DocumentSaveParams = DocumentBaseSchema.partial({
  id: true,
  created_at: true,
  title_content_embedding: true,
});
export type DocumentSaveParams = z.infer<typeof DocumentSaveParams>;

// Document - SaveEmbeddingParams
export const DocumentSaveEmbeddingParams = DocumentBaseSchema.pick({
  id: true,
  title_content_embedding: true,
});
export type DocumentSaveEmbeddingParams = z.infer<typeof DocumentSaveEmbeddingParams>;
