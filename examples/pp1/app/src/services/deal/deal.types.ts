import { z } from "zod";
import {
  DealBaseSchema,
  DealBaseListParams,
  DealSubsetP,
} from "./deal.generated";

// Deal - ListParams
export const DealListParams = DealBaseListParams;
export type DealListParams = z.infer<typeof DealListParams>;

// Deal - SaveParams
export const DealSaveParams = DealBaseSchema.partial({ id: true });
export type DealSaveParams = z.infer<typeof DealSaveParams>;

// Deal - OpenDeals
export const OpenDeals = z.object({
  PO_ready: DealSubsetP.array(),
  PO_active: DealSubsetP.array(),
  PO_ended: DealSubsetP.array(),
  SALE: DealSubsetP,
});
export type OpenDeals = z.infer<typeof OpenDeals>;
