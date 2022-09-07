import { z } from "zod";
import { ReviewBaseSchema, ReviewBaseListParams } from "./review.generated";

// Review - ListParams
export const ReviewListParams = ReviewBaseListParams.extend({
  product_id: z.number().optional(),
});
export type ReviewListParams = z.infer<typeof ReviewListParams>;

// Review - SaveParams
export const ReviewSaveParams = ReviewBaseSchema.pick({
  id: true,
  order_id: true,
  product_id: true,
  content: true,
  rating: true,
  images: true,
}).partial({ id: true });
export type ReviewSaveParams = z.infer<typeof ReviewSaveParams>;
