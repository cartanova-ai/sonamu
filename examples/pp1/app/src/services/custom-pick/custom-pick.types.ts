import { z } from "zod";
import {
  CustomPickBaseSchema,
  CustomPickBaseListParams,
} from "./custom-pick.generated";

// CustomPick - ListParams
export const CustomPickListParams = CustomPickBaseListParams.extend({
  brand_id: z.number().optional(),
});
export type CustomPickListParams = z.infer<typeof CustomPickListParams>;

// CustomPick - SaveParams
export const CustomPickSaveParams = CustomPickBaseSchema.partial({ id: true });
export type CustomPickSaveParams = z.infer<typeof CustomPickSaveParams>;
