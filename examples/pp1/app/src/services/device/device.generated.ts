import { z } from "zod";
import { SubsetQuery, zArrayable } from "../../typeframe/shared";
import { DeviceSearchField, DeviceOrderBy } from "./device.enums";

export const DeviceBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  user_id: z.number().int(),
  platform: z.string().max(16),
  device_token: z.string().max(512),
  created_at: z.string(),
  updated_at: z.string(),
});
export type DeviceBaseSchema = z.infer<typeof DeviceBaseSchema>;
export const DeviceBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: DeviceSearchField,
    keyword: z.string(),
    orderBy: DeviceOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
  })
  .partial();
export type DeviceBaseListParams = z.infer<typeof DeviceBaseListParams>;

export const DeviceSubsetA = z.object({
  id: z.number().int().nonnegative(),
  platform: z.string().max(16),
  device_token: z.string().max(512),
  created_at: z.string(),
  updated_at: z.string(),
  user_id: z.number().int().nonnegative(),
});
export type DeviceSubsetA = z.infer<typeof DeviceSubsetA>;

export type DeviceSubsetMapping = {
  A: DeviceSubsetA;
};
export const DeviceSubsetKey = z.enum(["A"]);
export type DeviceSubsetKey = z.infer<typeof DeviceSubsetKey>;

export const deviceSubsetQueries: { [key in DeviceSubsetKey]: SubsetQuery } = {
  A: {
    select: [
      "devices.id",
      "devices.platform",
      "devices.device_token",
      "devices.created_at",
      "devices.updated_at",
      "devices.user_id",
    ],
    virtual: [],
    joins: [],
    loaders: [],
  },
};
export type DeviceFieldExpr =
  | "id"
  | "user.id"
  | "user.role"
  | "user.sns"
  | "user.string_id"
  | "user.email"
  | "user.pw"
  | "user.img_url"
  | "user.nickname"
  | "user.name"
  | "user.phone_number"
  | "user.gender"
  | "user.birthdate"
  | "user.birth_year"
  | "user.status"
  | "user.blocked_until"
  | "user.to_get_pushed"
  | "user.to_get_mail"
  | "user.to_get_sms"
  | "user.zipcode"
  | "user.address1"
  | "user.address2"
  | "user.created_at"
  | "user.withdraw_reason"
  | "user.level"
  | "user.address.id"
  | "user.address.title"
  | "user.address.name"
  | "user.address.address1"
  | "user.address.address2"
  | "user.address.zipcode"
  | "user.address.phone_number"
  | "user.address.comment"
  | "user.address.created_at"
  | "user.cartitem_cnt"
  | "user.payment_cnt"
  | "user.delivery_cnt"
  | "user.refund_or_exchange_cnt"
  | "user.point"
  | "user.used_point"
  | "user.expected_point"
  | "user.rtoken"
  | "user.ruser.id"
  | "user.ruser.role"
  | "user.ruser.sns"
  | "user.ruser.string_id"
  | "user.ruser.email"
  | "user.ruser.pw"
  | "user.ruser.img_url"
  | "user.ruser.nickname"
  | "user.ruser.name"
  | "user.ruser.phone_number"
  | "user.ruser.gender"
  | "user.ruser.birthdate"
  | "user.ruser.birth_year"
  | "user.ruser.status"
  | "user.ruser.blocked_until"
  | "user.ruser.to_get_pushed"
  | "user.ruser.to_get_mail"
  | "user.ruser.to_get_sms"
  | "user.ruser.zipcode"
  | "user.ruser.address1"
  | "user.ruser.address2"
  | "user.ruser.created_at"
  | "user.ruser.withdraw_reason"
  | "user.ruser.level"
  | "user.ruser.address.id"
  | "user.ruser.address.user"
  | "user.ruser.address.title"
  | "user.ruser.address.name"
  | "user.ruser.address.address1"
  | "user.ruser.address.address2"
  | "user.ruser.address.zipcode"
  | "user.ruser.address.phone_number"
  | "user.ruser.address.comment"
  | "user.ruser.address.created_at"
  | "user.ruser.cartitem_cnt"
  | "user.ruser.payment_cnt"
  | "user.ruser.delivery_cnt"
  | "user.ruser.refund_or_exchange_cnt"
  | "user.ruser.point"
  | "user.ruser.used_point"
  | "user.ruser.expected_point"
  | "user.ruser.rtoken"
  | "user.ruser.withdraw_at"
  | "user.ruser.picks_cnt"
  | "user.ruser.pick_guide_sent_at"
  | "user.ruser.paid_orders_cnt"
  | "user.ruser.to_get_stock_sms"
  | "user.ruser.to_get_event_sms"
  | "user.ruser.marked_last_visited_at"
  | "user.ruser.point_calculated_at"
  | "user.ruser.tagging"
  | "user.ruser.addresses.id"
  | "user.ruser.addresses.user"
  | "user.ruser.addresses.title"
  | "user.ruser.addresses.name"
  | "user.ruser.addresses.address1"
  | "user.ruser.addresses.address2"
  | "user.ruser.addresses.zipcode"
  | "user.ruser.addresses.phone_number"
  | "user.ruser.addresses.comment"
  | "user.ruser.addresses.created_at"
  | "user.withdraw_at"
  | "user.picks_cnt"
  | "user.pick_guide_sent_at"
  | "user.paid_orders_cnt"
  | "user.to_get_stock_sms"
  | "user.to_get_event_sms"
  | "user.marked_last_visited_at"
  | "user.point_calculated_at"
  | "user.tagging"
  | "user.addresses.id"
  | "user.addresses.title"
  | "user.addresses.name"
  | "user.addresses.address1"
  | "user.addresses.address2"
  | "user.addresses.zipcode"
  | "user.addresses.phone_number"
  | "user.addresses.comment"
  | "user.addresses.created_at"
  | "platform"
  | "device_token"
  | "created_at"
  | "updated_at";
