import { z } from "zod";
import { PickBaseSchema, PickBaseListParams } from "./pick.generated";

// Pick - ListParams
export const PickListParams = PickBaseListParams;
export type PickListParams = z.infer<typeof PickListParams>;

// Pick - SaveParams
export const PickSaveParams = PickBaseSchema.partial({ id: true });
export type PickSaveParams = z.infer<typeof PickSaveParams>;
