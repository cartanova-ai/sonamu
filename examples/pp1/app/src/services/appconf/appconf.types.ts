import { z } from "zod";
import { AppconfBaseSchema, AppconfBaseListParams } from "./appconf.generated";

// Appconf - ListParams
export const AppconfListParams = AppconfBaseListParams;
export type AppconfListParams = z.infer<typeof AppconfListParams>;

// Appconf - SaveParams
export const AppconfSaveParams = AppconfBaseSchema.partial({ id: true });
export type AppconfSaveParams = z.infer<typeof AppconfSaveParams>;

// Bank
export const Bank = z.object({
  id: z.number(),
  name: z.string(),
});
export type Bank = z.infer<typeof Bank>;
