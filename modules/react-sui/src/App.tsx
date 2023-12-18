import { z } from "zod";
import { useListParams } from ".";

export default function App() {
  // 리스트 필터
  const { listParams } = useListParams(ProductListParams, {
    num: 50,
    page: 1,
    orderBy: "id-desc",
    search: "combined",
    price_filter: [],
    volume_filter: [],
    status: [],
  });

  return (
    <>
      <code>{JSON.stringify({ listParams }, null, 2)}</code>
      <div>@sonamu-kit/react-sui</div>
      <div>Sonamu with semantic-ui-react</div>
    </>
  );
}

// BaseListParams: Product
export const ProductBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    keyword: z.string(),
    hs_code_id: z.number().int().nullable(),
  })
  .partial();
export type ProductBaseListParams = z.infer<typeof ProductBaseListParams>;

// Product - ListParams
export const ProductListParams = ProductBaseListParams.extend({
  exclude_id: zArrayable(z.number()).optional(),
  sku: zArrayable(z.string()).optional(),
  category_id: zArrayable(z.number()).optional(),
  brand_id: zArrayable(z.number()).optional(),
  tag_id: zArrayable(z.number()).optional(),
  perfume_mainnote_id: zArrayable(z.number()).optional(),
  perfume_grade_id: zArrayable(z.number()).optional(),
  picked_user_id: z.number().optional(),
  deal_id: z.number().optional(),
  max_price: z.number().optional(),
  max_volume_ml: z.number().optional(),
});
export type ProductListParams = z.infer<typeof ProductListParams>;

export function zArrayable<T extends z.ZodTypeAny>(
  shape: T
): z.ZodUnion<[T, z.ZodArray<T, "many">]> {
  return z.union([shape, shape.array()]);
}
