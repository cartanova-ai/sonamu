import { z } from "zod";
import {
  InventoryBaseSchema,
  InventoryBaseListParams,
} from "./inventory.generated";

// Inventory - ListParams
export const InventoryListParams = InventoryBaseListParams;
export type InventoryListParams = z.infer<typeof InventoryListParams>;

// Inventory - SaveParams
export const InventorySaveParams = InventoryBaseSchema.partial({ id: true });
export type InventorySaveParams = z.infer<typeof InventorySaveParams>;
