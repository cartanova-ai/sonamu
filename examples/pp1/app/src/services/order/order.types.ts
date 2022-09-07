import { z } from "zod";
import {
  OrderBaseSchema,
  OrderBaseListParams,
  OrderItemBaseSchema,
} from "./order.generated";

// Order - ListParams
export const OrderListParams = OrderBaseListParams;
export type OrderListParams = z.infer<typeof OrderListParams>;

// Order - SaveParams
export const OrderSaveParams = OrderBaseSchema.pick({
  id: true,
  order_type: true,
  payment_type: true,
  total_price: true,
  o_name: true,
  o_phone_number: true,
  d_name: true,
  d_phone_number: true,
  d_zipcode: true,
  d_address1: true,
  d_address2: true,
  d_comment: true,
  used_point: true,
  p101_name: true,
  p101_acct_bank: true,
  p101_acct_no: true,
  p101_cr_type: true,
  p101_cr_key: true,
  p101_refund_acct_bank: true,
  p101_refund_acct_no: true,
})
  .partial({
    id: true,
    p101_name: true,
    p101_acct_bank: true,
    p101_acct_no: true,
    p101_cr_type: true,
    p101_cr_key: true,
    p101_refund_acct_bank: true,
    p101_refund_acct_no: true,
  })
  .extend({
    items: OrderItemBaseSchema.pick({
      id: true,
      product_id: true,
      product_item_id: true,
      item_price: true,
      cnt: true,
    })
      .partial({ id: true })
      .array(),
  });
export type OrderSaveParams = z.infer<typeof OrderSaveParams>;

export const OrderUpdateAddressParams = OrderBaseSchema.pick({
  d_name: true,
  d_phone_number: true,
  d_zipcode: true,
  d_address1: true,
  d_address2: true,
}).partial();
export type OrderUpdateAddressParams = z.infer<typeof OrderUpdateAddressParams>;

export const InstmntMon = z.enum([
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
]);
export type InstmntMon = z.infer<typeof InstmntMon>;
export const OrderInstmnt = z.object({
  fnCd: z.string(),
  fnNm: z.string(),
  minInstmntMon: InstmntMon,
  maxInstmntMon: InstmntMon,
  minAmt: z.number(),
});
export type OrderInstmnt = z.infer<typeof OrderInstmnt>;
