import { z } from "zod";
import {
  CategoryBaseSchema,
  CategoryBaseListParams,
} from "./category.generated";

// Category - ListParams
export const CategoryListParams = CategoryBaseListParams;
export type CategoryListParams = z.infer<typeof CategoryListParams>;

// Category - SaveParams
export const CategorySaveParams = CategoryBaseSchema.partial({ id: true });
export type CategorySaveParams = z.infer<typeof CategorySaveParams>;
