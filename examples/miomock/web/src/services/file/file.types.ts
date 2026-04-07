/**
 * @generated
 * API에서 동기화된 파일입니다. 직접 수정하지 마세요.
 */
import { type z } from "zod";

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
