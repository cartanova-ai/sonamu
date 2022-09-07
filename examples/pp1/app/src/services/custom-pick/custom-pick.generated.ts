import { z } from "zod";
import { SubsetQuery, zArrayable } from "../../typeframe/shared";
import { CustomPickSearchField, CustomPickOrderBy } from "./custom-pick.enums";

export const CustomPickBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  user_id: z.number().int(),
  brand_id: z.number().int(),
  category_id: z.number().int(),
  created_at: z.string(),
  pushed_at: z.string(),
});
export type CustomPickBaseSchema = z.infer<typeof CustomPickBaseSchema>;
export const CustomPickBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: CustomPickSearchField,
    keyword: z.string(),
    orderBy: CustomPickOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
  })
  .partial();
export type CustomPickBaseListParams = z.infer<typeof CustomPickBaseListParams>;

export const CustomPickSubsetA = z.object({
  id: z.number().int().nonnegative(),
  created_at: z.string(),
  pushed_at: z.string(),
  user_id: z.number().int().nonnegative(),
  brand: z.object({
    id: z.number().int().nonnegative(),
    name: z.string().max(128),
  }),
  category: z.object({
    id: z.number().int().nonnegative(),
    name: z.string().max(128),
  }),
});
export type CustomPickSubsetA = z.infer<typeof CustomPickSubsetA>;

export const CustomPickSubsetP = z.object({
  id: z.number().int().nonnegative(),
  created_at: z.string(),
  pushed_at: z.string(),
  user_id: z.number().int().nonnegative(),
  brand: z.object({
    id: z.number().int().nonnegative(),
    name: z.string().max(128),
  }),
  category: z.object({
    id: z.number().int().nonnegative(),
    name: z.string().max(128),
  }),
});
export type CustomPickSubsetP = z.infer<typeof CustomPickSubsetP>;

export type CustomPickSubsetMapping = {
  A: CustomPickSubsetA;
  P: CustomPickSubsetP;
};
export const CustomPickSubsetKey = z.enum(["A", "P"]);
export type CustomPickSubsetKey = z.infer<typeof CustomPickSubsetKey>;

export const customPickSubsetQueries: {
  [key in CustomPickSubsetKey]: SubsetQuery;
} = {
  A: {
    select: [
      "custom_picks.id",
      "custom_picks.created_at",
      "custom_picks.pushed_at",
      "custom_picks.user_id",
      "brand.id as brand__id",
      "brand.name as brand__name",
      "category.id as category__id",
      "category.name as category__name",
    ],
    virtual: [],
    joins: [
      {
        as: "brand",
        join: "outer",
        table: "brands",
        from: "custom_picks.brand_id",
        to: "brand.id",
      },
      {
        as: "category",
        join: "outer",
        table: "categories",
        from: "custom_picks.category_id",
        to: "category.id",
      },
    ],
    loaders: [],
  },
  P: {
    select: [
      "custom_picks.id",
      "custom_picks.created_at",
      "custom_picks.pushed_at",
      "custom_picks.user_id",
      "brand.id as brand__id",
      "brand.name as brand__name",
      "category.id as category__id",
      "category.name as category__name",
    ],
    virtual: [],
    joins: [
      {
        as: "brand",
        join: "outer",
        table: "brands",
        from: "custom_picks.brand_id",
        to: "brand.id",
      },
      {
        as: "category",
        join: "outer",
        table: "categories",
        from: "custom_picks.category_id",
        to: "category.id",
      },
    ],
    loaders: [],
  },
};
export type CustomPickFieldExpr =
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
  | "brand.id"
  | "brand.name"
  | "brand.orderno"
  | "brand.created_at"
  | "brand.official_site_italy"
  | "brand.official_site_int"
  | "brand.is_luxury"
  | "brand.margin_rate"
  | "brand.is_popular"
  | "brand.name_for_search"
  | "brand.name_ko"
  | "brand.desc"
  | "brand.admin_memo"
  | "brand.nv_search_type"
  | "brand.ignore_color"
  | "brand.picks_cnt"
  | "brand.products_cnt"
  | "brand.d_cover_img_url"
  | "brand.m_cover_img_url"
  | "brand.is_custompicked"
  | "brand.is_new"
  | "category.id"
  | "category.prefix"
  | "category.name"
  | "category.name_ko"
  | "category.top.id"
  | "category.top.prefix"
  | "category.top.name"
  | "category.top.name_ko"
  | "category.top.orderno"
  | "category.top.css_class"
  | "category.top.status"
  | "category.top.img_url"
  | "category.top.can_show_on_main"
  | "category.top.text"
  | "category.top.products_cnt"
  | "category.parent.id"
  | "category.parent.prefix"
  | "category.parent.name"
  | "category.parent.name_ko"
  | "category.parent.orderno"
  | "category.parent.css_class"
  | "category.parent.status"
  | "category.parent.img_url"
  | "category.parent.can_show_on_main"
  | "category.parent.text"
  | "category.parent.products_cnt"
  | "category.orderno"
  | "category.css_class"
  | "category.status"
  | "category.img_url"
  | "category.can_show_on_main"
  | "category.text"
  | "category.products_cnt"
  | "category.children.id"
  | "category.children.prefix"
  | "category.children.name"
  | "category.children.name_ko"
  | "category.children.orderno"
  | "category.children.css_class"
  | "category.children.status"
  | "category.children.img_url"
  | "category.children.can_show_on_main"
  | "category.children.text"
  | "category.children.products_cnt"
  | "created_at"
  | "pushed_at";
