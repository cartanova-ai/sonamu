import { z } from "zod";
import { WtcardBaseSchema, WtcardBaseListParams } from "./wtcard.generated";

// Wtcard - ListParams
export const WtcardListParams = WtcardBaseListParams;
export type WtcardListParams = z.infer<typeof WtcardListParams>;

// Wtcard - SaveParams
export const WtcardSaveParams = WtcardBaseSchema.partial({ id: true });
export type WtcardSaveParams = z.infer<typeof WtcardSaveParams>;
