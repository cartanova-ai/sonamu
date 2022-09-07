import { z } from "zod";
import {
  HkeywordBaseSchema,
  HkeywordBaseListParams,
} from "./hkeyword.generated";

// Hkeyword - ListParams
export const HkeywordListParams = HkeywordBaseListParams;
export type HkeywordListParams = z.infer<typeof HkeywordListParams>;

// Hkeyword - SaveParams
export const HkeywordSaveParams = HkeywordBaseSchema.partial({ id: true });
export type HkeywordSaveParams = z.infer<typeof HkeywordSaveParams>;
