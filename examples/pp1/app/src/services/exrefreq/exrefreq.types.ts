import { z } from "zod";
import {
  ExrefreqBaseSchema,
  ExrefreqBaseListParams,
} from "./exrefreq.generated";

// Exrefreq - ListParams
export const ExrefreqListParams = ExrefreqBaseListParams;
export type ExrefreqListParams = z.infer<typeof ExrefreqListParams>;

// Exrefreq - SaveParams
export const ExrefreqSaveParams = ExrefreqBaseSchema.partial({ id: true });
export type ExrefreqSaveParams = z.infer<typeof ExrefreqSaveParams>;
