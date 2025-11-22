import type { z } from "zod";
import { FileBaseListParams, FileBaseSchema } from "../sonamu.generated";

// File - ListParams
export const FileListParams = FileBaseListParams;
export type FileListParams = z.infer<typeof FileListParams>;

// File - SaveParams
export const FileSaveParams = FileBaseSchema.partial({
  id: true,
  created_at: true,
});
export type FileSaveParams = z.infer<typeof FileSaveParams>;
