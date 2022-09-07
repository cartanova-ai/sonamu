import { z } from "zod";
import {
  SizetableBaseSchema,
  SizetableBaseListParams,
} from "./sizetable.generated";

// Sizetable - ListParams
export const SizetableListParams = SizetableBaseListParams;
export type SizetableListParams = z.infer<typeof SizetableListParams>;

// Sizetable - SaveParams
export const SizetableSaveParams = SizetableBaseSchema.partial({ id: true });
export type SizetableSaveParams = z.infer<typeof SizetableSaveParams>;
