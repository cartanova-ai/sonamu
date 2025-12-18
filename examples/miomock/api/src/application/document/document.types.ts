import { SonamuSemanticParams } from "sonamu";
import type { z } from "zod";
import { DocumentBaseListParams, DocumentBaseSchema } from "../sonamu.generated";

// Document - ListParams
export const DocumentListParams = DocumentBaseListParams.extend(SonamuSemanticParams.shape);
export type DocumentListParams = z.infer<typeof DocumentListParams>;

export const DocumentSemanticParams = DocumentListParams.omit({
  orderBy: true,
  queryMode: true,
}).required({
  semanticQuery: true,
});
export type DocumentSemanticParams = z.infer<typeof DocumentSemanticParams>;

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
