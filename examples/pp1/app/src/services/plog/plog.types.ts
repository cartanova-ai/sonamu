import { z } from "zod";
import { PlogFilter } from "./plog.enums";
import { PlogBaseSchema, PlogBaseListParams } from "./plog.generated";

// Plog - ListParams
export const PlogListParams = PlogBaseListParams.extend({
  filter: PlogFilter.optional(),
});
export type PlogListParams = z.infer<typeof PlogListParams>;

// Plog - SaveParams
export const PlogSaveParams = PlogBaseSchema.partial({ id: true });
export type PlogSaveParams = z.infer<typeof PlogSaveParams>;
