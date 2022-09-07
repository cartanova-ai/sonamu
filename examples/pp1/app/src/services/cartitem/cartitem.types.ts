import { z } from "zod";
import {
  CartitemBaseSchema,
  CartitemBaseListParams,
} from "./cartitem.generated";

// Cartitem - ListParams
export const CartitemListParams = CartitemBaseListParams;
export type CartitemListParams = z.infer<typeof CartitemListParams>;

// Cartitem - SaveParams
export const CartitemSaveParams = CartitemBaseSchema.pick({
  id: true,
  product_id: true,
  item_id: true,
  item_price: true,
  cnt: true,
}).partial({ id: true });
export type CartitemSaveParams = z.infer<typeof CartitemSaveParams>;
