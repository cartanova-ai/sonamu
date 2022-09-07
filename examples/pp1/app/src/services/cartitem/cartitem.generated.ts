import { z } from "zod";
import { SubsetQuery, zArrayable } from "../../typeframe/shared";
import { CartitemSearchField, CartitemOrderBy } from "./cartitem.enums";
import {
  ProductType,
  ProductStatus,
  ProductSeason,
  ProductItemStatus,
  ProductGender,
} from "../product/product.enums";
import { InventoryType } from "../inventory/inventory.enums";

export const CartitemBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  user_id: z.number().int(),
  product_id: z.number().int(),
  item_id: z.number().int(),
  item_price: z.number().int(),
  cnt: z.number().int().nonnegative(),
  created_at: z.string(),
});
export type CartitemBaseSchema = z.infer<typeof CartitemBaseSchema>;
export const CartitemBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: CartitemSearchField,
    keyword: z.string(),
    orderBy: CartitemOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
  })
  .partial();
export type CartitemBaseListParams = z.infer<typeof CartitemBaseListParams>;

export const CartitemSubsetA = z.object({
  id: z.number().int().nonnegative(),
  item_price: z.number().int(),
  cnt: z.number().int().nonnegative(),
  created_at: z.string(),
  user_id: z.number().int().nonnegative(),
  product: z.object({
    id: z.number().int().nonnegative(),
    type: ProductType,
    title: z.string().max(128),
    rep_img_url: z.string().max(128),
    status: ProductStatus,
    price: z.number().int(),
    base_price: z.number().int().nonnegative().nullable(),
    original_price: z.number().int(),
    point_percentage: z.number().int().nonnegative(),
    rep_inventory_type: z.string().max(8).nullable(),
    total_loss_cnt: z.number().int().nonnegative(),
    min_expected_stock_at: z.string().nullable(),
    new_badge_at: z.string().nullable(),
    logi_expected_date: z.string().nullable(),
    season: ProductSeason,
    brand: z.object({
      id: z.number().int().nonnegative(),
      name: z.string().max(128),
      name_for_search: z.string().max(1024),
      name_ko: z.string().max(128),
    }),
  }),
  item: z.object({
    id: z.number().int().nonnegative(),
    title: z.string().max(128),
    status: ProductItemStatus,
    holding: z.number().int().nonnegative(),
    current_stock: z.number().int(),
  }),
});
export type CartitemSubsetA = z.infer<typeof CartitemSubsetA>;

export const CartitemSubsetP = z.object({
  id: z.number().int().nonnegative(),
  item_price: z.number().int(),
  cnt: z.number().int().nonnegative(),
  created_at: z.string(),
  user_id: z.number().int().nonnegative(),
  product: z.object({
    id: z.number().int().nonnegative(),
    type: ProductType,
    title: z.string().max(128),
    rep_img_url: z.string().max(128),
    status: ProductStatus,
    price: z.number().int(),
    base_price: z.number().int().nonnegative().nullable(),
    original_price: z.number().int(),
    point_percentage: z.number().int().nonnegative(),
    rep_inventory_type: z.string().max(8).nullable(),
    total_loss_cnt: z.number().int().nonnegative(),
    min_expected_stock_at: z.string().nullable(),
    new_badge_at: z.string().nullable(),
    total_current_stock: z.number().int(),
    gender: ProductGender,
    flag: z.record(z.string(), z.boolean()),
    logi_expected_date: z.string().nullable(),
    season: ProductSeason,
    brand: z.object({
      id: z.number().int().nonnegative(),
      name: z.string().max(128),
      name_for_search: z.string().max(1024),
      name_ko: z.string().max(128),
    }),
    logi: z.object({
      id: z.number().int().nonnegative(),
      free_price: z.number().int().nonnegative(),
      base_fee: z.number().int().nonnegative(),
      added_fee: z.number().int().nonnegative(),
    }),
  }),
  item: z.object({
    id: z.number().int().nonnegative(),
    title: z.string().max(128),
    status: ProductItemStatus,
    holding: z.number().int().nonnegative(),
    current_stock: z.number().int(),
    current_location_key: z.object({
      europeFactory: z.boolean(),
      italyWarehouse: z.boolean(),
      airportWarehouse: z.boolean(),
      localWarehouse: z.boolean(),
    }),
    current_inventory: z.object({
      type: InventoryType,
      expected_stock_at: z.string(),
    }),
  }),
});
export type CartitemSubsetP = z.infer<typeof CartitemSubsetP>;

export type CartitemSubsetMapping = {
  A: CartitemSubsetA;
  P: CartitemSubsetP;
};
export const CartitemSubsetKey = z.enum(["A", "P"]);
export type CartitemSubsetKey = z.infer<typeof CartitemSubsetKey>;

export const cartitemSubsetQueries: {
  [key in CartitemSubsetKey]: SubsetQuery;
} = {
  A: {
    select: [
      "cartitems.id",
      "cartitems.item_price",
      "cartitems.cnt",
      "cartitems.created_at",
      "cartitems.user_id",
      "product.id as product__id",
      "product.type as product__type",
      "product.title as product__title",
      "product.rep_img_url as product__rep_img_url",
      "product.status as product__status",
      "product.price as product__price",
      "product.base_price as product__base_price",
      "product.original_price as product__original_price",
      "product.point_percentage as product__point_percentage",
      "product.rep_inventory_type as product__rep_inventory_type",
      "product.total_loss_cnt as product__total_loss_cnt",
      "product.min_expected_stock_at as product__min_expected_stock_at",
      "product.new_badge_at as product__new_badge_at",
      "product.season as product__season",
      "product__brand.id as product__brand__id",
      "product__brand.name as product__brand__name",
      "product__brand.name_for_search as product__brand__name_for_search",
      "product__brand.name_ko as product__brand__name_ko",
      "item.id as item__id",
      "item.title as item__title",
      "item.status as item__status",
      "item.holding as item__holding",
      "item.current_stock as item__current_stock",
    ],
    virtual: [],
    joins: [
      {
        as: "product",
        join: "outer",
        table: "products",
        from: "cartitems.product_id",
        to: "product.id",
      },
      {
        as: "product__brand",
        join: "outer",
        table: "brands",
        from: "product.brand_id",
        to: "product__brand.id",
      },
      {
        as: "item",
        join: "outer",
        table: "product_items",
        from: "cartitems.item_id",
        to: "item.id",
      },
    ],
    loaders: [],
  },
  P: {
    select: [
      "cartitems.id",
      "cartitems.item_price",
      "cartitems.cnt",
      "cartitems.created_at",
      "cartitems.user_id",
      "product.id as product__id",
      "product.type as product__type",
      "product.title as product__title",
      "product.rep_img_url as product__rep_img_url",
      "product.status as product__status",
      "product.price as product__price",
      "product.base_price as product__base_price",
      "product.original_price as product__original_price",
      "product.point_percentage as product__point_percentage",
      "product.rep_inventory_type as product__rep_inventory_type",
      "product.total_loss_cnt as product__total_loss_cnt",
      "product.min_expected_stock_at as product__min_expected_stock_at",
      "product.new_badge_at as product__new_badge_at",
      "product.total_current_stock as product__total_current_stock",
      "product.gender as product__gender",
      "product.season as product__season",
      "product__brand.id as product__brand__id",
      "product__brand.name as product__brand__name",
      "product__brand.name_for_search as product__brand__name_for_search",
      "product__brand.name_ko as product__brand__name_ko",
      "product__logi.id as product__logi__id",
      "product__logi.free_price as product__logi__free_price",
      "product__logi.base_fee as product__logi__base_fee",
      "product__logi.added_fee as product__logi__added_fee",
      "item.id as item__id",
      "item.title as item__title",
      "item.status as item__status",
      "item.holding as item__holding",
      "item.current_stock as item__current_stock",
      "item__current_inventory.type as item__current_inventory__type",
      "item__current_inventory.expected_stock_at as item__current_inventory__expected_stock_at",
    ],
    virtual: [],
    joins: [
      {
        as: "product",
        join: "outer",
        table: "products",
        from: "cartitems.product_id",
        to: "product.id",
      },
      {
        as: "product__brand",
        join: "outer",
        table: "brands",
        from: "product.brand_id",
        to: "product__brand.id",
      },
      {
        as: "product__logi",
        join: "outer",
        table: "logis",
        from: "product.logi_id",
        to: "product__logi.id",
      },
      {
        as: "item",
        join: "outer",
        table: "product_items",
        from: "cartitems.item_id",
        to: "item.id",
      },
      {
        as: "item__current_inventory",
        join: "outer",
        table: "inventories",
        from: "item.current_inventory_id",
        to: "item__current_inventory.id",
      },
    ],
    loaders: [],
  },
};
export type CartitemFieldExpr =
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
  | "product.id"
  | "product.type"
  | "product.brand.id"
  | "product.brand.name"
  | "product.brand.orderno"
  | "product.brand.created_at"
  | "product.brand.official_site_italy"
  | "product.brand.official_site_int"
  | "product.brand.is_luxury"
  | "product.brand.margin_rate"
  | "product.brand.is_popular"
  | "product.brand.name_for_search"
  | "product.brand.name_ko"
  | "product.brand.desc"
  | "product.brand.admin_memo"
  | "product.brand.nv_search_type"
  | "product.brand.ignore_color"
  | "product.brand.picks_cnt"
  | "product.brand.products_cnt"
  | "product.brand.d_cover_img_url"
  | "product.brand.m_cover_img_url"
  | "product.brand.is_custompicked"
  | "product.brand.is_new"
  | "product.title"
  | "product.parsed_title"
  | "product.stock_type"
  | "product.description"
  | "product.rep_img_url"
  | "product.status"
  | "product.price"
  | "product.base_price"
  | "product.original_price"
  | "product.point_percentage"
  | "product.orders_cnt"
  | "product.order_items_cnt"
  | "product.orders_sum"
  | "product.logi.id"
  | "product.logi.title"
  | "product.logi.method"
  | "product.logi.logicompany.id"
  | "product.logi.logicompany.name"
  | "product.logi.logicompany.st_code"
  | "product.logi.base_fee"
  | "product.logi.added_fee"
  | "product.logi.free_price"
  | "product.logi.est_days"
  | "product.logi.created_at"
  | "product.exref.id"
  | "product.exref.title"
  | "product.exref.fee"
  | "product.exref.fee_text"
  | "product.exref.req_date_text"
  | "product.exref.restrict_text"
  | "product.exref.created_at"
  | "product.created_at"
  | "product.total_current_stock"
  | "product.main_category.id"
  | "product.main_category.prefix"
  | "product.main_category.name"
  | "product.main_category.name_ko"
  | "product.main_category.top.id"
  | "product.main_category.top.prefix"
  | "product.main_category.top.name"
  | "product.main_category.top.name_ko"
  | "product.main_category.top.top"
  | "product.main_category.top.parent"
  | "product.main_category.top.orderno"
  | "product.main_category.top.css_class"
  | "product.main_category.top.status"
  | "product.main_category.top.img_url"
  | "product.main_category.top.can_show_on_main"
  | "product.main_category.top.text"
  | "product.main_category.top.products_cnt"
  | "product.main_category.top.children"
  | "product.main_category.parent.id"
  | "product.main_category.parent.prefix"
  | "product.main_category.parent.name"
  | "product.main_category.parent.name_ko"
  | "product.main_category.parent.top"
  | "product.main_category.parent.parent"
  | "product.main_category.parent.orderno"
  | "product.main_category.parent.css_class"
  | "product.main_category.parent.status"
  | "product.main_category.parent.img_url"
  | "product.main_category.parent.can_show_on_main"
  | "product.main_category.parent.text"
  | "product.main_category.parent.products_cnt"
  | "product.main_category.parent.children"
  | "product.main_category.orderno"
  | "product.main_category.css_class"
  | "product.main_category.status"
  | "product.main_category.img_url"
  | "product.main_category.can_show_on_main"
  | "product.main_category.text"
  | "product.main_category.products_cnt"
  | "product.main_category.children.id"
  | "product.main_category.children.prefix"
  | "product.main_category.children.name"
  | "product.main_category.children.name_ko"
  | "product.main_category.children.top"
  | "product.main_category.children.parent"
  | "product.main_category.children.orderno"
  | "product.main_category.children.css_class"
  | "product.main_category.children.status"
  | "product.main_category.children.img_url"
  | "product.main_category.children.can_show_on_main"
  | "product.main_category.children.text"
  | "product.main_category.children.products_cnt"
  | "product.main_category.children.children"
  | "product.sub_category.id"
  | "product.sub_category.prefix"
  | "product.sub_category.name"
  | "product.sub_category.name_ko"
  | "product.sub_category.top.id"
  | "product.sub_category.top.prefix"
  | "product.sub_category.top.name"
  | "product.sub_category.top.name_ko"
  | "product.sub_category.top.top"
  | "product.sub_category.top.parent"
  | "product.sub_category.top.orderno"
  | "product.sub_category.top.css_class"
  | "product.sub_category.top.status"
  | "product.sub_category.top.img_url"
  | "product.sub_category.top.can_show_on_main"
  | "product.sub_category.top.text"
  | "product.sub_category.top.products_cnt"
  | "product.sub_category.top.children"
  | "product.sub_category.parent.id"
  | "product.sub_category.parent.prefix"
  | "product.sub_category.parent.name"
  | "product.sub_category.parent.name_ko"
  | "product.sub_category.parent.top"
  | "product.sub_category.parent.parent"
  | "product.sub_category.parent.orderno"
  | "product.sub_category.parent.css_class"
  | "product.sub_category.parent.status"
  | "product.sub_category.parent.img_url"
  | "product.sub_category.parent.can_show_on_main"
  | "product.sub_category.parent.text"
  | "product.sub_category.parent.products_cnt"
  | "product.sub_category.parent.children"
  | "product.sub_category.orderno"
  | "product.sub_category.css_class"
  | "product.sub_category.status"
  | "product.sub_category.img_url"
  | "product.sub_category.can_show_on_main"
  | "product.sub_category.text"
  | "product.sub_category.products_cnt"
  | "product.sub_category.children.id"
  | "product.sub_category.children.prefix"
  | "product.sub_category.children.name"
  | "product.sub_category.children.name_ko"
  | "product.sub_category.children.top"
  | "product.sub_category.children.parent"
  | "product.sub_category.children.orderno"
  | "product.sub_category.children.css_class"
  | "product.sub_category.children.status"
  | "product.sub_category.children.img_url"
  | "product.sub_category.children.can_show_on_main"
  | "product.sub_category.children.text"
  | "product.sub_category.children.products_cnt"
  | "product.sub_category.children.children"
  | "product.visited_cnt"
  | "product.reviews_cnt"
  | "product.is_testing"
  | "product.src_pcode"
  | "product.season"
  | "product.material"
  | "product.model_size"
  | "product.size"
  | "product.size_text"
  | "product.size_country"
  | "product.src_color"
  | "product.fitting_info"
  | "product.gender"
  | "product.unq_id"
  | "product.first_deal.id"
  | "product.first_deal.status"
  | "product.first_deal.type"
  | "product.first_deal.title"
  | "product.first_deal.seq_no"
  | "product.first_deal.seq_title"
  | "product.first_deal.preorder_title"
  | "product.first_deal.stock_date"
  | "product.first_deal.warehousing_date"
  | "product.first_deal.created_at"
  | "product.first_deal.sms_sent_at"
  | "product.first_deal.preorder_begin_at"
  | "product.first_deal.preorder_end_at"
  | "product.first_deal.inventories_cnt"
  | "product.first_deal.is_early_ended"
  | "product.first_deal.remark"
  | "product.first_deal.cover_title"
  | "product.first_deal.cover_subtitle"
  | "product.first_deal.cover_desc"
  | "product.first_deal.cover_d_img_url"
  | "product.first_deal.cover_m_img_url"
  | "product.first_deal.encore_no"
  | "product.first_deal.feature_orderby"
  | "product.first_deal.cover_timer_color"
  | "product.first_deal.cover_timer_bg_color"
  | "product.first_deal.cover_desc_bg_color"
  | "product.first_deal.cover_desc_text_color"
  | "product.first_deal.preorder_type"
  | "product.first_deal.so_desc"
  | "product.first_deal.so_desc_bg_color"
  | "product.first_deal.so_content_d_img_url"
  | "product.first_deal.so_content_m_img_url"
  | "product.first_deal.so_cover_d_img_url"
  | "product.first_deal.so_cover_m_img_url"
  | "product.first_deal.orderno"
  | "product.first_deal.cover_list_img_url"
  | "product.first_deal.confirmed_at"
  | "product.first_deal.product_type"
  | "product.first_deal.product_total_cnt"
  | "product.latest_deal.id"
  | "product.latest_deal.status"
  | "product.latest_deal.type"
  | "product.latest_deal.title"
  | "product.latest_deal.seq_no"
  | "product.latest_deal.seq_title"
  | "product.latest_deal.preorder_title"
  | "product.latest_deal.stock_date"
  | "product.latest_deal.warehousing_date"
  | "product.latest_deal.created_at"
  | "product.latest_deal.sms_sent_at"
  | "product.latest_deal.preorder_begin_at"
  | "product.latest_deal.preorder_end_at"
  | "product.latest_deal.inventories_cnt"
  | "product.latest_deal.is_early_ended"
  | "product.latest_deal.remark"
  | "product.latest_deal.cover_title"
  | "product.latest_deal.cover_subtitle"
  | "product.latest_deal.cover_desc"
  | "product.latest_deal.cover_d_img_url"
  | "product.latest_deal.cover_m_img_url"
  | "product.latest_deal.encore_no"
  | "product.latest_deal.feature_orderby"
  | "product.latest_deal.cover_timer_color"
  | "product.latest_deal.cover_timer_bg_color"
  | "product.latest_deal.cover_desc_bg_color"
  | "product.latest_deal.cover_desc_text_color"
  | "product.latest_deal.preorder_type"
  | "product.latest_deal.so_desc"
  | "product.latest_deal.so_desc_bg_color"
  | "product.latest_deal.so_content_d_img_url"
  | "product.latest_deal.so_content_m_img_url"
  | "product.latest_deal.so_cover_d_img_url"
  | "product.latest_deal.so_cover_m_img_url"
  | "product.latest_deal.orderno"
  | "product.latest_deal.cover_list_img_url"
  | "product.latest_deal.confirmed_at"
  | "product.latest_deal.product_type"
  | "product.latest_deal.product_total_cnt"
  | "product.picks_cnt"
  | "product.recent_picks_cnt"
  | "product.bpc1"
  | "product.is_blevel"
  | "product.pcode_main"
  | "product.pcode_sub"
  | "product.color_code"
  | "product.color_text"
  | "product.new_flag"
  | "product.activated_at"
  | "product.activated_by"
  | "product.pcode_analyzed_at"
  | "product.pcode_analyzed_by"
  | "product.prate_top"
  | "product.need_modification"
  | "product.sizetable.id"
  | "product.sizetable.category.id"
  | "product.sizetable.category.prefix"
  | "product.sizetable.category.name"
  | "product.sizetable.category.name_ko"
  | "product.sizetable.category.top"
  | "product.sizetable.category.parent"
  | "product.sizetable.category.orderno"
  | "product.sizetable.category.css_class"
  | "product.sizetable.category.status"
  | "product.sizetable.category.img_url"
  | "product.sizetable.category.can_show_on_main"
  | "product.sizetable.category.text"
  | "product.sizetable.category.products_cnt"
  | "product.sizetable.category.children"
  | "product.sizetable.brand.id"
  | "product.sizetable.brand.name"
  | "product.sizetable.brand.orderno"
  | "product.sizetable.brand.created_at"
  | "product.sizetable.brand.official_site_italy"
  | "product.sizetable.brand.official_site_int"
  | "product.sizetable.brand.is_luxury"
  | "product.sizetable.brand.margin_rate"
  | "product.sizetable.brand.is_popular"
  | "product.sizetable.brand.name_for_search"
  | "product.sizetable.brand.name_ko"
  | "product.sizetable.brand.desc"
  | "product.sizetable.brand.admin_memo"
  | "product.sizetable.brand.nv_search_type"
  | "product.sizetable.brand.ignore_color"
  | "product.sizetable.brand.picks_cnt"
  | "product.sizetable.brand.products_cnt"
  | "product.sizetable.brand.d_cover_img_url"
  | "product.sizetable.brand.m_cover_img_url"
  | "product.sizetable.brand.is_custompicked"
  | "product.sizetable.brand.is_new"
  | "product.sizetable.gender"
  | "product.sizetable.contents.id"
  | "product.sizetable.contents.sizetable"
  | "product.sizetable.contents.standard"
  | "product.sizetable.contents.kr"
  | "product.sizetable.contents.eu"
  | "product.sizetable.contents.it"
  | "product.sizetable.contents.uk"
  | "product.sizetable.contents.fr"
  | "product.sizetable.contents.us"
  | "product.sizetable.contents.ger"
  | "product.sizetable.contents.waist_cm"
  | "product.sizetable.contents.waist_inch"
  | "product.sizetable.contents.cm"
  | "product.sizetable.contents.numerical"
  | "product.sizetable.contents.age"
  | "product.sizetable.contents.height_cm"
  | "product.sizetable.contents.height_inch"
  | "product.sizetable.contents.chest_cm"
  | "product.sizetable.contents.feet_mm"
  | "product.sizetable.contents.hip_cm"
  | "product.sizetable.contents.head_cm"
  | "product.sizetable.contents.weight_kg"
  | "product.sizetable.contents.orderno"
  | "product.score"
  | "product.rep_inventory_type"
  | "product.total_loss_cnt"
  | "product.min_expected_stock_at"
  | "product.last_base_price_verified_at"
  | "product.dps_cnt"
  | "product.src_category_name"
  | "product.origin_price_uk"
  | "product.origin_currency_uk"
  | "product.t200_price_uk"
  | "product.origin_price_fr"
  | "product.origin_currency_fr"
  | "product.t200_price_fr"
  | "product.origin_price_it"
  | "product.origin_currency_it"
  | "product.t200_price_it"
  | "product.new_badge_at"
  | "product.items.id"
  | "product.items.title"
  | "product.items.status"
  | "product.items.holding"
  | "product.items.current_inventory.id"
  | "product.items.current_inventory.product"
  | "product.items.current_inventory.product_item"
  | "product.items.current_inventory.created_at"
  | "product.items.current_inventory.invoice_at"
  | "product.items.current_inventory.expected_stock_at"
  | "product.items.current_inventory.stock_at"
  | "product.items.current_inventory.type"
  | "product.items.current_inventory.deal"
  | "product.items.current_inventory.active"
  | "product.items.current_inventory.memo"
  | "product.items.current_inventory.order_item"
  | "product.items.current_inventory.order_item_seq"
  | "product.items.current_inventory.dp_item"
  | "product.items.current_inventory.dp_item_seq"
  | "product.items.current_inventory.reason"
  | "product.items.current_inventory.ao_seq"
  | "product.items.current_inventory.ao_type"
  | "product.items.current_inventory.price"
  | "product.items.current_stock"
  | "product.items.converted_title"
  | "product.items.loss_cnt"
  | "product.items.origin_stock_uk"
  | "product.items.origin_stock_it"
  | "product.items.origin_stock_fr"
  | "product.items.max_stock"
  | "product.items.consumed_cnt"
  | "product.items.preorder_end_at"
  | "product.items.product_logi_expected_date"
  | "product.items.expected_stock_at"
  | "product.items.stock_at"
  | "product.items.current_location_key"
  | "product.images"
  | "product.flag"
  | "product.latest_deal_created_date_view"
  | "product.min_expected_stock_date"
  | "product.apc_full"
  | "product.is_picked"
  | "product.brand_is_custompicked"
  | "product.naver_search_link"
  | "product.is_season_order"
  | "product.country_code"
  | "product.country_code_ko"
  | "product.logi_expected_date"
  | "item.id"
  | "item.product.id"
  | "item.product.type"
  | "item.product.brand.id"
  | "item.product.brand.name"
  | "item.product.brand.orderno"
  | "item.product.brand.created_at"
  | "item.product.brand.official_site_italy"
  | "item.product.brand.official_site_int"
  | "item.product.brand.is_luxury"
  | "item.product.brand.margin_rate"
  | "item.product.brand.is_popular"
  | "item.product.brand.name_for_search"
  | "item.product.brand.name_ko"
  | "item.product.brand.desc"
  | "item.product.brand.admin_memo"
  | "item.product.brand.nv_search_type"
  | "item.product.brand.ignore_color"
  | "item.product.brand.picks_cnt"
  | "item.product.brand.products_cnt"
  | "item.product.brand.d_cover_img_url"
  | "item.product.brand.m_cover_img_url"
  | "item.product.brand.is_custompicked"
  | "item.product.brand.is_new"
  | "item.product.title"
  | "item.product.parsed_title"
  | "item.product.stock_type"
  | "item.product.description"
  | "item.product.rep_img_url"
  | "item.product.status"
  | "item.product.price"
  | "item.product.base_price"
  | "item.product.original_price"
  | "item.product.point_percentage"
  | "item.product.orders_cnt"
  | "item.product.order_items_cnt"
  | "item.product.orders_sum"
  | "item.product.logi.id"
  | "item.product.logi.title"
  | "item.product.logi.method"
  | "item.product.logi.logicompany"
  | "item.product.logi.base_fee"
  | "item.product.logi.added_fee"
  | "item.product.logi.free_price"
  | "item.product.logi.est_days"
  | "item.product.logi.created_at"
  | "item.product.exref.id"
  | "item.product.exref.title"
  | "item.product.exref.fee"
  | "item.product.exref.fee_text"
  | "item.product.exref.req_date_text"
  | "item.product.exref.restrict_text"
  | "item.product.exref.created_at"
  | "item.product.created_at"
  | "item.product.total_current_stock"
  | "item.product.main_category.id"
  | "item.product.main_category.prefix"
  | "item.product.main_category.name"
  | "item.product.main_category.name_ko"
  | "item.product.main_category.top"
  | "item.product.main_category.parent"
  | "item.product.main_category.orderno"
  | "item.product.main_category.css_class"
  | "item.product.main_category.status"
  | "item.product.main_category.img_url"
  | "item.product.main_category.can_show_on_main"
  | "item.product.main_category.text"
  | "item.product.main_category.products_cnt"
  | "item.product.main_category.children"
  | "item.product.sub_category.id"
  | "item.product.sub_category.prefix"
  | "item.product.sub_category.name"
  | "item.product.sub_category.name_ko"
  | "item.product.sub_category.top"
  | "item.product.sub_category.parent"
  | "item.product.sub_category.orderno"
  | "item.product.sub_category.css_class"
  | "item.product.sub_category.status"
  | "item.product.sub_category.img_url"
  | "item.product.sub_category.can_show_on_main"
  | "item.product.sub_category.text"
  | "item.product.sub_category.products_cnt"
  | "item.product.sub_category.children"
  | "item.product.visited_cnt"
  | "item.product.reviews_cnt"
  | "item.product.is_testing"
  | "item.product.src_pcode"
  | "item.product.season"
  | "item.product.material"
  | "item.product.model_size"
  | "item.product.size"
  | "item.product.size_text"
  | "item.product.size_country"
  | "item.product.src_color"
  | "item.product.fitting_info"
  | "item.product.gender"
  | "item.product.unq_id"
  | "item.product.first_deal.id"
  | "item.product.first_deal.status"
  | "item.product.first_deal.type"
  | "item.product.first_deal.title"
  | "item.product.first_deal.seq_no"
  | "item.product.first_deal.seq_title"
  | "item.product.first_deal.preorder_title"
  | "item.product.first_deal.stock_date"
  | "item.product.first_deal.warehousing_date"
  | "item.product.first_deal.created_at"
  | "item.product.first_deal.sms_sent_at"
  | "item.product.first_deal.preorder_begin_at"
  | "item.product.first_deal.preorder_end_at"
  | "item.product.first_deal.inventories_cnt"
  | "item.product.first_deal.is_early_ended"
  | "item.product.first_deal.remark"
  | "item.product.first_deal.cover_title"
  | "item.product.first_deal.cover_subtitle"
  | "item.product.first_deal.cover_desc"
  | "item.product.first_deal.cover_d_img_url"
  | "item.product.first_deal.cover_m_img_url"
  | "item.product.first_deal.encore_no"
  | "item.product.first_deal.feature_orderby"
  | "item.product.first_deal.cover_timer_color"
  | "item.product.first_deal.cover_timer_bg_color"
  | "item.product.first_deal.cover_desc_bg_color"
  | "item.product.first_deal.cover_desc_text_color"
  | "item.product.first_deal.preorder_type"
  | "item.product.first_deal.so_desc"
  | "item.product.first_deal.so_desc_bg_color"
  | "item.product.first_deal.so_content_d_img_url"
  | "item.product.first_deal.so_content_m_img_url"
  | "item.product.first_deal.so_cover_d_img_url"
  | "item.product.first_deal.so_cover_m_img_url"
  | "item.product.first_deal.orderno"
  | "item.product.first_deal.cover_list_img_url"
  | "item.product.first_deal.confirmed_at"
  | "item.product.first_deal.product_type"
  | "item.product.first_deal.products"
  | "item.product.first_deal.product_total_cnt"
  | "item.product.latest_deal.id"
  | "item.product.latest_deal.status"
  | "item.product.latest_deal.type"
  | "item.product.latest_deal.title"
  | "item.product.latest_deal.seq_no"
  | "item.product.latest_deal.seq_title"
  | "item.product.latest_deal.preorder_title"
  | "item.product.latest_deal.stock_date"
  | "item.product.latest_deal.warehousing_date"
  | "item.product.latest_deal.created_at"
  | "item.product.latest_deal.sms_sent_at"
  | "item.product.latest_deal.preorder_begin_at"
  | "item.product.latest_deal.preorder_end_at"
  | "item.product.latest_deal.inventories_cnt"
  | "item.product.latest_deal.is_early_ended"
  | "item.product.latest_deal.remark"
  | "item.product.latest_deal.cover_title"
  | "item.product.latest_deal.cover_subtitle"
  | "item.product.latest_deal.cover_desc"
  | "item.product.latest_deal.cover_d_img_url"
  | "item.product.latest_deal.cover_m_img_url"
  | "item.product.latest_deal.encore_no"
  | "item.product.latest_deal.feature_orderby"
  | "item.product.latest_deal.cover_timer_color"
  | "item.product.latest_deal.cover_timer_bg_color"
  | "item.product.latest_deal.cover_desc_bg_color"
  | "item.product.latest_deal.cover_desc_text_color"
  | "item.product.latest_deal.preorder_type"
  | "item.product.latest_deal.so_desc"
  | "item.product.latest_deal.so_desc_bg_color"
  | "item.product.latest_deal.so_content_d_img_url"
  | "item.product.latest_deal.so_content_m_img_url"
  | "item.product.latest_deal.so_cover_d_img_url"
  | "item.product.latest_deal.so_cover_m_img_url"
  | "item.product.latest_deal.orderno"
  | "item.product.latest_deal.cover_list_img_url"
  | "item.product.latest_deal.confirmed_at"
  | "item.product.latest_deal.product_type"
  | "item.product.latest_deal.products"
  | "item.product.latest_deal.product_total_cnt"
  | "item.product.picks_cnt"
  | "item.product.recent_picks_cnt"
  | "item.product.bpc1"
  | "item.product.is_blevel"
  | "item.product.pcode_main"
  | "item.product.pcode_sub"
  | "item.product.color_code"
  | "item.product.color_text"
  | "item.product.new_flag"
  | "item.product.activated_at"
  | "item.product.activated_by"
  | "item.product.pcode_analyzed_at"
  | "item.product.pcode_analyzed_by"
  | "item.product.prate_top"
  | "item.product.need_modification"
  | "item.product.sizetable.id"
  | "item.product.sizetable.category"
  | "item.product.sizetable.brand"
  | "item.product.sizetable.gender"
  | "item.product.sizetable.contents"
  | "item.product.score"
  | "item.product.rep_inventory_type"
  | "item.product.total_loss_cnt"
  | "item.product.min_expected_stock_at"
  | "item.product.last_base_price_verified_at"
  | "item.product.dps_cnt"
  | "item.product.src_category_name"
  | "item.product.origin_price_uk"
  | "item.product.origin_currency_uk"
  | "item.product.t200_price_uk"
  | "item.product.origin_price_fr"
  | "item.product.origin_currency_fr"
  | "item.product.t200_price_fr"
  | "item.product.origin_price_it"
  | "item.product.origin_currency_it"
  | "item.product.t200_price_it"
  | "item.product.new_badge_at"
  | "item.product.images"
  | "item.product.flag"
  | "item.product.latest_deal_created_date_view"
  | "item.product.min_expected_stock_date"
  | "item.product.apc_full"
  | "item.product.is_picked"
  | "item.product.brand_is_custompicked"
  | "item.product.naver_search_link"
  | "item.product.is_season_order"
  | "item.product.country_code"
  | "item.product.country_code_ko"
  | "item.product.logi_expected_date"
  | "item.title"
  | "item.status"
  | "item.holding"
  | "item.current_inventory.id"
  | "item.current_inventory.product.id"
  | "item.current_inventory.product.type"
  | "item.current_inventory.product.brand"
  | "item.current_inventory.product.title"
  | "item.current_inventory.product.parsed_title"
  | "item.current_inventory.product.stock_type"
  | "item.current_inventory.product.description"
  | "item.current_inventory.product.rep_img_url"
  | "item.current_inventory.product.status"
  | "item.current_inventory.product.price"
  | "item.current_inventory.product.base_price"
  | "item.current_inventory.product.original_price"
  | "item.current_inventory.product.point_percentage"
  | "item.current_inventory.product.orders_cnt"
  | "item.current_inventory.product.order_items_cnt"
  | "item.current_inventory.product.orders_sum"
  | "item.current_inventory.product.logi"
  | "item.current_inventory.product.exref"
  | "item.current_inventory.product.created_at"
  | "item.current_inventory.product.total_current_stock"
  | "item.current_inventory.product.main_category"
  | "item.current_inventory.product.sub_category"
  | "item.current_inventory.product.visited_cnt"
  | "item.current_inventory.product.reviews_cnt"
  | "item.current_inventory.product.is_testing"
  | "item.current_inventory.product.src_pcode"
  | "item.current_inventory.product.season"
  | "item.current_inventory.product.material"
  | "item.current_inventory.product.model_size"
  | "item.current_inventory.product.size"
  | "item.current_inventory.product.size_text"
  | "item.current_inventory.product.size_country"
  | "item.current_inventory.product.src_color"
  | "item.current_inventory.product.fitting_info"
  | "item.current_inventory.product.gender"
  | "item.current_inventory.product.unq_id"
  | "item.current_inventory.product.first_deal"
  | "item.current_inventory.product.latest_deal"
  | "item.current_inventory.product.picks_cnt"
  | "item.current_inventory.product.recent_picks_cnt"
  | "item.current_inventory.product.bpc1"
  | "item.current_inventory.product.is_blevel"
  | "item.current_inventory.product.pcode_main"
  | "item.current_inventory.product.pcode_sub"
  | "item.current_inventory.product.color_code"
  | "item.current_inventory.product.color_text"
  | "item.current_inventory.product.new_flag"
  | "item.current_inventory.product.activated_at"
  | "item.current_inventory.product.activated_by"
  | "item.current_inventory.product.pcode_analyzed_at"
  | "item.current_inventory.product.pcode_analyzed_by"
  | "item.current_inventory.product.prate_top"
  | "item.current_inventory.product.need_modification"
  | "item.current_inventory.product.sizetable"
  | "item.current_inventory.product.score"
  | "item.current_inventory.product.rep_inventory_type"
  | "item.current_inventory.product.total_loss_cnt"
  | "item.current_inventory.product.min_expected_stock_at"
  | "item.current_inventory.product.last_base_price_verified_at"
  | "item.current_inventory.product.dps_cnt"
  | "item.current_inventory.product.src_category_name"
  | "item.current_inventory.product.origin_price_uk"
  | "item.current_inventory.product.origin_currency_uk"
  | "item.current_inventory.product.t200_price_uk"
  | "item.current_inventory.product.origin_price_fr"
  | "item.current_inventory.product.origin_currency_fr"
  | "item.current_inventory.product.t200_price_fr"
  | "item.current_inventory.product.origin_price_it"
  | "item.current_inventory.product.origin_currency_it"
  | "item.current_inventory.product.t200_price_it"
  | "item.current_inventory.product.new_badge_at"
  | "item.current_inventory.product.items"
  | "item.current_inventory.product.images"
  | "item.current_inventory.product.flag"
  | "item.current_inventory.product.latest_deal_created_date_view"
  | "item.current_inventory.product.min_expected_stock_date"
  | "item.current_inventory.product.apc_full"
  | "item.current_inventory.product.is_picked"
  | "item.current_inventory.product.brand_is_custompicked"
  | "item.current_inventory.product.naver_search_link"
  | "item.current_inventory.product.is_season_order"
  | "item.current_inventory.product.country_code"
  | "item.current_inventory.product.country_code_ko"
  | "item.current_inventory.product.logi_expected_date"
  | "item.current_inventory.created_at"
  | "item.current_inventory.invoice_at"
  | "item.current_inventory.expected_stock_at"
  | "item.current_inventory.stock_at"
  | "item.current_inventory.type"
  | "item.current_inventory.deal.id"
  | "item.current_inventory.deal.status"
  | "item.current_inventory.deal.type"
  | "item.current_inventory.deal.title"
  | "item.current_inventory.deal.seq_no"
  | "item.current_inventory.deal.seq_title"
  | "item.current_inventory.deal.preorder_title"
  | "item.current_inventory.deal.stock_date"
  | "item.current_inventory.deal.warehousing_date"
  | "item.current_inventory.deal.created_at"
  | "item.current_inventory.deal.sms_sent_at"
  | "item.current_inventory.deal.preorder_begin_at"
  | "item.current_inventory.deal.preorder_end_at"
  | "item.current_inventory.deal.inventories_cnt"
  | "item.current_inventory.deal.is_early_ended"
  | "item.current_inventory.deal.remark"
  | "item.current_inventory.deal.cover_title"
  | "item.current_inventory.deal.cover_subtitle"
  | "item.current_inventory.deal.cover_desc"
  | "item.current_inventory.deal.cover_d_img_url"
  | "item.current_inventory.deal.cover_m_img_url"
  | "item.current_inventory.deal.encore_no"
  | "item.current_inventory.deal.feature_orderby"
  | "item.current_inventory.deal.cover_timer_color"
  | "item.current_inventory.deal.cover_timer_bg_color"
  | "item.current_inventory.deal.cover_desc_bg_color"
  | "item.current_inventory.deal.cover_desc_text_color"
  | "item.current_inventory.deal.preorder_type"
  | "item.current_inventory.deal.so_desc"
  | "item.current_inventory.deal.so_desc_bg_color"
  | "item.current_inventory.deal.so_content_d_img_url"
  | "item.current_inventory.deal.so_content_m_img_url"
  | "item.current_inventory.deal.so_cover_d_img_url"
  | "item.current_inventory.deal.so_cover_m_img_url"
  | "item.current_inventory.deal.orderno"
  | "item.current_inventory.deal.cover_list_img_url"
  | "item.current_inventory.deal.confirmed_at"
  | "item.current_inventory.deal.product_type"
  | "item.current_inventory.deal.products"
  | "item.current_inventory.deal.product_total_cnt"
  | "item.current_inventory.active"
  | "item.current_inventory.memo"
  | "item.current_inventory.order_item.id"
  | "item.current_inventory.order_item.order"
  | "item.current_inventory.order_item.product"
  | "item.current_inventory.order_item.product_item"
  | "item.current_inventory.order_item.item_price"
  | "item.current_inventory.order_item.cnt"
  | "item.current_inventory.order_item.item_sum"
  | "item.current_inventory.order_item.cartitem"
  | "item.current_inventory.order_item.inventory_type"
  | "item.current_inventory.order_item.inventory_deal"
  | "item.current_inventory.order_item.logi"
  | "item.current_inventory.order_item.logi_key"
  | "item.current_inventory.order_item.status"
  | "item.current_inventory.order_item.earned_point"
  | "item.current_inventory.order_item.earned_point_to_consume"
  | "item.current_inventory.order_item.logi_completed_at"
  | "item.current_inventory.order_item.canceled_at"
  | "item.current_inventory.order_item.canceled_by"
  | "item.current_inventory.order_item.canceled_reason"
  | "item.current_inventory.order_item.exrefreq"
  | "item.current_inventory.order_item.penalty_fee"
  | "item.current_inventory.order_item.refund_amount"
  | "item.current_inventory.order_item.loss_replacement"
  | "item.current_inventory.order_item.restock_cs"
  | "item.current_inventory.order_item.wtcard"
  | "item.current_inventory.order_item.inventory"
  | "item.current_inventory.order_item.review"
  | "item.current_inventory.order_item_seq"
  | "item.current_inventory.dp_item.id"
  | "item.current_inventory.dp_item.deal_product"
  | "item.current_inventory.dp_item.product_item"
  | "item.current_inventory.dp_item.cnt"
  | "item.current_inventory.dp_item.deactivated_at"
  | "item.current_inventory.dp_item.deactivated_by"
  | "item.current_inventory.dp_item.deactivated_reason"
  | "item.current_inventory.dp_item.mdchosen_cnt"
  | "item.current_inventory.dp_item_seq"
  | "item.current_inventory.reason"
  | "item.current_inventory.ao_seq"
  | "item.current_inventory.ao_type"
  | "item.current_inventory.price"
  | "item.current_stock"
  | "item.converted_title"
  | "item.loss_cnt"
  | "item.origin_stock_uk"
  | "item.origin_stock_it"
  | "item.origin_stock_fr"
  | "item.max_stock"
  | "item.consumed_cnt"
  | "item.preorder_end_at"
  | "item.product_logi_expected_date"
  | "item.expected_stock_at"
  | "item.stock_at"
  | "item.current_location_key"
  | "item_price"
  | "cnt"
  | "created_at";
