import type { z } from "zod";
import { DocumentBaseListParams, DocumentBaseSchema } from "../sonamu.generated";

// Document - ListParams
export const DocumentListParams = DocumentBaseListParams;
export type DocumentListParams = z.infer<typeof DocumentListParams>;

// Document - SaveParams
export const DocumentSaveParams = DocumentBaseSchema.partial({ id: true, created_at: true });
export type DocumentSaveParams = z.infer<typeof DocumentSaveParams>;
