import { SonamuSemanticParams } from "sonamu";
import { z } from "zod";

import { DocumentBaseListParams, DocumentBaseSchema } from "../sonamu.generated";

// Document - SemanticParams
export const DocumentSemanticParams = DocumentBaseListParams.merge(SonamuSemanticParams).extend({
  which: z.enum(["title", "content"]),
});
export type DocumentSemanticParams = z.infer<typeof DocumentSemanticParams>;

// Document - ListParams
export const DocumentListParams = DocumentSemanticParams.partial();
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
