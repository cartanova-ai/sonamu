import { z } from "zod";
import { SubsetQuery, zArrayable } from "../../typeframe/shared";
import {
  PaymentType,
  PaymentStatus,
  PaymentSearchField,
  PaymentOrderBy,
} from "./payment.enums";

export const PaymentBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  type: PaymentType,
  order_id: z.number().int(),
  price: z.number().int(),
  cancelled_price: z.number().int().nonnegative(),
  status: PaymentStatus,
  imp_uid: z.string().max(64),
  imp_merchant_uid: z.string().max(128),
  imp_pg_provider: z.string().max(32),
  imp_pay_method: z.string().max(32),
  imp_card_name: z.string().max(64),
  imp_buyer_name: z.string().max(128),
  imp_buyer_tel: z.string().max(32),
  imp_buyer_email: z.string().max(128),
  imp_pg_tid: z.string().max(64),
  imp_apply_num: z.number().int().nonnegative(),
  imp_receipt_url: z.string().max(128),
  imp_status: z.string().max(16),
  imp_error_msg: z.string().max(128),
  imp_paid_at: z.string(),
  imp_cancel_reason: z.string().max(256),
  imp_cancel_receipt_url: z.string().max(256),
  imp_cancelled_at: z.string(),
  created_at: z.string(),
});
export type PaymentBaseSchema = z.infer<typeof PaymentBaseSchema>;
export const PaymentBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: PaymentSearchField,
    keyword: z.string(),
    orderBy: PaymentOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
    type: PaymentType,
    status: PaymentStatus,
  })
  .partial();
export type PaymentBaseListParams = z.infer<typeof PaymentBaseListParams>;

export const PaymentSubsetA = z.object({
  id: z.number().int().nonnegative(),
  type: PaymentType,
  price: z.number().int(),
  cancelled_price: z.number().int().nonnegative(),
  status: PaymentStatus,
  imp_uid: z.string().max(64),
  imp_merchant_uid: z.string().max(128),
  imp_pg_provider: z.string().max(32),
  imp_pay_method: z.string().max(32),
  imp_card_name: z.string().max(64),
  imp_buyer_name: z.string().max(128),
  imp_buyer_tel: z.string().max(32),
  imp_buyer_email: z.string().max(128),
  imp_pg_tid: z.string().max(64),
  imp_apply_num: z.number().int().nonnegative(),
  imp_receipt_url: z.string().max(128),
  imp_status: z.string().max(16),
  imp_error_msg: z.string().max(128),
  imp_paid_at: z.string(),
  imp_cancel_reason: z.string().max(256),
  imp_cancel_receipt_url: z.string().max(256),
  imp_cancelled_at: z.string(),
  created_at: z.string(),
  order_id: z.number().int().nonnegative(),
});
export type PaymentSubsetA = z.infer<typeof PaymentSubsetA>;

export const PaymentSubsetP = z.object({
  id: z.number().int().nonnegative(),
  type: PaymentType,
  price: z.number().int(),
  cancelled_price: z.number().int().nonnegative(),
  status: PaymentStatus,
  imp_uid: z.string().max(64),
  imp_merchant_uid: z.string().max(128),
  imp_pg_provider: z.string().max(32),
  imp_pay_method: z.string().max(32),
  imp_card_name: z.string().max(64),
  imp_buyer_name: z.string().max(128),
  imp_buyer_tel: z.string().max(32),
  imp_buyer_email: z.string().max(128),
  imp_pg_tid: z.string().max(64),
  imp_apply_num: z.number().int().nonnegative(),
  imp_receipt_url: z.string().max(128),
  imp_status: z.string().max(16),
  imp_error_msg: z.string().max(128),
  imp_paid_at: z.string(),
  imp_cancel_reason: z.string().max(256),
  imp_cancel_receipt_url: z.string().max(256),
  imp_cancelled_at: z.string(),
  created_at: z.string(),
  order_id: z.number().int().nonnegative(),
});
export type PaymentSubsetP = z.infer<typeof PaymentSubsetP>;

export type PaymentSubsetMapping = {
  A: PaymentSubsetA;
  P: PaymentSubsetP;
};
export const PaymentSubsetKey = z.enum(["A", "P"]);
export type PaymentSubsetKey = z.infer<typeof PaymentSubsetKey>;

export const paymentSubsetQueries: { [key in PaymentSubsetKey]: SubsetQuery } =
  {
    A: {
      select: [
        "payments.id",
        "payments.type",
        "payments.price",
        "payments.cancelled_price",
        "payments.status",
        "payments.imp_uid",
        "payments.imp_merchant_uid",
        "payments.imp_pg_provider",
        "payments.imp_pay_method",
        "payments.imp_card_name",
        "payments.imp_buyer_name",
        "payments.imp_buyer_tel",
        "payments.imp_buyer_email",
        "payments.imp_pg_tid",
        "payments.imp_apply_num",
        "payments.imp_receipt_url",
        "payments.imp_status",
        "payments.imp_error_msg",
        "payments.imp_paid_at",
        "payments.imp_cancel_reason",
        "payments.imp_cancel_receipt_url",
        "payments.imp_cancelled_at",
        "payments.created_at",
        "payments.order_id",
      ],
      virtual: [],
      joins: [],
      loaders: [],
    },
    P: {
      select: [
        "payments.id",
        "payments.type",
        "payments.price",
        "payments.cancelled_price",
        "payments.status",
        "payments.imp_uid",
        "payments.imp_merchant_uid",
        "payments.imp_pg_provider",
        "payments.imp_pay_method",
        "payments.imp_card_name",
        "payments.imp_buyer_name",
        "payments.imp_buyer_tel",
        "payments.imp_buyer_email",
        "payments.imp_pg_tid",
        "payments.imp_apply_num",
        "payments.imp_receipt_url",
        "payments.imp_status",
        "payments.imp_error_msg",
        "payments.imp_paid_at",
        "payments.imp_cancel_reason",
        "payments.imp_cancel_receipt_url",
        "payments.imp_cancelled_at",
        "payments.created_at",
        "payments.order_id",
      ],
      virtual: [],
      joins: [],
      loaders: [],
    },
  };
export type PaymentFieldExpr =
  | "id"
  | "type"
  | "order.id"
  | "order.order_type"
  | "order.payment_type"
  | "order.user.id"
  | "order.user.role"
  | "order.user.sns"
  | "order.user.string_id"
  | "order.user.email"
  | "order.user.pw"
  | "order.user.img_url"
  | "order.user.nickname"
  | "order.user.name"
  | "order.user.phone_number"
  | "order.user.gender"
  | "order.user.birthdate"
  | "order.user.birth_year"
  | "order.user.status"
  | "order.user.blocked_until"
  | "order.user.to_get_pushed"
  | "order.user.to_get_mail"
  | "order.user.to_get_sms"
  | "order.user.zipcode"
  | "order.user.address1"
  | "order.user.address2"
  | "order.user.created_at"
  | "order.user.withdraw_reason"
  | "order.user.level"
  | "order.user.address.id"
  | "order.user.address.user"
  | "order.user.address.title"
  | "order.user.address.name"
  | "order.user.address.address1"
  | "order.user.address.address2"
  | "order.user.address.zipcode"
  | "order.user.address.phone_number"
  | "order.user.address.comment"
  | "order.user.address.created_at"
  | "order.user.cartitem_cnt"
  | "order.user.payment_cnt"
  | "order.user.delivery_cnt"
  | "order.user.refund_or_exchange_cnt"
  | "order.user.point"
  | "order.user.used_point"
  | "order.user.expected_point"
  | "order.user.rtoken"
  | "order.user.ruser.id"
  | "order.user.ruser.role"
  | "order.user.ruser.sns"
  | "order.user.ruser.string_id"
  | "order.user.ruser.email"
  | "order.user.ruser.pw"
  | "order.user.ruser.img_url"
  | "order.user.ruser.nickname"
  | "order.user.ruser.name"
  | "order.user.ruser.phone_number"
  | "order.user.ruser.gender"
  | "order.user.ruser.birthdate"
  | "order.user.ruser.birth_year"
  | "order.user.ruser.status"
  | "order.user.ruser.blocked_until"
  | "order.user.ruser.to_get_pushed"
  | "order.user.ruser.to_get_mail"
  | "order.user.ruser.to_get_sms"
  | "order.user.ruser.zipcode"
  | "order.user.ruser.address1"
  | "order.user.ruser.address2"
  | "order.user.ruser.created_at"
  | "order.user.ruser.withdraw_reason"
  | "order.user.ruser.level"
  | "order.user.ruser.address"
  | "order.user.ruser.cartitem_cnt"
  | "order.user.ruser.payment_cnt"
  | "order.user.ruser.delivery_cnt"
  | "order.user.ruser.refund_or_exchange_cnt"
  | "order.user.ruser.point"
  | "order.user.ruser.used_point"
  | "order.user.ruser.expected_point"
  | "order.user.ruser.rtoken"
  | "order.user.ruser.ruser"
  | "order.user.ruser.withdraw_at"
  | "order.user.ruser.picks_cnt"
  | "order.user.ruser.pick_guide_sent_at"
  | "order.user.ruser.paid_orders_cnt"
  | "order.user.ruser.to_get_stock_sms"
  | "order.user.ruser.to_get_event_sms"
  | "order.user.ruser.marked_last_visited_at"
  | "order.user.ruser.point_calculated_at"
  | "order.user.ruser.tagging"
  | "order.user.ruser.addresses"
  | "order.user.withdraw_at"
  | "order.user.picks_cnt"
  | "order.user.pick_guide_sent_at"
  | "order.user.paid_orders_cnt"
  | "order.user.to_get_stock_sms"
  | "order.user.to_get_event_sms"
  | "order.user.marked_last_visited_at"
  | "order.user.point_calculated_at"
  | "order.user.tagging"
  | "order.user.addresses.id"
  | "order.user.addresses.user"
  | "order.user.addresses.title"
  | "order.user.addresses.name"
  | "order.user.addresses.address1"
  | "order.user.addresses.address2"
  | "order.user.addresses.zipcode"
  | "order.user.addresses.phone_number"
  | "order.user.addresses.comment"
  | "order.user.addresses.created_at"
  | "order.total_price"
  | "order.used_point"
  | "order.o_name"
  | "order.o_phone_number"
  | "order.d_name"
  | "order.d_phone_number"
  | "order.d_zipcode"
  | "order.d_address1"
  | "order.d_address2"
  | "order.d_comment"
  | "order.p101_name"
  | "order.p101_acct_bank"
  | "order.p101_acct_no"
  | "order.p101_refund_acct_bank"
  | "order.p101_refund_acct_no"
  | "order.p101_cr_type"
  | "order.p101_cr_key"
  | "order.created_at"
  | "order.last_notified_at"
  | "order.cr_issued_at"
  | "order.cs_notes_json"
  | "order.schannel.id"
  | "order.schannel.type"
  | "order.schannel.name"
  | "order.schannel.img_url"
  | "order.schannel.address"
  | "order.schannel.balance_type"
  | "order.schannel.balance_period"
  | "order.schannel.balance_unit"
  | "order.schannel.selling_commission"
  | "order.schannel.status"
  | "order.schannel.memo"
  | "order.product_sum"
  | "order.logi_sum"
  | "order.canceled_sum"
  | "order.success_sum"
  | "order.penalty_payment_type"
  | "order.ext_balanced_at"
  | "order.items.id"
  | "order.items.product.id"
  | "order.items.product.type"
  | "order.items.product.brand"
  | "order.items.product.title"
  | "order.items.product.parsed_title"
  | "order.items.product.stock_type"
  | "order.items.product.description"
  | "order.items.product.rep_img_url"
  | "order.items.product.status"
  | "order.items.product.price"
  | "order.items.product.base_price"
  | "order.items.product.original_price"
  | "order.items.product.point_percentage"
  | "order.items.product.orders_cnt"
  | "order.items.product.order_items_cnt"
  | "order.items.product.orders_sum"
  | "order.items.product.logi"
  | "order.items.product.exref"
  | "order.items.product.created_at"
  | "order.items.product.total_current_stock"
  | "order.items.product.main_category"
  | "order.items.product.sub_category"
  | "order.items.product.visited_cnt"
  | "order.items.product.reviews_cnt"
  | "order.items.product.is_testing"
  | "order.items.product.src_pcode"
  | "order.items.product.season"
  | "order.items.product.material"
  | "order.items.product.model_size"
  | "order.items.product.size"
  | "order.items.product.size_text"
  | "order.items.product.size_country"
  | "order.items.product.src_color"
  | "order.items.product.fitting_info"
  | "order.items.product.gender"
  | "order.items.product.unq_id"
  | "order.items.product.first_deal"
  | "order.items.product.latest_deal"
  | "order.items.product.picks_cnt"
  | "order.items.product.recent_picks_cnt"
  | "order.items.product.bpc1"
  | "order.items.product.is_blevel"
  | "order.items.product.pcode_main"
  | "order.items.product.pcode_sub"
  | "order.items.product.color_code"
  | "order.items.product.color_text"
  | "order.items.product.new_flag"
  | "order.items.product.activated_at"
  | "order.items.product.activated_by"
  | "order.items.product.pcode_analyzed_at"
  | "order.items.product.pcode_analyzed_by"
  | "order.items.product.prate_top"
  | "order.items.product.need_modification"
  | "order.items.product.sizetable"
  | "order.items.product.score"
  | "order.items.product.rep_inventory_type"
  | "order.items.product.total_loss_cnt"
  | "order.items.product.min_expected_stock_at"
  | "order.items.product.last_base_price_verified_at"
  | "order.items.product.dps_cnt"
  | "order.items.product.src_category_name"
  | "order.items.product.origin_price_uk"
  | "order.items.product.origin_currency_uk"
  | "order.items.product.t200_price_uk"
  | "order.items.product.origin_price_fr"
  | "order.items.product.origin_currency_fr"
  | "order.items.product.t200_price_fr"
  | "order.items.product.origin_price_it"
  | "order.items.product.origin_currency_it"
  | "order.items.product.t200_price_it"
  | "order.items.product.new_badge_at"
  | "order.items.product.items"
  | "order.items.product.images"
  | "order.items.product.flag"
  | "order.items.product.latest_deal_created_date_view"
  | "order.items.product.min_expected_stock_date"
  | "order.items.product.apc_full"
  | "order.items.product.is_picked"
  | "order.items.product.brand_is_custompicked"
  | "order.items.product.naver_search_link"
  | "order.items.product.is_season_order"
  | "order.items.product.country_code"
  | "order.items.product.country_code_ko"
  | "order.items.product.logi_expected_date"
  | "order.items.product_item.id"
  | "order.items.product_item.product"
  | "order.items.product_item.title"
  | "order.items.product_item.status"
  | "order.items.product_item.holding"
  | "order.items.product_item.current_inventory"
  | "order.items.product_item.current_stock"
  | "order.items.product_item.converted_title"
  | "order.items.product_item.loss_cnt"
  | "order.items.product_item.origin_stock_uk"
  | "order.items.product_item.origin_stock_it"
  | "order.items.product_item.origin_stock_fr"
  | "order.items.product_item.max_stock"
  | "order.items.product_item.consumed_cnt"
  | "order.items.product_item.preorder_end_at"
  | "order.items.product_item.product_logi_expected_date"
  | "order.items.product_item.expected_stock_at"
  | "order.items.product_item.stock_at"
  | "order.items.product_item.current_location_key"
  | "order.items.item_price"
  | "order.items.cnt"
  | "order.items.item_sum"
  | "order.items.cartitem.id"
  | "order.items.cartitem.user"
  | "order.items.cartitem.product"
  | "order.items.cartitem.item"
  | "order.items.cartitem.item_price"
  | "order.items.cartitem.cnt"
  | "order.items.cartitem.created_at"
  | "order.items.inventory_type"
  | "order.items.inventory_deal.id"
  | "order.items.inventory_deal.status"
  | "order.items.inventory_deal.type"
  | "order.items.inventory_deal.title"
  | "order.items.inventory_deal.seq_no"
  | "order.items.inventory_deal.seq_title"
  | "order.items.inventory_deal.preorder_title"
  | "order.items.inventory_deal.stock_date"
  | "order.items.inventory_deal.warehousing_date"
  | "order.items.inventory_deal.created_at"
  | "order.items.inventory_deal.sms_sent_at"
  | "order.items.inventory_deal.preorder_begin_at"
  | "order.items.inventory_deal.preorder_end_at"
  | "order.items.inventory_deal.inventories_cnt"
  | "order.items.inventory_deal.is_early_ended"
  | "order.items.inventory_deal.remark"
  | "order.items.inventory_deal.cover_title"
  | "order.items.inventory_deal.cover_subtitle"
  | "order.items.inventory_deal.cover_desc"
  | "order.items.inventory_deal.cover_d_img_url"
  | "order.items.inventory_deal.cover_m_img_url"
  | "order.items.inventory_deal.encore_no"
  | "order.items.inventory_deal.feature_orderby"
  | "order.items.inventory_deal.cover_timer_color"
  | "order.items.inventory_deal.cover_timer_bg_color"
  | "order.items.inventory_deal.cover_desc_bg_color"
  | "order.items.inventory_deal.cover_desc_text_color"
  | "order.items.inventory_deal.preorder_type"
  | "order.items.inventory_deal.so_desc"
  | "order.items.inventory_deal.so_desc_bg_color"
  | "order.items.inventory_deal.so_content_d_img_url"
  | "order.items.inventory_deal.so_content_m_img_url"
  | "order.items.inventory_deal.so_cover_d_img_url"
  | "order.items.inventory_deal.so_cover_m_img_url"
  | "order.items.inventory_deal.orderno"
  | "order.items.inventory_deal.cover_list_img_url"
  | "order.items.inventory_deal.confirmed_at"
  | "order.items.inventory_deal.product_type"
  | "order.items.inventory_deal.products"
  | "order.items.inventory_deal.product_total_cnt"
  | "order.items.logi.id"
  | "order.items.logi.title"
  | "order.items.logi.method"
  | "order.items.logi.logicompany"
  | "order.items.logi.base_fee"
  | "order.items.logi.added_fee"
  | "order.items.logi.free_price"
  | "order.items.logi.est_days"
  | "order.items.logi.created_at"
  | "order.items.logi_key"
  | "order.items.status"
  | "order.items.earned_point"
  | "order.items.earned_point_to_consume"
  | "order.items.logi_completed_at"
  | "order.items.canceled_at"
  | "order.items.canceled_by"
  | "order.items.canceled_reason"
  | "order.items.exrefreq.id"
  | "order.items.exrefreq.type"
  | "order.items.exrefreq.reason"
  | "order.items.exrefreq.order"
  | "order.items.exrefreq.product"
  | "order.items.exrefreq.desc"
  | "order.items.exrefreq.created_at"
  | "order.items.exrefreq.accepted_at"
  | "order.items.exrefreq.images"
  | "order.items.penalty_fee"
  | "order.items.refund_amount"
  | "order.items.loss_replacement"
  | "order.items.restock_cs"
  | "order.items.wtcard.id"
  | "order.items.wtcard.unq_code"
  | "order.items.wtcard.product"
  | "order.items.wtcard.rep_img_url"
  | "order.items.wtcard.status"
  | "order.items.wtcard.note"
  | "order.items.wtcard.created_at"
  | "order.items.wtcard.order_item"
  | "order.items.wtcard.is_smdutyfree"
  | "order.items.wtcard.images"
  | "order.items.inventory.id"
  | "order.items.inventory.product"
  | "order.items.inventory.product_item"
  | "order.items.inventory.created_at"
  | "order.items.inventory.invoice_at"
  | "order.items.inventory.expected_stock_at"
  | "order.items.inventory.stock_at"
  | "order.items.inventory.type"
  | "order.items.inventory.deal"
  | "order.items.inventory.active"
  | "order.items.inventory.memo"
  | "order.items.inventory.order_item"
  | "order.items.inventory.order_item_seq"
  | "order.items.inventory.dp_item"
  | "order.items.inventory.dp_item_seq"
  | "order.items.inventory.reason"
  | "order.items.inventory.ao_seq"
  | "order.items.inventory.ao_type"
  | "order.items.inventory.price"
  | "order.items.review.id"
  | "order.items.review.order"
  | "order.items.review.product"
  | "order.items.review.parent"
  | "order.items.review.user"
  | "order.items.review.rating"
  | "order.items.review.content"
  | "order.items.review.answer"
  | "order.items.review.rep_img_url"
  | "order.items.review.images_cnt"
  | "order.items.review.status"
  | "order.items.review.height"
  | "order.items.review.weight"
  | "order.items.review.size"
  | "order.items.review.size2"
  | "order.items.review.created_at"
  | "order.items.review.answered_at"
  | "order.items.review.is_admin"
  | "order.items.review.admin_name"
  | "order.items.review.sns_url"
  | "order.items.review.images"
  | "order.no"
  | "order.product_title_summary"
  | "price"
  | "cancelled_price"
  | "status"
  | "imp_uid"
  | "imp_merchant_uid"
  | "imp_pg_provider"
  | "imp_pay_method"
  | "imp_card_name"
  | "imp_buyer_name"
  | "imp_buyer_tel"
  | "imp_buyer_email"
  | "imp_pg_tid"
  | "imp_apply_num"
  | "imp_receipt_url"
  | "imp_status"
  | "imp_error_msg"
  | "imp_paid_at"
  | "imp_cancel_reason"
  | "imp_cancel_receipt_url"
  | "imp_cancelled_at"
  | "created_at";
