import { z } from "zod";
import { ApopupBaseSchema, ApopupBaseListParams } from "./apopup.generated";

// Apopup - ListParams
export const ApopupListParams = ApopupBaseListParams;
export type ApopupListParams = z.infer<typeof ApopupListParams>;

// Apopup - SaveParams
export const ApopupSaveParams = ApopupBaseSchema.partial({ id: true });
export type ApopupSaveParams = z.infer<typeof ApopupSaveParams>;
