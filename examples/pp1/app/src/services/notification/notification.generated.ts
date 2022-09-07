import { z } from "zod";
import { SubsetQuery, zArrayable } from "../../typeframe/shared";
import {
  NotificationSearchField,
  NotificationOrderBy,
} from "./notification.enums";

export const NotificationBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  user_id: z.number().int().nullable(),
  phone_number: z.string().max(32),
  unq_key: z.string().max(64).nullable(),
  title: z.string().max(64),
  content: z.string().max(256),
  push_msg: z.string().max(256).nullable(),
  uri: z.string().max(256),
  img_url: z.string().max(255).nullable(),
  created_at: z.string(),
  sent_at: z.string(),
  read_at: z.string().nullable(),
  case_key: z.enum([
    "PUSH-P-S",
    "PUSH-P-PO",
    "PUSH-P-POB",
    "PUSH-P-RN",
    "PUSH-CUSTOM",
  ]),
});
export type NotificationBaseSchema = z.infer<typeof NotificationBaseSchema>;
export const NotificationBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: NotificationSearchField,
    keyword: z.string(),
    orderBy: NotificationOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
  })
  .partial();
export type NotificationBaseListParams = z.infer<
  typeof NotificationBaseListParams
>;

export const NotificationSubsetA = z.object({
  id: z.number().int().nonnegative(),
  phone_number: z.string().max(32),
  title: z.string().max(64),
  content: z.string().max(256),
  push_msg: z.string().max(256).nullable(),
  uri: z.string().max(256),
  img_url: z.string().max(255).nullable(),
  created_at: z.string(),
  sent_at: z.string(),
  read_at: z.string().nullable(),
  unq_key: z.string().max(64).nullable(),
  case_key: z.enum([
    "PUSH-P-S",
    "PUSH-P-PO",
    "PUSH-P-POB",
    "PUSH-P-RN",
    "PUSH-CUSTOM",
  ]),
  user_id: z.number().int().nonnegative().nullable(),
});
export type NotificationSubsetA = z.infer<typeof NotificationSubsetA>;

export const NotificationSubsetP = z.object({
  id: z.number().int().nonnegative(),
  title: z.string().max(64),
  content: z.string().max(256),
  uri: z.string().max(256),
  img_url: z.string().max(255).nullable(),
  created_at: z.string(),
  sent_at: z.string(),
  read_at: z.string().nullable(),
  unq_key: z.string().max(64).nullable(),
  case_key: z.enum([
    "PUSH-P-S",
    "PUSH-P-PO",
    "PUSH-P-POB",
    "PUSH-P-RN",
    "PUSH-CUSTOM",
  ]),
});
export type NotificationSubsetP = z.infer<typeof NotificationSubsetP>;

export type NotificationSubsetMapping = {
  A: NotificationSubsetA;
  P: NotificationSubsetP;
};
export const NotificationSubsetKey = z.enum(["A", "P"]);
export type NotificationSubsetKey = z.infer<typeof NotificationSubsetKey>;

export const notificationSubsetQueries: {
  [key in NotificationSubsetKey]: SubsetQuery;
} = {
  A: {
    select: [
      "notifications.id",
      "notifications.phone_number",
      "notifications.title",
      "notifications.content",
      "notifications.push_msg",
      "notifications.uri",
      "notifications.img_url",
      "notifications.created_at",
      "notifications.sent_at",
      "notifications.read_at",
      "notifications.unq_key",
      "notifications.user_id",
    ],
    virtual: ["case_key"],
    joins: [],
    loaders: [],
  },
  P: {
    select: [
      "notifications.id",
      "notifications.title",
      "notifications.content",
      "notifications.uri",
      "notifications.img_url",
      "notifications.created_at",
      "notifications.sent_at",
      "notifications.read_at",
      "notifications.unq_key",
    ],
    virtual: ["case_key"],
    joins: [],
    loaders: [],
  },
};
export type NotificationFieldExpr =
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
  | "phone_number"
  | "unq_key"
  | "title"
  | "content"
  | "push_msg"
  | "uri"
  | "img_url"
  | "created_at"
  | "sent_at"
  | "read_at"
  | "case_key";
