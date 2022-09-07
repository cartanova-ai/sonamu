import { z } from "zod";
import { SubsetQuery, zArrayable } from "../../typeframe/shared";
import {
  DealType,
  DealIsEarlyEnded,
  DealPreorderType,
  DealProductItemDeactivatedReason,
  DealSearchField,
  DealOrderBy,
} from "./deal.enums";
import { ProductSeason, ProductGender } from "../product/product.enums";

export const DealBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  status: z.number().int(),
  type: DealType,
  title: z.string().max(128),
  seq_no: z.number().int().nonnegative(),
  seq_title: z.string().max(128),
  preorder_title: z.string().max(128),
  stock_date: z.string().max(10),
  warehousing_date: z.string().max(10),
  created_at: z.string(),
  sms_sent_at: z.string(),
  preorder_begin_at: z.string(),
  preorder_end_at: z.string(),
  inventories_cnt: z.number().int(),
  is_early_ended: DealIsEarlyEnded,
  remark: z.string().max(1024).nullable(),
  cover_title: z.string().max(128),
  cover_subtitle: z.string().max(128),
  cover_desc: z.string(),
  cover_d_img_url: z.string().max(128),
  cover_m_img_url: z.string().max(128),
  encore_no: z.number().int().nonnegative(),
  feature_orderby: z.string().max(32).nullable(),
  cover_timer_color: z.string().max(8).nullable(),
  cover_timer_bg_color: z.string().max(8).nullable(),
  cover_desc_bg_color: z.string().max(8).nullable(),
  cover_desc_text_color: z.string().max(8).nullable(),
  preorder_type: DealPreorderType,
  so_desc: z.string().nullable(),
  so_desc_bg_color: z.string().max(8).nullable(),
  so_content_d_img_url: z.string().max(256).nullable(),
  so_content_m_img_url: z.string().max(256).nullable(),
  so_cover_d_img_url: z.string().max(256).nullable(),
  so_cover_m_img_url: z.string().max(256).nullable(),
  orderno: z.number().int().nonnegative().nullable(),
  cover_list_img_url: z.string().max(256).nullable(),
  confirmed_at: z.string().nullable(),
  product_type: z.number().int(),
  // products: HasMany Product
  product_total_cnt: z.number(),
});
export type DealBaseSchema = z.infer<typeof DealBaseSchema>;
export const DealProductBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  deal_id: z.number().int(),
  product_id: z.number().int(),
  path: z.string().max(128),
  created_at: z.string(),
  src_dp_id: z.number().int(),
  euro_price_policy: z.string().max(64),
  euro_costo_price: z.number().nonnegative(),
  euro_retail_price: z.number().nonnegative(),
  euro_price: z.number().nonnegative(),
  last_src_price_updated_at: z.string(),
  dpitems_cnt: z.number().int().nonnegative(),
  pcode_addr: z.string().max(16),
  src_pcode: z.string().max(128),
  src_color: z.string().max(64).nullable(),
  season: z.string().max(6),
  price: z.number().int().nonnegative().nullable(),
  prate_top: z.number().int().nonnegative().nullable(),
  price_updated_at: z.string().nullable(),
  price_updated_by: z.number().int().nonnegative().nullable(),
  locale_country: z.string().max(2).nullable(),
});
export type DealProductBaseSchema = z.infer<typeof DealProductBaseSchema>;
export const DealProductItemBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  deal_product_id: z.number().int(),
  product_item_id: z.number().int(),
  cnt: z.number().int().nonnegative(),
  deactivated_at: z.string().nullable(),
  deactivated_by: z.number().int().nonnegative().nullable(),
  deactivated_reason: DealProductItemDeactivatedReason.nullable(),
  mdchosen_cnt: z.number().int().nullable(),
});
export type DealProductItemBaseSchema = z.infer<
  typeof DealProductItemBaseSchema
>;
export const DealBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: DealSearchField,
    keyword: z.string(),
    orderBy: DealOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
    type: DealType,
    is_early_ended: DealIsEarlyEnded,
    preorder_type: DealPreorderType,
  })
  .partial();
export type DealBaseListParams = z.infer<typeof DealBaseListParams>;

export const DealSubsetA = z.object({
  id: z.number().int().nonnegative(),
  status: z.number().int(),
  type: DealType,
  title: z.string().max(128),
  seq_no: z.number().int().nonnegative(),
  seq_title: z.string().max(128),
  preorder_title: z.string().max(128),
  stock_date: z.string().max(10),
  warehousing_date: z.string().max(10),
  created_at: z.string(),
  sms_sent_at: z.string(),
  preorder_begin_at: z.string(),
  preorder_end_at: z.string(),
  inventories_cnt: z.number().int(),
  is_early_ended: DealIsEarlyEnded,
  remark: z.string().max(1024).nullable(),
  cover_title: z.string().max(128),
  cover_subtitle: z.string().max(128),
  cover_desc: z.string(),
  cover_d_img_url: z.string().max(128),
  cover_m_img_url: z.string().max(128),
  encore_no: z.number().int().nonnegative(),
  feature_orderby: z.string().max(32).nullable(),
  cover_timer_color: z.string().max(8).nullable(),
  cover_timer_bg_color: z.string().max(8).nullable(),
  cover_desc_bg_color: z.string().max(8).nullable(),
  cover_desc_text_color: z.string().max(8).nullable(),
  preorder_type: DealPreorderType,
  so_desc: z.string().nullable(),
  so_desc_bg_color: z.string().max(8).nullable(),
  so_content_d_img_url: z.string().max(256).nullable(),
  so_content_m_img_url: z.string().max(256).nullable(),
  so_cover_d_img_url: z.string().max(256).nullable(),
  so_cover_m_img_url: z.string().max(256).nullable(),
  orderno: z.number().int().nonnegative().nullable(),
  cover_list_img_url: z.string().max(256).nullable(),
  confirmed_at: z.string().nullable(),
  product_type: z.number().int(),
  product_total_cnt: z.number(),
});
export type DealSubsetA = z.infer<typeof DealSubsetA>;

export const DealSubsetP = z.object({
  id: z.number().int().nonnegative(),
  status: z.number().int(),
  type: DealType,
  title: z.string().max(128),
  seq_no: z.number().int().nonnegative(),
  seq_title: z.string().max(128),
  preorder_title: z.string().max(128),
  stock_date: z.string().max(10),
  warehousing_date: z.string().max(10),
  created_at: z.string(),
  sms_sent_at: z.string(),
  preorder_begin_at: z.string(),
  preorder_end_at: z.string(),
  inventories_cnt: z.number().int(),
  is_early_ended: DealIsEarlyEnded,
  remark: z.string().max(1024).nullable(),
  cover_title: z.string().max(128),
  cover_subtitle: z.string().max(128),
  cover_desc: z.string(),
  cover_d_img_url: z.string().max(128),
  cover_m_img_url: z.string().max(128),
  encore_no: z.number().int().nonnegative(),
  feature_orderby: z.string().max(32).nullable(),
  cover_timer_color: z.string().max(8).nullable(),
  cover_timer_bg_color: z.string().max(8).nullable(),
  cover_desc_bg_color: z.string().max(8).nullable(),
  cover_desc_text_color: z.string().max(8).nullable(),
  preorder_type: DealPreorderType,
  so_desc: z.string().nullable(),
  so_desc_bg_color: z.string().max(8).nullable(),
  so_content_d_img_url: z.string().max(256).nullable(),
  so_content_m_img_url: z.string().max(256).nullable(),
  so_cover_d_img_url: z.string().max(256).nullable(),
  so_cover_m_img_url: z.string().max(256).nullable(),
  orderno: z.number().int().nonnegative().nullable(),
  cover_list_img_url: z.string().max(256).nullable(),
  confirmed_at: z.string().nullable(),
  product_type: z.number().int(),
  product_total_cnt: z.number(),
  products: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      title: z.string().max(128),
      rep_img_url: z.string().max(128),
      price: z.number().int(),
      original_price: z.number().int(),
      total_current_stock: z.number().int(),
      season: ProductSeason,
      gender: ProductGender,
      rep_inventory_type: z.string().max(8).nullable(),
      flag: z.record(z.string(), z.boolean()),
      brand: z.object({
        name: z.string().max(128),
      }),
    })
  ),
});
export type DealSubsetP = z.infer<typeof DealSubsetP>;

export type DealSubsetMapping = {
  A: DealSubsetA;
  P: DealSubsetP;
};
export const DealSubsetKey = z.enum(["A", "P"]);
export type DealSubsetKey = z.infer<typeof DealSubsetKey>;

export const dealSubsetQueries: { [key in DealSubsetKey]: SubsetQuery } = {
  A: {
    select: [
      "deals.id",
      "deals.status",
      "deals.type",
      "deals.title",
      "deals.seq_no",
      "deals.seq_title",
      "deals.preorder_title",
      "deals.stock_date",
      "deals.warehousing_date",
      "deals.created_at",
      "deals.sms_sent_at",
      "deals.preorder_begin_at",
      "deals.preorder_end_at",
      "deals.inventories_cnt",
      "deals.is_early_ended",
      "deals.remark",
      "deals.cover_title",
      "deals.cover_subtitle",
      "deals.cover_desc",
      "deals.cover_d_img_url",
      "deals.cover_m_img_url",
      "deals.encore_no",
      "deals.feature_orderby",
      "deals.cover_timer_color",
      "deals.cover_timer_bg_color",
      "deals.cover_desc_bg_color",
      "deals.cover_desc_text_color",
      "deals.preorder_type",
      "deals.so_desc",
      "deals.so_desc_bg_color",
      "deals.so_content_d_img_url",
      "deals.so_content_m_img_url",
      "deals.so_cover_d_img_url",
      "deals.so_cover_m_img_url",
      "deals.orderno",
      "deals.cover_list_img_url",
      "deals.confirmed_at",
      "deals.product_type",
    ],
    virtual: ["product_total_cnt"],
    joins: [],
    loaders: [],
  },
  P: {
    select: [
      "deals.id",
      "deals.status",
      "deals.type",
      "deals.title",
      "deals.seq_no",
      "deals.seq_title",
      "deals.preorder_title",
      "deals.stock_date",
      "deals.warehousing_date",
      "deals.created_at",
      "deals.sms_sent_at",
      "deals.preorder_begin_at",
      "deals.preorder_end_at",
      "deals.inventories_cnt",
      "deals.is_early_ended",
      "deals.remark",
      "deals.cover_title",
      "deals.cover_subtitle",
      "deals.cover_desc",
      "deals.cover_d_img_url",
      "deals.cover_m_img_url",
      "deals.encore_no",
      "deals.feature_orderby",
      "deals.cover_timer_color",
      "deals.cover_timer_bg_color",
      "deals.cover_desc_bg_color",
      "deals.cover_desc_text_color",
      "deals.preorder_type",
      "deals.so_desc",
      "deals.so_desc_bg_color",
      "deals.so_content_d_img_url",
      "deals.so_content_m_img_url",
      "deals.so_cover_d_img_url",
      "deals.so_cover_m_img_url",
      "deals.orderno",
      "deals.cover_list_img_url",
      "deals.confirmed_at",
      "deals.product_type",
    ],
    virtual: ["product_total_cnt"],
    joins: [],
    loaders: [
      {
        as: "products",
        table: "products",
        manyJoin: { from: "deals.id", to: "products.deal_id" },
        oneJoins: [
          {
            as: "brand",
            join: "outer",
            table: "brands",
            from: "products.brand_id",
            to: "brand.id",
          },
        ],
        select: [
          "products.id",
          "products.title",
          "products.rep_img_url",
          "products.price",
          "products.original_price",
          "products.total_current_stock",
          "products.season",
          "products.gender",
          "products.rep_inventory_type",
          "brand.name as brand__name",
        ],
      },
    ],
  },
};
export type DealFieldExpr =
  | "id"
  | "status"
  | "type"
  | "title"
  | "seq_no"
  | "seq_title"
  | "preorder_title"
  | "stock_date"
  | "warehousing_date"
  | "created_at"
  | "sms_sent_at"
  | "preorder_begin_at"
  | "preorder_end_at"
  | "inventories_cnt"
  | "is_early_ended"
  | "remark"
  | "cover_title"
  | "cover_subtitle"
  | "cover_desc"
  | "cover_d_img_url"
  | "cover_m_img_url"
  | "encore_no"
  | "feature_orderby"
  | "cover_timer_color"
  | "cover_timer_bg_color"
  | "cover_desc_bg_color"
  | "cover_desc_text_color"
  | "preorder_type"
  | "so_desc"
  | "so_desc_bg_color"
  | "so_content_d_img_url"
  | "so_content_m_img_url"
  | "so_cover_d_img_url"
  | "so_cover_m_img_url"
  | "orderno"
  | "cover_list_img_url"
  | "confirmed_at"
  | "product_type"
  | "products.id"
  | "products.type"
  | "products.brand.id"
  | "products.brand.name"
  | "products.brand.orderno"
  | "products.brand.created_at"
  | "products.brand.official_site_italy"
  | "products.brand.official_site_int"
  | "products.brand.is_luxury"
  | "products.brand.margin_rate"
  | "products.brand.is_popular"
  | "products.brand.name_for_search"
  | "products.brand.name_ko"
  | "products.brand.desc"
  | "products.brand.admin_memo"
  | "products.brand.nv_search_type"
  | "products.brand.ignore_color"
  | "products.brand.picks_cnt"
  | "products.brand.products_cnt"
  | "products.brand.d_cover_img_url"
  | "products.brand.m_cover_img_url"
  | "products.brand.is_custompicked"
  | "products.brand.is_new"
  | "products.title"
  | "products.parsed_title"
  | "products.stock_type"
  | "products.description"
  | "products.rep_img_url"
  | "products.status"
  | "products.price"
  | "products.base_price"
  | "products.original_price"
  | "products.point_percentage"
  | "products.orders_cnt"
  | "products.order_items_cnt"
  | "products.orders_sum"
  | "products.logi.id"
  | "products.logi.title"
  | "products.logi.method"
  | "products.logi.logicompany.id"
  | "products.logi.logicompany.name"
  | "products.logi.logicompany.st_code"
  | "products.logi.base_fee"
  | "products.logi.added_fee"
  | "products.logi.free_price"
  | "products.logi.est_days"
  | "products.logi.created_at"
  | "products.exref.id"
  | "products.exref.title"
  | "products.exref.fee"
  | "products.exref.fee_text"
  | "products.exref.req_date_text"
  | "products.exref.restrict_text"
  | "products.exref.created_at"
  | "products.created_at"
  | "products.total_current_stock"
  | "products.main_category.id"
  | "products.main_category.prefix"
  | "products.main_category.name"
  | "products.main_category.name_ko"
  | "products.main_category.top.id"
  | "products.main_category.top.prefix"
  | "products.main_category.top.name"
  | "products.main_category.top.name_ko"
  | "products.main_category.top.top"
  | "products.main_category.top.parent"
  | "products.main_category.top.orderno"
  | "products.main_category.top.css_class"
  | "products.main_category.top.status"
  | "products.main_category.top.img_url"
  | "products.main_category.top.can_show_on_main"
  | "products.main_category.top.text"
  | "products.main_category.top.products_cnt"
  | "products.main_category.top.children"
  | "products.main_category.parent.id"
  | "products.main_category.parent.prefix"
  | "products.main_category.parent.name"
  | "products.main_category.parent.name_ko"
  | "products.main_category.parent.top"
  | "products.main_category.parent.parent"
  | "products.main_category.parent.orderno"
  | "products.main_category.parent.css_class"
  | "products.main_category.parent.status"
  | "products.main_category.parent.img_url"
  | "products.main_category.parent.can_show_on_main"
  | "products.main_category.parent.text"
  | "products.main_category.parent.products_cnt"
  | "products.main_category.parent.children"
  | "products.main_category.orderno"
  | "products.main_category.css_class"
  | "products.main_category.status"
  | "products.main_category.img_url"
  | "products.main_category.can_show_on_main"
  | "products.main_category.text"
  | "products.main_category.products_cnt"
  | "products.main_category.children.id"
  | "products.main_category.children.prefix"
  | "products.main_category.children.name"
  | "products.main_category.children.name_ko"
  | "products.main_category.children.top"
  | "products.main_category.children.parent"
  | "products.main_category.children.orderno"
  | "products.main_category.children.css_class"
  | "products.main_category.children.status"
  | "products.main_category.children.img_url"
  | "products.main_category.children.can_show_on_main"
  | "products.main_category.children.text"
  | "products.main_category.children.products_cnt"
  | "products.main_category.children.children"
  | "products.sub_category.id"
  | "products.sub_category.prefix"
  | "products.sub_category.name"
  | "products.sub_category.name_ko"
  | "products.sub_category.top.id"
  | "products.sub_category.top.prefix"
  | "products.sub_category.top.name"
  | "products.sub_category.top.name_ko"
  | "products.sub_category.top.top"
  | "products.sub_category.top.parent"
  | "products.sub_category.top.orderno"
  | "products.sub_category.top.css_class"
  | "products.sub_category.top.status"
  | "products.sub_category.top.img_url"
  | "products.sub_category.top.can_show_on_main"
  | "products.sub_category.top.text"
  | "products.sub_category.top.products_cnt"
  | "products.sub_category.top.children"
  | "products.sub_category.parent.id"
  | "products.sub_category.parent.prefix"
  | "products.sub_category.parent.name"
  | "products.sub_category.parent.name_ko"
  | "products.sub_category.parent.top"
  | "products.sub_category.parent.parent"
  | "products.sub_category.parent.orderno"
  | "products.sub_category.parent.css_class"
  | "products.sub_category.parent.status"
  | "products.sub_category.parent.img_url"
  | "products.sub_category.parent.can_show_on_main"
  | "products.sub_category.parent.text"
  | "products.sub_category.parent.products_cnt"
  | "products.sub_category.parent.children"
  | "products.sub_category.orderno"
  | "products.sub_category.css_class"
  | "products.sub_category.status"
  | "products.sub_category.img_url"
  | "products.sub_category.can_show_on_main"
  | "products.sub_category.text"
  | "products.sub_category.products_cnt"
  | "products.sub_category.children.id"
  | "products.sub_category.children.prefix"
  | "products.sub_category.children.name"
  | "products.sub_category.children.name_ko"
  | "products.sub_category.children.top"
  | "products.sub_category.children.parent"
  | "products.sub_category.children.orderno"
  | "products.sub_category.children.css_class"
  | "products.sub_category.children.status"
  | "products.sub_category.children.img_url"
  | "products.sub_category.children.can_show_on_main"
  | "products.sub_category.children.text"
  | "products.sub_category.children.products_cnt"
  | "products.sub_category.children.children"
  | "products.visited_cnt"
  | "products.reviews_cnt"
  | "products.is_testing"
  | "products.src_pcode"
  | "products.season"
  | "products.material"
  | "products.model_size"
  | "products.size"
  | "products.size_text"
  | "products.size_country"
  | "products.src_color"
  | "products.fitting_info"
  | "products.gender"
  | "products.unq_id"
  | "products.picks_cnt"
  | "products.recent_picks_cnt"
  | "products.bpc1"
  | "products.is_blevel"
  | "products.pcode_main"
  | "products.pcode_sub"
  | "products.color_code"
  | "products.color_text"
  | "products.new_flag"
  | "products.activated_at"
  | "products.activated_by"
  | "products.pcode_analyzed_at"
  | "products.pcode_analyzed_by"
  | "products.prate_top"
  | "products.need_modification"
  | "products.sizetable.id"
  | "products.sizetable.category.id"
  | "products.sizetable.category.prefix"
  | "products.sizetable.category.name"
  | "products.sizetable.category.name_ko"
  | "products.sizetable.category.top"
  | "products.sizetable.category.parent"
  | "products.sizetable.category.orderno"
  | "products.sizetable.category.css_class"
  | "products.sizetable.category.status"
  | "products.sizetable.category.img_url"
  | "products.sizetable.category.can_show_on_main"
  | "products.sizetable.category.text"
  | "products.sizetable.category.products_cnt"
  | "products.sizetable.category.children"
  | "products.sizetable.brand.id"
  | "products.sizetable.brand.name"
  | "products.sizetable.brand.orderno"
  | "products.sizetable.brand.created_at"
  | "products.sizetable.brand.official_site_italy"
  | "products.sizetable.brand.official_site_int"
  | "products.sizetable.brand.is_luxury"
  | "products.sizetable.brand.margin_rate"
  | "products.sizetable.brand.is_popular"
  | "products.sizetable.brand.name_for_search"
  | "products.sizetable.brand.name_ko"
  | "products.sizetable.brand.desc"
  | "products.sizetable.brand.admin_memo"
  | "products.sizetable.brand.nv_search_type"
  | "products.sizetable.brand.ignore_color"
  | "products.sizetable.brand.picks_cnt"
  | "products.sizetable.brand.products_cnt"
  | "products.sizetable.brand.d_cover_img_url"
  | "products.sizetable.brand.m_cover_img_url"
  | "products.sizetable.brand.is_custompicked"
  | "products.sizetable.brand.is_new"
  | "products.sizetable.gender"
  | "products.sizetable.contents.id"
  | "products.sizetable.contents.sizetable"
  | "products.sizetable.contents.standard"
  | "products.sizetable.contents.kr"
  | "products.sizetable.contents.eu"
  | "products.sizetable.contents.it"
  | "products.sizetable.contents.uk"
  | "products.sizetable.contents.fr"
  | "products.sizetable.contents.us"
  | "products.sizetable.contents.ger"
  | "products.sizetable.contents.waist_cm"
  | "products.sizetable.contents.waist_inch"
  | "products.sizetable.contents.cm"
  | "products.sizetable.contents.numerical"
  | "products.sizetable.contents.age"
  | "products.sizetable.contents.height_cm"
  | "products.sizetable.contents.height_inch"
  | "products.sizetable.contents.chest_cm"
  | "products.sizetable.contents.feet_mm"
  | "products.sizetable.contents.hip_cm"
  | "products.sizetable.contents.head_cm"
  | "products.sizetable.contents.weight_kg"
  | "products.sizetable.contents.orderno"
  | "products.score"
  | "products.rep_inventory_type"
  | "products.total_loss_cnt"
  | "products.min_expected_stock_at"
  | "products.last_base_price_verified_at"
  | "products.dps_cnt"
  | "products.src_category_name"
  | "products.origin_price_uk"
  | "products.origin_currency_uk"
  | "products.t200_price_uk"
  | "products.origin_price_fr"
  | "products.origin_currency_fr"
  | "products.t200_price_fr"
  | "products.origin_price_it"
  | "products.origin_currency_it"
  | "products.t200_price_it"
  | "products.new_badge_at"
  | "products.items.id"
  | "products.items.title"
  | "products.items.status"
  | "products.items.holding"
  | "products.items.current_inventory.id"
  | "products.items.current_inventory.product"
  | "products.items.current_inventory.product_item"
  | "products.items.current_inventory.created_at"
  | "products.items.current_inventory.invoice_at"
  | "products.items.current_inventory.expected_stock_at"
  | "products.items.current_inventory.stock_at"
  | "products.items.current_inventory.type"
  | "products.items.current_inventory.deal"
  | "products.items.current_inventory.active"
  | "products.items.current_inventory.memo"
  | "products.items.current_inventory.order_item"
  | "products.items.current_inventory.order_item_seq"
  | "products.items.current_inventory.dp_item"
  | "products.items.current_inventory.dp_item_seq"
  | "products.items.current_inventory.reason"
  | "products.items.current_inventory.ao_seq"
  | "products.items.current_inventory.ao_type"
  | "products.items.current_inventory.price"
  | "products.items.current_stock"
  | "products.items.converted_title"
  | "products.items.loss_cnt"
  | "products.items.origin_stock_uk"
  | "products.items.origin_stock_it"
  | "products.items.origin_stock_fr"
  | "products.items.max_stock"
  | "products.items.consumed_cnt"
  | "products.items.preorder_end_at"
  | "products.items.product_logi_expected_date"
  | "products.items.expected_stock_at"
  | "products.items.stock_at"
  | "products.items.current_location_key"
  | "products.images"
  | "products.flag"
  | "products.latest_deal_created_date_view"
  | "products.min_expected_stock_date"
  | "products.apc_full"
  | "products.is_picked"
  | "products.brand_is_custompicked"
  | "products.naver_search_link"
  | "products.is_season_order"
  | "products.country_code"
  | "products.country_code_ko"
  | "products.logi_expected_date"
  | "product_total_cnt";
