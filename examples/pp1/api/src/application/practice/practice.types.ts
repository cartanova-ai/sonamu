import { z } from "zod";
import { PracticeBaseSchema } from "./practice.generated";

export const PracticeListParams = z.object({});
export type PracticeListParams = z.infer<typeof PracticeListParams>;

// Practice - SaveParams
export const PracticeSaveParams = PracticeBaseSchema.partial({ id: true });
export type PracticeSaveParams = z.infer<typeof PracticeSaveParams>;
