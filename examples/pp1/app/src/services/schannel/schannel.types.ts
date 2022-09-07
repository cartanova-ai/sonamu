import { z } from "zod";
import {
  SchannelBaseSchema,
  SchannelBaseListParams,
} from "./schannel.generated";

// Schannel - ListParams
export const SchannelListParams = SchannelBaseListParams;
export type SchannelListParams = z.infer<typeof SchannelListParams>;

// Schannel - SaveParams
export const SchannelSaveParams = SchannelBaseSchema.partial({ id: true });
export type SchannelSaveParams = z.infer<typeof SchannelSaveParams>;
