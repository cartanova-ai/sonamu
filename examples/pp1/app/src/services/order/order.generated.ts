import { z } from "zod";
import { SubsetQuery, zArrayable } from "../../typeframe/shared";
import {
  OrderType,
  OrderPenaltyPaymentType,
  OrderItemStatus,
  OrderSearchField,
  OrderOrderBy,
} from "./order.enums";
import { PaymentType } from "../payment/payment.enums";
import { SchannelType } from "../schannel/schannel.enums";
import {
  ProductStockType,
  ProductStatus,
  ProductSeason,
  ProductGender,
  ProductItemStatus,
} from "../product/product.enums";
import { ExrefreqType } from "../exrefreq/exrefreq.enums";

export const OrderBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  order_type: OrderType,
  payment_type: PaymentType,
  user_id: z.number().int(),
  total_price: z.number().int(),
  used_point: z.number().int().nonnegative(),
  o_name: z.string().max(32),
  o_phone_number: z.string().max(32),
  d_name: z.string().max(32),
  d_phone_number: z.string().max(32),
  d_zipcode: z.string().max(8),
  d_address1: z.string().max(128),
  d_address2: z.string().max(128),
  d_comment: z.string().max(512),
  p101_name: z.string().max(64).nullable(),
  p101_acct_bank: z.string().max(32).nullable(),
  p101_acct_no: z.string().max(64).nullable(),
  p101_refund_acct_bank: z.string().max(32).nullable(),
  p101_refund_acct_no: z.string().max(64).nullable(),
  p101_cr_type: z.string().max(8).nullable(),
  p101_cr_key: z.string().max(64).nullable(),
  created_at: z.string(),
  last_notified_at: z.string(),
  cr_issued_at: z.string(),
  cs_notes_json: z.string().nullable(),
  schannel_id: z.number().int(),
  product_sum: z.number().int(),
  logi_sum: z.number().int(),
  canceled_sum: z.number().int().nullable(),
  success_sum: z.number().int().nullable(),
  penalty_payment_type: OrderPenaltyPaymentType.nullable(),
  ext_balanced_at: z.string(),
  // items: HasMany OrderItem
  no: z.string(),
  product_title_summary: z.string(),
});
export type OrderBaseSchema = z.infer<typeof OrderBaseSchema>;
export const OrderItemBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  order_id: z.number().int(),
  product_id: z.number().int(),
  product_item_id: z.number().int(),
  item_price: z.number().int(),
  cnt: z.number().int().nonnegative(),
  item_sum: z.number().int().nonnegative(),
  cartitem_id: z.number().int(),
  inventory_type: z.number().int().nonnegative().nullable(),
  inventory_deal_id: z.number().int(),
  logi_id: z.number().int(),
  logi_key: z.string().max(32).nullable(),
  status: OrderItemStatus.nullable(),
  earned_point: z.number().int(),
  earned_point_to_consume: z.number().int(),
  logi_completed_at: z.string().nullable(),
  canceled_at: z.string().nullable(),
  canceled_by: z.number().int().nullable(),
  canceled_reason: z.string().max(32).nullable(),
  exrefreq_id: z.number().int(),
  penalty_fee: z.number().int().nullable(),
  refund_amount: z.number().int().nullable(),
  loss_replacement: z.number().int().nullable(),
  restock_cs: z.number().int().nullable(),
  // wtcard: OneToOne Wtcard
  inventory_id: z.number().int(),
  review_id: z.number().int().nullable(),
});
export type OrderItemBaseSchema = z.infer<typeof OrderItemBaseSchema>;
export const OrderBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: OrderSearchField,
    keyword: z.string(),
    orderBy: OrderOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
    order_type: OrderType,
    payment_type: PaymentType,
    penalty_payment_type: OrderPenaltyPaymentType.nullable(),
  })
  .partial();
export type OrderBaseListParams = z.infer<typeof OrderBaseListParams>;

export const OrderSubsetA = z.object({
  id: z.number().int().nonnegative(),
  order_type: OrderType,
  payment_type: PaymentType,
  total_price: z.number().int(),
  used_point: z.number().int().nonnegative(),
  o_name: z.string().max(32),
  o_phone_number: z.string().max(32),
  d_name: z.string().max(32),
  d_phone_number: z.string().max(32),
  d_zipcode: z.string().max(8),
  d_address1: z.string().max(128),
  d_address2: z.string().max(128),
  d_comment: z.string().max(512),
  p101_name: z.string().max(64).nullable(),
  p101_acct_bank: z.string().max(32).nullable(),
  p101_acct_no: z.string().max(64).nullable(),
  p101_refund_acct_bank: z.string().max(32).nullable(),
  p101_refund_acct_no: z.string().max(64).nullable(),
  p101_cr_type: z.string().max(8).nullable(),
  p101_cr_key: z.string().max(64).nullable(),
  created_at: z.string(),
  last_notified_at: z.string(),
  cr_issued_at: z.string(),
  cs_notes_json: z.string().nullable(),
  product_sum: z.number().int(),
  logi_sum: z.number().int(),
  canceled_sum: z.number().int().nullable(),
  success_sum: z.number().int().nullable(),
  penalty_payment_type: OrderPenaltyPaymentType.nullable(),
  ext_balanced_at: z.string(),
  user: z.object({
    id: z.number().int().nonnegative(),
    name: z.string().max(128),
    phone_number: z.string().max(32),
    point: z.number().int().nonnegative(),
  }),
  schannel: z.object({
    id: z.number().int().nonnegative(),
    type: SchannelType,
    name: z.string().max(128),
  }),
  items: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      item_price: z.number().int(),
      cnt: z.number().int().nonnegative(),
      item_sum: z.number().int().nonnegative(),
      inventory_type: z.number().int().nonnegative().nullable(),
      logi_key: z.string().max(32).nullable(),
      status: OrderItemStatus.nullable(),
      earned_point: z.number().int(),
      earned_point_to_consume: z.number().int(),
      logi_completed_at: z.string().nullable(),
      canceled_at: z.string().nullable(),
      canceled_by: z.number().int().nullable(),
      canceled_reason: z.string().max(32).nullable(),
      penalty_fee: z.number().int().nullable(),
      refund_amount: z.number().int().nullable(),
      loss_replacement: z.number().int().nullable(),
      restock_cs: z.number().int().nullable(),
      product: z.object({
        id: z.number().int().nonnegative(),
        title: z.string().max(128),
        parsed_title: z.string().max(256),
        stock_type: ProductStockType,
        description: z.string().nullable(),
        rep_img_url: z.string().max(128),
        status: ProductStatus,
        price: z.number().int(),
        base_price: z.number().int().nonnegative().nullable(),
        original_price: z.number().int(),
        point_percentage: z.number().int().nonnegative(),
        orders_cnt: z.number().int().nonnegative(),
        order_items_cnt: z.number().int().nonnegative(),
        orders_sum: z.number().int().nonnegative(),
        created_at: z.string(),
        total_current_stock: z.number().int(),
        src_pcode: z.string().max(64),
        season: ProductSeason,
        material: z.string().max(256),
        model_size: z.string().max(128),
        size: z.string().max(128),
        size_text: z.string().max(192),
        size_country: z.string().max(2),
        src_color: z.string().max(64),
        fitting_info: z.string().max(256).nullable(),
        gender: ProductGender,
        unq_id: z.string().max(512),
        brand: z.object({
          id: z.number().int().nonnegative(),
          name: z.string().max(128),
        }),
        logi: z.object({
          id: z.number().int().nonnegative(),
          title: z.string().max(64),
        }),
        exref: z.object({
          id: z.number().int().nonnegative(),
          title: z.string().max(64),
        }),
        main_category: z.object({
          id: z.number().int().nonnegative(),
          name: z.string().max(128),
          name_ko: z.string().max(128),
        }),
        sub_category: z.object({
          id: z.number().int().nonnegative(),
          name: z.string().max(128),
          name_ko: z.string().max(128),
        }),
      }),
      product_item: z.object({
        product_id: z.number().int().nonnegative(),
        title: z.string().max(128),
        status: ProductItemStatus,
        holding: z.number().int().nonnegative(),
        current_stock: z.number().int(),
        converted_title: z.string().max(128),
        current_inventory: z.object({
          id: z.number().int().nonnegative(),
          price: z.number().int().nonnegative(),
        }),
      }),
      inventory_deal_id: z.number().int().nonnegative(),
      exrefreq: z.object({
        id: z.number().int().nonnegative(),
        type: ExrefreqType,
        reason: z.number().int(),
        desc: z.string().max(4096),
        created_at: z.string(),
        accepted_at: z.string(),
        images: z.array(z.string()),
      }),
    })
  ),
});
export type OrderSubsetA = z.infer<typeof OrderSubsetA>;

export const OrderSubsetPL = z.object({
  id: z.number().int().nonnegative(),
  order_type: OrderType,
  payment_type: PaymentType,
  total_price: z.number().int(),
  used_point: z.number().int().nonnegative(),
  o_name: z.string().max(32),
  o_phone_number: z.string().max(32),
  d_name: z.string().max(32),
  d_phone_number: z.string().max(32),
  d_zipcode: z.string().max(8),
  d_address1: z.string().max(128),
  d_address2: z.string().max(128),
  d_comment: z.string().max(512),
  p101_name: z.string().max(64).nullable(),
  p101_acct_bank: z.string().max(32).nullable(),
  p101_acct_no: z.string().max(64).nullable(),
  p101_refund_acct_bank: z.string().max(32).nullable(),
  p101_refund_acct_no: z.string().max(64).nullable(),
  p101_cr_type: z.string().max(8).nullable(),
  p101_cr_key: z.string().max(64).nullable(),
  created_at: z.string(),
  last_notified_at: z.string(),
  cr_issued_at: z.string(),
  cs_notes_json: z.string().nullable(),
  product_sum: z.number().int(),
  logi_sum: z.number().int(),
  canceled_sum: z.number().int().nullable(),
  success_sum: z.number().int().nullable(),
  penalty_payment_type: OrderPenaltyPaymentType.nullable(),
  ext_balanced_at: z.string(),
  no: z.string(),
  user: z.object({
    id: z.number().int().nonnegative(),
    name: z.string().max(128),
    phone_number: z.string().max(32),
    point: z.number().int().nonnegative(),
  }),
  schannel: z.object({
    id: z.number().int().nonnegative(),
    type: SchannelType,
    name: z.string().max(128),
  }),
  items: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      item_price: z.number().int(),
      cnt: z.number().int().nonnegative(),
      item_sum: z.number().int().nonnegative(),
      inventory_type: z.number().int().nonnegative().nullable(),
      logi_key: z.string().max(32).nullable(),
      status: OrderItemStatus.nullable(),
      earned_point: z.number().int(),
      earned_point_to_consume: z.number().int(),
      logi_completed_at: z.string().nullable(),
      canceled_at: z.string().nullable(),
      canceled_by: z.number().int().nullable(),
      canceled_reason: z.string().max(32).nullable(),
      penalty_fee: z.number().int().nullable(),
      refund_amount: z.number().int().nullable(),
      loss_replacement: z.number().int().nullable(),
      restock_cs: z.number().int().nullable(),
      product: z.object({
        id: z.number().int().nonnegative(),
        title: z.string().max(128),
        parsed_title: z.string().max(256),
        stock_type: ProductStockType,
        description: z.string().nullable(),
        rep_img_url: z.string().max(128),
        status: ProductStatus,
        price: z.number().int(),
        base_price: z.number().int().nonnegative().nullable(),
        original_price: z.number().int(),
        point_percentage: z.number().int().nonnegative(),
        orders_cnt: z.number().int().nonnegative(),
        order_items_cnt: z.number().int().nonnegative(),
        orders_sum: z.number().int().nonnegative(),
        created_at: z.string(),
        total_current_stock: z.number().int(),
        src_pcode: z.string().max(64),
        season: ProductSeason,
        material: z.string().max(256),
        model_size: z.string().max(128),
        size: z.string().max(128),
        size_text: z.string().max(192),
        size_country: z.string().max(2),
        src_color: z.string().max(64),
        fitting_info: z.string().max(256).nullable(),
        gender: ProductGender,
        unq_id: z.string().max(512),
        brand: z.object({
          id: z.number().int().nonnegative(),
          name: z.string().max(128),
        }),
        logi: z.object({
          id: z.number().int().nonnegative(),
          title: z.string().max(64),
        }),
        exref: z.object({
          id: z.number().int().nonnegative(),
          title: z.string().max(64),
        }),
        main_category: z.object({
          id: z.number().int().nonnegative(),
          name: z.string().max(128),
          name_ko: z.string().max(128),
        }),
        sub_category: z.object({
          id: z.number().int().nonnegative(),
          name: z.string().max(128),
          name_ko: z.string().max(128),
        }),
      }),
      product_item: z.object({
        id: z.number().int().nonnegative(),
        title: z.string().max(128),
        status: ProductItemStatus,
        holding: z.number().int().nonnegative(),
        current_stock: z.number().int(),
        converted_title: z.string().max(128),
        current_inventory: z.object({
          id: z.number().int().nonnegative(),
          price: z.number().int().nonnegative(),
        }),
      }),
      inventory_deal_id: z.number().int().nonnegative(),
      exrefreq: z.object({
        id: z.number().int().nonnegative(),
        type: ExrefreqType,
        reason: z.number().int(),
        desc: z.string().max(4096),
        created_at: z.string(),
        accepted_at: z.string(),
        images: z.array(z.string()),
      }),
    })
  ),
});
export type OrderSubsetPL = z.infer<typeof OrderSubsetPL>;

export const OrderSubsetPD = z.object({
  id: z.number().int().nonnegative(),
  order_type: OrderType,
  payment_type: PaymentType,
  total_price: z.number().int(),
  used_point: z.number().int().nonnegative(),
  o_name: z.string().max(32),
  o_phone_number: z.string().max(32),
  d_name: z.string().max(32),
  d_phone_number: z.string().max(32),
  d_zipcode: z.string().max(8),
  d_address1: z.string().max(128),
  d_address2: z.string().max(128),
  d_comment: z.string().max(512),
  p101_name: z.string().max(64).nullable(),
  p101_acct_bank: z.string().max(32).nullable(),
  p101_acct_no: z.string().max(64).nullable(),
  p101_refund_acct_bank: z.string().max(32).nullable(),
  p101_refund_acct_no: z.string().max(64).nullable(),
  p101_cr_type: z.string().max(8).nullable(),
  p101_cr_key: z.string().max(64).nullable(),
  created_at: z.string(),
  last_notified_at: z.string(),
  cr_issued_at: z.string(),
  cs_notes_json: z.string().nullable(),
  product_sum: z.number().int(),
  logi_sum: z.number().int(),
  canceled_sum: z.number().int().nullable(),
  success_sum: z.number().int().nullable(),
  penalty_payment_type: OrderPenaltyPaymentType.nullable(),
  ext_balanced_at: z.string(),
  no: z.string(),
  product_title_summary: z.string(),
  user: z.object({
    id: z.number().int().nonnegative(),
    name: z.string().max(128),
    phone_number: z.string().max(32),
    point: z.number().int().nonnegative(),
  }),
  schannel: z.object({
    id: z.number().int().nonnegative(),
    type: SchannelType,
    name: z.string().max(128),
  }),
  items: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      item_price: z.number().int(),
      cnt: z.number().int().nonnegative(),
      item_sum: z.number().int().nonnegative(),
      inventory_type: z.number().int().nonnegative().nullable(),
      logi_key: z.string().max(32).nullable(),
      status: OrderItemStatus.nullable(),
      earned_point: z.number().int(),
      earned_point_to_consume: z.number().int(),
      logi_completed_at: z.string().nullable(),
      canceled_at: z.string().nullable(),
      canceled_by: z.number().int().nullable(),
      canceled_reason: z.string().max(32).nullable(),
      penalty_fee: z.number().int().nullable(),
      refund_amount: z.number().int().nullable(),
      loss_replacement: z.number().int().nullable(),
      restock_cs: z.number().int().nullable(),
      product: z.object({
        id: z.number().int().nonnegative(),
        title: z.string().max(128),
        parsed_title: z.string().max(256),
        stock_type: ProductStockType,
        description: z.string().nullable(),
        rep_img_url: z.string().max(128),
        status: ProductStatus,
        price: z.number().int(),
        base_price: z.number().int().nonnegative().nullable(),
        original_price: z.number().int(),
        point_percentage: z.number().int().nonnegative(),
        orders_cnt: z.number().int().nonnegative(),
        order_items_cnt: z.number().int().nonnegative(),
        orders_sum: z.number().int().nonnegative(),
        created_at: z.string(),
        total_current_stock: z.number().int(),
        src_pcode: z.string().max(64),
        season: ProductSeason,
        material: z.string().max(256),
        model_size: z.string().max(128),
        size: z.string().max(128),
        size_text: z.string().max(192),
        size_country: z.string().max(2),
        src_color: z.string().max(64),
        fitting_info: z.string().max(256).nullable(),
        gender: ProductGender,
        unq_id: z.string().max(512),
        logi_expected_date: z.string().nullable(),
        brand: z.object({
          id: z.number().int().nonnegative(),
          name: z.string().max(128),
        }),
        logi: z.object({
          id: z.number().int().nonnegative(),
          title: z.string().max(64),
        }),
        exref: z.object({
          id: z.number().int().nonnegative(),
          title: z.string().max(64),
        }),
        main_category: z.object({
          id: z.number().int().nonnegative(),
          name: z.string().max(128),
          name_ko: z.string().max(128),
        }),
        sub_category: z.object({
          id: z.number().int().nonnegative(),
          name: z.string().max(128),
          name_ko: z.string().max(128),
        }),
      }),
      product_item: z.object({
        id: z.number().int().nonnegative(),
        title: z.string().max(128),
        status: ProductItemStatus,
        holding: z.number().int().nonnegative(),
        current_stock: z.number().int(),
        converted_title: z.string().max(128),
        current_inventory: z.object({
          id: z.number().int().nonnegative(),
          price: z.number().int().nonnegative(),
        }),
      }),
      inventory_deal_id: z.number().int().nonnegative(),
      exrefreq: z.object({
        id: z.number().int().nonnegative(),
        type: ExrefreqType,
        reason: z.number().int(),
        desc: z.string().max(4096),
        created_at: z.string(),
        accepted_at: z.string(),
        images: z.array(z.string()),
      }),
      inventory: z.object({
        expected_stock_at: z.string(),
      }),
      review_id: z.number().int().nonnegative().nullable(),
    })
  ),
});
export type OrderSubsetPD = z.infer<typeof OrderSubsetPD>;

export type OrderSubsetMapping = {
  A: OrderSubsetA;
  PL: OrderSubsetPL;
  PD: OrderSubsetPD;
};
export const OrderSubsetKey = z.enum(["A", "PL", "PD"]);
export type OrderSubsetKey = z.infer<typeof OrderSubsetKey>;

export const orderSubsetQueries: { [key in OrderSubsetKey]: SubsetQuery } = {
  A: {
    select: [
      "orders.id",
      "orders.order_type",
      "orders.payment_type",
      "orders.total_price",
      "orders.used_point",
      "orders.o_name",
      "orders.o_phone_number",
      "orders.d_name",
      "orders.d_phone_number",
      "orders.d_zipcode",
      "orders.d_address1",
      "orders.d_address2",
      "orders.d_comment",
      "orders.p101_name",
      "orders.p101_acct_bank",
      "orders.p101_acct_no",
      "orders.p101_refund_acct_bank",
      "orders.p101_refund_acct_no",
      "orders.p101_cr_type",
      "orders.p101_cr_key",
      "orders.created_at",
      "orders.last_notified_at",
      "orders.cr_issued_at",
      "orders.cs_notes_json",
      "orders.product_sum",
      "orders.logi_sum",
      "orders.canceled_sum",
      "orders.success_sum",
      "orders.penalty_payment_type",
      "orders.ext_balanced_at",
      "user.id as user__id",
      "user.name as user__name",
      "user.phone_number as user__phone_number",
      "user.point as user__point",
      "schannel.id as schannel__id",
      "schannel.type as schannel__type",
      "schannel.name as schannel__name",
    ],
    virtual: [],
    joins: [
      {
        as: "user",
        join: "outer",
        table: "users",
        from: "orders.user_id",
        to: "user.id",
      },
      {
        as: "schannel",
        join: "outer",
        table: "schannels",
        from: "orders.schannel_id",
        to: "schannel.id",
      },
    ],
    loaders: [
      {
        as: "items",
        table: "order_items",
        manyJoin: { from: "orders.id", to: "order_items.order_id" },
        oneJoins: [
          {
            as: "product",
            join: "outer",
            table: "products",
            from: "order_items.product_id",
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
            as: "product__exref",
            join: "outer",
            table: "exrefs",
            from: "product.exref_id",
            to: "product__exref.id",
          },
          {
            as: "product__main_category",
            join: "outer",
            table: "categories",
            from: "product.main_category_id",
            to: "product__main_category.id",
          },
          {
            as: "product__sub_category",
            join: "outer",
            table: "categories",
            from: "product.sub_category_id",
            to: "product__sub_category.id",
          },
          {
            as: "product_item",
            join: "outer",
            table: "product_items",
            from: "order_items.product_item_id",
            to: "product_item.id",
          },
          {
            as: "product_item__current_inventory",
            join: "outer",
            table: "inventories",
            from: "product_item.current_inventory_id",
            to: "product_item__current_inventory.id",
          },
          {
            as: "exrefreq",
            join: "outer",
            table: "exrefreqs",
            from: "order_items.exrefreq_id",
            to: "exrefreq.id",
          },
        ],
        select: [
          "order_items.id",
          "order_items.item_price",
          "order_items.cnt",
          "order_items.item_sum",
          "order_items.inventory_type",
          "order_items.logi_key",
          "order_items.status",
          "order_items.earned_point",
          "order_items.earned_point_to_consume",
          "order_items.logi_completed_at",
          "order_items.canceled_at",
          "order_items.canceled_by",
          "order_items.canceled_reason",
          "order_items.penalty_fee",
          "order_items.refund_amount",
          "order_items.loss_replacement",
          "order_items.restock_cs",
          "product.id as product__id",
          "product.title as product__title",
          "product.parsed_title as product__parsed_title",
          "product.stock_type as product__stock_type",
          "product.description as product__description",
          "product.rep_img_url as product__rep_img_url",
          "product.status as product__status",
          "product.price as product__price",
          "product.base_price as product__base_price",
          "product.original_price as product__original_price",
          "product.point_percentage as product__point_percentage",
          "product.orders_cnt as product__orders_cnt",
          "product.order_items_cnt as product__order_items_cnt",
          "product.orders_sum as product__orders_sum",
          "product.created_at as product__created_at",
          "product.total_current_stock as product__total_current_stock",
          "product.src_pcode as product__src_pcode",
          "product.season as product__season",
          "product.material as product__material",
          "product.model_size as product__model_size",
          "product.size as product__size",
          "product.size_text as product__size_text",
          "product.size_country as product__size_country",
          "product.src_color as product__src_color",
          "product.fitting_info as product__fitting_info",
          "product.gender as product__gender",
          "product.unq_id as product__unq_id",
          "product__brand.id as product__brand__id",
          "product__brand.name as product__brand__name",
          "product__logi.id as product__logi__id",
          "product__logi.title as product__logi__title",
          "product__exref.id as product__exref__id",
          "product__exref.title as product__exref__title",
          "product__main_category.id as product__main_category__id",
          "product__main_category.name as product__main_category__name",
          "product__main_category.name_ko as product__main_category__name_ko",
          "product__sub_category.id as product__sub_category__id",
          "product__sub_category.name as product__sub_category__name",
          "product__sub_category.name_ko as product__sub_category__name_ko",
          "product_item.product_id as product_item__product_id",
          "product_item.title as product_item__title",
          "product_item.status as product_item__status",
          "product_item.holding as product_item__holding",
          "product_item.current_stock as product_item__current_stock",
          "product_item.converted_title as product_item__converted_title",
          "product_item__current_inventory.id as product_item__current_inventory__id",
          "product_item__current_inventory.price as product_item__current_inventory__price",
          "order_items.inventory_deal_id",
          "exrefreq.id as exrefreq__id",
          "exrefreq.type as exrefreq__type",
          "exrefreq.reason as exrefreq__reason",
          "exrefreq.desc as exrefreq__desc",
          "exrefreq.created_at as exrefreq__created_at",
          "exrefreq.accepted_at as exrefreq__accepted_at",
          "exrefreq.images as exrefreq__images",
        ],
      },
    ],
  },
  PL: {
    select: [
      "orders.id",
      "orders.order_type",
      "orders.payment_type",
      "orders.total_price",
      "orders.used_point",
      "orders.o_name",
      "orders.o_phone_number",
      "orders.d_name",
      "orders.d_phone_number",
      "orders.d_zipcode",
      "orders.d_address1",
      "orders.d_address2",
      "orders.d_comment",
      "orders.p101_name",
      "orders.p101_acct_bank",
      "orders.p101_acct_no",
      "orders.p101_refund_acct_bank",
      "orders.p101_refund_acct_no",
      "orders.p101_cr_type",
      "orders.p101_cr_key",
      "orders.created_at",
      "orders.last_notified_at",
      "orders.cr_issued_at",
      "orders.cs_notes_json",
      "orders.product_sum",
      "orders.logi_sum",
      "orders.canceled_sum",
      "orders.success_sum",
      "orders.penalty_payment_type",
      "orders.ext_balanced_at",
      "user.id as user__id",
      "user.name as user__name",
      "user.phone_number as user__phone_number",
      "user.point as user__point",
      "schannel.id as schannel__id",
      "schannel.type as schannel__type",
      "schannel.name as schannel__name",
    ],
    virtual: ["no"],
    joins: [
      {
        as: "user",
        join: "outer",
        table: "users",
        from: "orders.user_id",
        to: "user.id",
      },
      {
        as: "schannel",
        join: "outer",
        table: "schannels",
        from: "orders.schannel_id",
        to: "schannel.id",
      },
    ],
    loaders: [
      {
        as: "items",
        table: "order_items",
        manyJoin: { from: "orders.id", to: "order_items.order_id" },
        oneJoins: [
          {
            as: "product",
            join: "outer",
            table: "products",
            from: "order_items.product_id",
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
            as: "product__exref",
            join: "outer",
            table: "exrefs",
            from: "product.exref_id",
            to: "product__exref.id",
          },
          {
            as: "product__main_category",
            join: "outer",
            table: "categories",
            from: "product.main_category_id",
            to: "product__main_category.id",
          },
          {
            as: "product__sub_category",
            join: "outer",
            table: "categories",
            from: "product.sub_category_id",
            to: "product__sub_category.id",
          },
          {
            as: "product_item",
            join: "outer",
            table: "product_items",
            from: "order_items.product_item_id",
            to: "product_item.id",
          },
          {
            as: "product_item__current_inventory",
            join: "outer",
            table: "inventories",
            from: "product_item.current_inventory_id",
            to: "product_item__current_inventory.id",
          },
          {
            as: "exrefreq",
            join: "outer",
            table: "exrefreqs",
            from: "order_items.exrefreq_id",
            to: "exrefreq.id",
          },
        ],
        select: [
          "order_items.id",
          "order_items.item_price",
          "order_items.cnt",
          "order_items.item_sum",
          "order_items.inventory_type",
          "order_items.logi_key",
          "order_items.status",
          "order_items.earned_point",
          "order_items.earned_point_to_consume",
          "order_items.logi_completed_at",
          "order_items.canceled_at",
          "order_items.canceled_by",
          "order_items.canceled_reason",
          "order_items.penalty_fee",
          "order_items.refund_amount",
          "order_items.loss_replacement",
          "order_items.restock_cs",
          "product.id as product__id",
          "product.title as product__title",
          "product.parsed_title as product__parsed_title",
          "product.stock_type as product__stock_type",
          "product.description as product__description",
          "product.rep_img_url as product__rep_img_url",
          "product.status as product__status",
          "product.price as product__price",
          "product.base_price as product__base_price",
          "product.original_price as product__original_price",
          "product.point_percentage as product__point_percentage",
          "product.orders_cnt as product__orders_cnt",
          "product.order_items_cnt as product__order_items_cnt",
          "product.orders_sum as product__orders_sum",
          "product.created_at as product__created_at",
          "product.total_current_stock as product__total_current_stock",
          "product.src_pcode as product__src_pcode",
          "product.season as product__season",
          "product.material as product__material",
          "product.model_size as product__model_size",
          "product.size as product__size",
          "product.size_text as product__size_text",
          "product.size_country as product__size_country",
          "product.src_color as product__src_color",
          "product.fitting_info as product__fitting_info",
          "product.gender as product__gender",
          "product.unq_id as product__unq_id",
          "product__brand.id as product__brand__id",
          "product__brand.name as product__brand__name",
          "product__logi.id as product__logi__id",
          "product__logi.title as product__logi__title",
          "product__exref.id as product__exref__id",
          "product__exref.title as product__exref__title",
          "product__main_category.id as product__main_category__id",
          "product__main_category.name as product__main_category__name",
          "product__main_category.name_ko as product__main_category__name_ko",
          "product__sub_category.id as product__sub_category__id",
          "product__sub_category.name as product__sub_category__name",
          "product__sub_category.name_ko as product__sub_category__name_ko",
          "product_item.id as product_item__id",
          "product_item.title as product_item__title",
          "product_item.status as product_item__status",
          "product_item.holding as product_item__holding",
          "product_item.current_stock as product_item__current_stock",
          "product_item.converted_title as product_item__converted_title",
          "product_item__current_inventory.id as product_item__current_inventory__id",
          "product_item__current_inventory.price as product_item__current_inventory__price",
          "order_items.inventory_deal_id",
          "exrefreq.id as exrefreq__id",
          "exrefreq.type as exrefreq__type",
          "exrefreq.reason as exrefreq__reason",
          "exrefreq.desc as exrefreq__desc",
          "exrefreq.created_at as exrefreq__created_at",
          "exrefreq.accepted_at as exrefreq__accepted_at",
          "exrefreq.images as exrefreq__images",
        ],
      },
    ],
  },
  PD: {
    select: [
      "orders.id",
      "orders.order_type",
      "orders.payment_type",
      "orders.total_price",
      "orders.used_point",
      "orders.o_name",
      "orders.o_phone_number",
      "orders.d_name",
      "orders.d_phone_number",
      "orders.d_zipcode",
      "orders.d_address1",
      "orders.d_address2",
      "orders.d_comment",
      "orders.p101_name",
      "orders.p101_acct_bank",
      "orders.p101_acct_no",
      "orders.p101_refund_acct_bank",
      "orders.p101_refund_acct_no",
      "orders.p101_cr_type",
      "orders.p101_cr_key",
      "orders.created_at",
      "orders.last_notified_at",
      "orders.cr_issued_at",
      "orders.cs_notes_json",
      "orders.product_sum",
      "orders.logi_sum",
      "orders.canceled_sum",
      "orders.success_sum",
      "orders.penalty_payment_type",
      "orders.ext_balanced_at",
      "user.id as user__id",
      "user.name as user__name",
      "user.phone_number as user__phone_number",
      "user.point as user__point",
      "schannel.id as schannel__id",
      "schannel.type as schannel__type",
      "schannel.name as schannel__name",
    ],
    virtual: ["no", "product_title_summary"],
    joins: [
      {
        as: "user",
        join: "outer",
        table: "users",
        from: "orders.user_id",
        to: "user.id",
      },
      {
        as: "schannel",
        join: "outer",
        table: "schannels",
        from: "orders.schannel_id",
        to: "schannel.id",
      },
    ],
    loaders: [
      {
        as: "items",
        table: "order_items",
        manyJoin: { from: "orders.id", to: "order_items.order_id" },
        oneJoins: [
          {
            as: "product",
            join: "outer",
            table: "products",
            from: "order_items.product_id",
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
            as: "product__exref",
            join: "outer",
            table: "exrefs",
            from: "product.exref_id",
            to: "product__exref.id",
          },
          {
            as: "product__main_category",
            join: "outer",
            table: "categories",
            from: "product.main_category_id",
            to: "product__main_category.id",
          },
          {
            as: "product__sub_category",
            join: "outer",
            table: "categories",
            from: "product.sub_category_id",
            to: "product__sub_category.id",
          },
          {
            as: "product_item",
            join: "outer",
            table: "product_items",
            from: "order_items.product_item_id",
            to: "product_item.id",
          },
          {
            as: "product_item__current_inventory",
            join: "outer",
            table: "inventories",
            from: "product_item.current_inventory_id",
            to: "product_item__current_inventory.id",
          },
          {
            as: "exrefreq",
            join: "outer",
            table: "exrefreqs",
            from: "order_items.exrefreq_id",
            to: "exrefreq.id",
          },
          {
            as: "inventory",
            join: "outer",
            table: "inventories",
            from: "order_items.inventory_id",
            to: "inventory.id",
          },
        ],
        select: [
          "order_items.id",
          "order_items.item_price",
          "order_items.cnt",
          "order_items.item_sum",
          "order_items.inventory_type",
          "order_items.logi_key",
          "order_items.status",
          "order_items.earned_point",
          "order_items.earned_point_to_consume",
          "order_items.logi_completed_at",
          "order_items.canceled_at",
          "order_items.canceled_by",
          "order_items.canceled_reason",
          "order_items.penalty_fee",
          "order_items.refund_amount",
          "order_items.loss_replacement",
          "order_items.restock_cs",
          "product.id as product__id",
          "product.title as product__title",
          "product.parsed_title as product__parsed_title",
          "product.stock_type as product__stock_type",
          "product.description as product__description",
          "product.rep_img_url as product__rep_img_url",
          "product.status as product__status",
          "product.price as product__price",
          "product.base_price as product__base_price",
          "product.original_price as product__original_price",
          "product.point_percentage as product__point_percentage",
          "product.orders_cnt as product__orders_cnt",
          "product.order_items_cnt as product__order_items_cnt",
          "product.orders_sum as product__orders_sum",
          "product.created_at as product__created_at",
          "product.total_current_stock as product__total_current_stock",
          "product.src_pcode as product__src_pcode",
          "product.season as product__season",
          "product.material as product__material",
          "product.model_size as product__model_size",
          "product.size as product__size",
          "product.size_text as product__size_text",
          "product.size_country as product__size_country",
          "product.src_color as product__src_color",
          "product.fitting_info as product__fitting_info",
          "product.gender as product__gender",
          "product.unq_id as product__unq_id",
          "product__brand.id as product__brand__id",
          "product__brand.name as product__brand__name",
          "product__logi.id as product__logi__id",
          "product__logi.title as product__logi__title",
          "product__exref.id as product__exref__id",
          "product__exref.title as product__exref__title",
          "product__main_category.id as product__main_category__id",
          "product__main_category.name as product__main_category__name",
          "product__main_category.name_ko as product__main_category__name_ko",
          "product__sub_category.id as product__sub_category__id",
          "product__sub_category.name as product__sub_category__name",
          "product__sub_category.name_ko as product__sub_category__name_ko",
          "product_item.id as product_item__id",
          "product_item.title as product_item__title",
          "product_item.status as product_item__status",
          "product_item.holding as product_item__holding",
          "product_item.current_stock as product_item__current_stock",
          "product_item.converted_title as product_item__converted_title",
          "product_item__current_inventory.id as product_item__current_inventory__id",
          "product_item__current_inventory.price as product_item__current_inventory__price",
          "order_items.inventory_deal_id",
          "exrefreq.id as exrefreq__id",
          "exrefreq.type as exrefreq__type",
          "exrefreq.reason as exrefreq__reason",
          "exrefreq.desc as exrefreq__desc",
          "exrefreq.created_at as exrefreq__created_at",
          "exrefreq.accepted_at as exrefreq__accepted_at",
          "exrefreq.images as exrefreq__images",
          "inventory.expected_stock_at as inventory__expected_stock_at",
          "order_items.review_id",
        ],
      },
    ],
  },
};
export type OrderFieldExpr =
  | "id"
  | "order_type"
  | "payment_type"
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
  | "total_price"
  | "used_point"
  | "o_name"
  | "o_phone_number"
  | "d_name"
  | "d_phone_number"
  | "d_zipcode"
  | "d_address1"
  | "d_address2"
  | "d_comment"
  | "p101_name"
  | "p101_acct_bank"
  | "p101_acct_no"
  | "p101_refund_acct_bank"
  | "p101_refund_acct_no"
  | "p101_cr_type"
  | "p101_cr_key"
  | "created_at"
  | "last_notified_at"
  | "cr_issued_at"
  | "cs_notes_json"
  | "schannel.id"
  | "schannel.type"
  | "schannel.name"
  | "schannel.img_url"
  | "schannel.address"
  | "schannel.balance_type"
  | "schannel.balance_period"
  | "schannel.balance_unit"
  | "schannel.selling_commission"
  | "schannel.status"
  | "schannel.memo"
  | "product_sum"
  | "logi_sum"
  | "canceled_sum"
  | "success_sum"
  | "penalty_payment_type"
  | "ext_balanced_at"
  | "items.id"
  | "items.product.id"
  | "items.product.type"
  | "items.product.brand.id"
  | "items.product.brand.name"
  | "items.product.brand.orderno"
  | "items.product.brand.created_at"
  | "items.product.brand.official_site_italy"
  | "items.product.brand.official_site_int"
  | "items.product.brand.is_luxury"
  | "items.product.brand.margin_rate"
  | "items.product.brand.is_popular"
  | "items.product.brand.name_for_search"
  | "items.product.brand.name_ko"
  | "items.product.brand.desc"
  | "items.product.brand.admin_memo"
  | "items.product.brand.nv_search_type"
  | "items.product.brand.ignore_color"
  | "items.product.brand.picks_cnt"
  | "items.product.brand.products_cnt"
  | "items.product.brand.d_cover_img_url"
  | "items.product.brand.m_cover_img_url"
  | "items.product.brand.is_custompicked"
  | "items.product.brand.is_new"
  | "items.product.title"
  | "items.product.parsed_title"
  | "items.product.stock_type"
  | "items.product.description"
  | "items.product.rep_img_url"
  | "items.product.status"
  | "items.product.price"
  | "items.product.base_price"
  | "items.product.original_price"
  | "items.product.point_percentage"
  | "items.product.orders_cnt"
  | "items.product.order_items_cnt"
  | "items.product.orders_sum"
  | "items.product.logi.id"
  | "items.product.logi.title"
  | "items.product.logi.method"
  | "items.product.logi.logicompany"
  | "items.product.logi.base_fee"
  | "items.product.logi.added_fee"
  | "items.product.logi.free_price"
  | "items.product.logi.est_days"
  | "items.product.logi.created_at"
  | "items.product.exref.id"
  | "items.product.exref.title"
  | "items.product.exref.fee"
  | "items.product.exref.fee_text"
  | "items.product.exref.req_date_text"
  | "items.product.exref.restrict_text"
  | "items.product.exref.created_at"
  | "items.product.created_at"
  | "items.product.total_current_stock"
  | "items.product.main_category.id"
  | "items.product.main_category.prefix"
  | "items.product.main_category.name"
  | "items.product.main_category.name_ko"
  | "items.product.main_category.top"
  | "items.product.main_category.parent"
  | "items.product.main_category.orderno"
  | "items.product.main_category.css_class"
  | "items.product.main_category.status"
  | "items.product.main_category.img_url"
  | "items.product.main_category.can_show_on_main"
  | "items.product.main_category.text"
  | "items.product.main_category.products_cnt"
  | "items.product.main_category.children"
  | "items.product.sub_category.id"
  | "items.product.sub_category.prefix"
  | "items.product.sub_category.name"
  | "items.product.sub_category.name_ko"
  | "items.product.sub_category.top"
  | "items.product.sub_category.parent"
  | "items.product.sub_category.orderno"
  | "items.product.sub_category.css_class"
  | "items.product.sub_category.status"
  | "items.product.sub_category.img_url"
  | "items.product.sub_category.can_show_on_main"
  | "items.product.sub_category.text"
  | "items.product.sub_category.products_cnt"
  | "items.product.sub_category.children"
  | "items.product.visited_cnt"
  | "items.product.reviews_cnt"
  | "items.product.is_testing"
  | "items.product.src_pcode"
  | "items.product.season"
  | "items.product.material"
  | "items.product.model_size"
  | "items.product.size"
  | "items.product.size_text"
  | "items.product.size_country"
  | "items.product.src_color"
  | "items.product.fitting_info"
  | "items.product.gender"
  | "items.product.unq_id"
  | "items.product.first_deal.id"
  | "items.product.first_deal.status"
  | "items.product.first_deal.type"
  | "items.product.first_deal.title"
  | "items.product.first_deal.seq_no"
  | "items.product.first_deal.seq_title"
  | "items.product.first_deal.preorder_title"
  | "items.product.first_deal.stock_date"
  | "items.product.first_deal.warehousing_date"
  | "items.product.first_deal.created_at"
  | "items.product.first_deal.sms_sent_at"
  | "items.product.first_deal.preorder_begin_at"
  | "items.product.first_deal.preorder_end_at"
  | "items.product.first_deal.inventories_cnt"
  | "items.product.first_deal.is_early_ended"
  | "items.product.first_deal.remark"
  | "items.product.first_deal.cover_title"
  | "items.product.first_deal.cover_subtitle"
  | "items.product.first_deal.cover_desc"
  | "items.product.first_deal.cover_d_img_url"
  | "items.product.first_deal.cover_m_img_url"
  | "items.product.first_deal.encore_no"
  | "items.product.first_deal.feature_orderby"
  | "items.product.first_deal.cover_timer_color"
  | "items.product.first_deal.cover_timer_bg_color"
  | "items.product.first_deal.cover_desc_bg_color"
  | "items.product.first_deal.cover_desc_text_color"
  | "items.product.first_deal.preorder_type"
  | "items.product.first_deal.so_desc"
  | "items.product.first_deal.so_desc_bg_color"
  | "items.product.first_deal.so_content_d_img_url"
  | "items.product.first_deal.so_content_m_img_url"
  | "items.product.first_deal.so_cover_d_img_url"
  | "items.product.first_deal.so_cover_m_img_url"
  | "items.product.first_deal.orderno"
  | "items.product.first_deal.cover_list_img_url"
  | "items.product.first_deal.confirmed_at"
  | "items.product.first_deal.product_type"
  | "items.product.first_deal.products"
  | "items.product.first_deal.product_total_cnt"
  | "items.product.latest_deal.id"
  | "items.product.latest_deal.status"
  | "items.product.latest_deal.type"
  | "items.product.latest_deal.title"
  | "items.product.latest_deal.seq_no"
  | "items.product.latest_deal.seq_title"
  | "items.product.latest_deal.preorder_title"
  | "items.product.latest_deal.stock_date"
  | "items.product.latest_deal.warehousing_date"
  | "items.product.latest_deal.created_at"
  | "items.product.latest_deal.sms_sent_at"
  | "items.product.latest_deal.preorder_begin_at"
  | "items.product.latest_deal.preorder_end_at"
  | "items.product.latest_deal.inventories_cnt"
  | "items.product.latest_deal.is_early_ended"
  | "items.product.latest_deal.remark"
  | "items.product.latest_deal.cover_title"
  | "items.product.latest_deal.cover_subtitle"
  | "items.product.latest_deal.cover_desc"
  | "items.product.latest_deal.cover_d_img_url"
  | "items.product.latest_deal.cover_m_img_url"
  | "items.product.latest_deal.encore_no"
  | "items.product.latest_deal.feature_orderby"
  | "items.product.latest_deal.cover_timer_color"
  | "items.product.latest_deal.cover_timer_bg_color"
  | "items.product.latest_deal.cover_desc_bg_color"
  | "items.product.latest_deal.cover_desc_text_color"
  | "items.product.latest_deal.preorder_type"
  | "items.product.latest_deal.so_desc"
  | "items.product.latest_deal.so_desc_bg_color"
  | "items.product.latest_deal.so_content_d_img_url"
  | "items.product.latest_deal.so_content_m_img_url"
  | "items.product.latest_deal.so_cover_d_img_url"
  | "items.product.latest_deal.so_cover_m_img_url"
  | "items.product.latest_deal.orderno"
  | "items.product.latest_deal.cover_list_img_url"
  | "items.product.latest_deal.confirmed_at"
  | "items.product.latest_deal.product_type"
  | "items.product.latest_deal.products"
  | "items.product.latest_deal.product_total_cnt"
  | "items.product.picks_cnt"
  | "items.product.recent_picks_cnt"
  | "items.product.bpc1"
  | "items.product.is_blevel"
  | "items.product.pcode_main"
  | "items.product.pcode_sub"
  | "items.product.color_code"
  | "items.product.color_text"
  | "items.product.new_flag"
  | "items.product.activated_at"
  | "items.product.activated_by"
  | "items.product.pcode_analyzed_at"
  | "items.product.pcode_analyzed_by"
  | "items.product.prate_top"
  | "items.product.need_modification"
  | "items.product.sizetable.id"
  | "items.product.sizetable.category"
  | "items.product.sizetable.brand"
  | "items.product.sizetable.gender"
  | "items.product.sizetable.contents"
  | "items.product.score"
  | "items.product.rep_inventory_type"
  | "items.product.total_loss_cnt"
  | "items.product.min_expected_stock_at"
  | "items.product.last_base_price_verified_at"
  | "items.product.dps_cnt"
  | "items.product.src_category_name"
  | "items.product.origin_price_uk"
  | "items.product.origin_currency_uk"
  | "items.product.t200_price_uk"
  | "items.product.origin_price_fr"
  | "items.product.origin_currency_fr"
  | "items.product.t200_price_fr"
  | "items.product.origin_price_it"
  | "items.product.origin_currency_it"
  | "items.product.t200_price_it"
  | "items.product.new_badge_at"
  | "items.product.items.id"
  | "items.product.items.product"
  | "items.product.items.title"
  | "items.product.items.status"
  | "items.product.items.holding"
  | "items.product.items.current_inventory"
  | "items.product.items.current_stock"
  | "items.product.items.converted_title"
  | "items.product.items.loss_cnt"
  | "items.product.items.origin_stock_uk"
  | "items.product.items.origin_stock_it"
  | "items.product.items.origin_stock_fr"
  | "items.product.items.max_stock"
  | "items.product.items.consumed_cnt"
  | "items.product.items.preorder_end_at"
  | "items.product.items.product_logi_expected_date"
  | "items.product.items.expected_stock_at"
  | "items.product.items.stock_at"
  | "items.product.items.current_location_key"
  | "items.product.images"
  | "items.product.flag"
  | "items.product.latest_deal_created_date_view"
  | "items.product.min_expected_stock_date"
  | "items.product.apc_full"
  | "items.product.is_picked"
  | "items.product.brand_is_custompicked"
  | "items.product.naver_search_link"
  | "items.product.is_season_order"
  | "items.product.country_code"
  | "items.product.country_code_ko"
  | "items.product.logi_expected_date"
  | "items.product_item.id"
  | "items.product_item.product.id"
  | "items.product_item.product.type"
  | "items.product_item.product.brand"
  | "items.product_item.product.title"
  | "items.product_item.product.parsed_title"
  | "items.product_item.product.stock_type"
  | "items.product_item.product.description"
  | "items.product_item.product.rep_img_url"
  | "items.product_item.product.status"
  | "items.product_item.product.price"
  | "items.product_item.product.base_price"
  | "items.product_item.product.original_price"
  | "items.product_item.product.point_percentage"
  | "items.product_item.product.orders_cnt"
  | "items.product_item.product.order_items_cnt"
  | "items.product_item.product.orders_sum"
  | "items.product_item.product.logi"
  | "items.product_item.product.exref"
  | "items.product_item.product.created_at"
  | "items.product_item.product.total_current_stock"
  | "items.product_item.product.main_category"
  | "items.product_item.product.sub_category"
  | "items.product_item.product.visited_cnt"
  | "items.product_item.product.reviews_cnt"
  | "items.product_item.product.is_testing"
  | "items.product_item.product.src_pcode"
  | "items.product_item.product.season"
  | "items.product_item.product.material"
  | "items.product_item.product.model_size"
  | "items.product_item.product.size"
  | "items.product_item.product.size_text"
  | "items.product_item.product.size_country"
  | "items.product_item.product.src_color"
  | "items.product_item.product.fitting_info"
  | "items.product_item.product.gender"
  | "items.product_item.product.unq_id"
  | "items.product_item.product.first_deal"
  | "items.product_item.product.latest_deal"
  | "items.product_item.product.picks_cnt"
  | "items.product_item.product.recent_picks_cnt"
  | "items.product_item.product.bpc1"
  | "items.product_item.product.is_blevel"
  | "items.product_item.product.pcode_main"
  | "items.product_item.product.pcode_sub"
  | "items.product_item.product.color_code"
  | "items.product_item.product.color_text"
  | "items.product_item.product.new_flag"
  | "items.product_item.product.activated_at"
  | "items.product_item.product.activated_by"
  | "items.product_item.product.pcode_analyzed_at"
  | "items.product_item.product.pcode_analyzed_by"
  | "items.product_item.product.prate_top"
  | "items.product_item.product.need_modification"
  | "items.product_item.product.sizetable"
  | "items.product_item.product.score"
  | "items.product_item.product.rep_inventory_type"
  | "items.product_item.product.total_loss_cnt"
  | "items.product_item.product.min_expected_stock_at"
  | "items.product_item.product.last_base_price_verified_at"
  | "items.product_item.product.dps_cnt"
  | "items.product_item.product.src_category_name"
  | "items.product_item.product.origin_price_uk"
  | "items.product_item.product.origin_currency_uk"
  | "items.product_item.product.t200_price_uk"
  | "items.product_item.product.origin_price_fr"
  | "items.product_item.product.origin_currency_fr"
  | "items.product_item.product.t200_price_fr"
  | "items.product_item.product.origin_price_it"
  | "items.product_item.product.origin_currency_it"
  | "items.product_item.product.t200_price_it"
  | "items.product_item.product.new_badge_at"
  | "items.product_item.product.items"
  | "items.product_item.product.images"
  | "items.product_item.product.flag"
  | "items.product_item.product.latest_deal_created_date_view"
  | "items.product_item.product.min_expected_stock_date"
  | "items.product_item.product.apc_full"
  | "items.product_item.product.is_picked"
  | "items.product_item.product.brand_is_custompicked"
  | "items.product_item.product.naver_search_link"
  | "items.product_item.product.is_season_order"
  | "items.product_item.product.country_code"
  | "items.product_item.product.country_code_ko"
  | "items.product_item.product.logi_expected_date"
  | "items.product_item.title"
  | "items.product_item.status"
  | "items.product_item.holding"
  | "items.product_item.current_inventory.id"
  | "items.product_item.current_inventory.product"
  | "items.product_item.current_inventory.product_item"
  | "items.product_item.current_inventory.created_at"
  | "items.product_item.current_inventory.invoice_at"
  | "items.product_item.current_inventory.expected_stock_at"
  | "items.product_item.current_inventory.stock_at"
  | "items.product_item.current_inventory.type"
  | "items.product_item.current_inventory.deal"
  | "items.product_item.current_inventory.active"
  | "items.product_item.current_inventory.memo"
  | "items.product_item.current_inventory.order_item"
  | "items.product_item.current_inventory.order_item_seq"
  | "items.product_item.current_inventory.dp_item"
  | "items.product_item.current_inventory.dp_item_seq"
  | "items.product_item.current_inventory.reason"
  | "items.product_item.current_inventory.ao_seq"
  | "items.product_item.current_inventory.ao_type"
  | "items.product_item.current_inventory.price"
  | "items.product_item.current_stock"
  | "items.product_item.converted_title"
  | "items.product_item.loss_cnt"
  | "items.product_item.origin_stock_uk"
  | "items.product_item.origin_stock_it"
  | "items.product_item.origin_stock_fr"
  | "items.product_item.max_stock"
  | "items.product_item.consumed_cnt"
  | "items.product_item.preorder_end_at"
  | "items.product_item.product_logi_expected_date"
  | "items.product_item.expected_stock_at"
  | "items.product_item.stock_at"
  | "items.product_item.current_location_key"
  | "items.item_price"
  | "items.cnt"
  | "items.item_sum"
  | "items.cartitem.id"
  | "items.cartitem.user.id"
  | "items.cartitem.user.role"
  | "items.cartitem.user.sns"
  | "items.cartitem.user.string_id"
  | "items.cartitem.user.email"
  | "items.cartitem.user.pw"
  | "items.cartitem.user.img_url"
  | "items.cartitem.user.nickname"
  | "items.cartitem.user.name"
  | "items.cartitem.user.phone_number"
  | "items.cartitem.user.gender"
  | "items.cartitem.user.birthdate"
  | "items.cartitem.user.birth_year"
  | "items.cartitem.user.status"
  | "items.cartitem.user.blocked_until"
  | "items.cartitem.user.to_get_pushed"
  | "items.cartitem.user.to_get_mail"
  | "items.cartitem.user.to_get_sms"
  | "items.cartitem.user.zipcode"
  | "items.cartitem.user.address1"
  | "items.cartitem.user.address2"
  | "items.cartitem.user.created_at"
  | "items.cartitem.user.withdraw_reason"
  | "items.cartitem.user.level"
  | "items.cartitem.user.address"
  | "items.cartitem.user.cartitem_cnt"
  | "items.cartitem.user.payment_cnt"
  | "items.cartitem.user.delivery_cnt"
  | "items.cartitem.user.refund_or_exchange_cnt"
  | "items.cartitem.user.point"
  | "items.cartitem.user.used_point"
  | "items.cartitem.user.expected_point"
  | "items.cartitem.user.rtoken"
  | "items.cartitem.user.ruser"
  | "items.cartitem.user.withdraw_at"
  | "items.cartitem.user.picks_cnt"
  | "items.cartitem.user.pick_guide_sent_at"
  | "items.cartitem.user.paid_orders_cnt"
  | "items.cartitem.user.to_get_stock_sms"
  | "items.cartitem.user.to_get_event_sms"
  | "items.cartitem.user.marked_last_visited_at"
  | "items.cartitem.user.point_calculated_at"
  | "items.cartitem.user.tagging"
  | "items.cartitem.user.addresses"
  | "items.cartitem.product.id"
  | "items.cartitem.product.type"
  | "items.cartitem.product.brand"
  | "items.cartitem.product.title"
  | "items.cartitem.product.parsed_title"
  | "items.cartitem.product.stock_type"
  | "items.cartitem.product.description"
  | "items.cartitem.product.rep_img_url"
  | "items.cartitem.product.status"
  | "items.cartitem.product.price"
  | "items.cartitem.product.base_price"
  | "items.cartitem.product.original_price"
  | "items.cartitem.product.point_percentage"
  | "items.cartitem.product.orders_cnt"
  | "items.cartitem.product.order_items_cnt"
  | "items.cartitem.product.orders_sum"
  | "items.cartitem.product.logi"
  | "items.cartitem.product.exref"
  | "items.cartitem.product.created_at"
  | "items.cartitem.product.total_current_stock"
  | "items.cartitem.product.main_category"
  | "items.cartitem.product.sub_category"
  | "items.cartitem.product.visited_cnt"
  | "items.cartitem.product.reviews_cnt"
  | "items.cartitem.product.is_testing"
  | "items.cartitem.product.src_pcode"
  | "items.cartitem.product.season"
  | "items.cartitem.product.material"
  | "items.cartitem.product.model_size"
  | "items.cartitem.product.size"
  | "items.cartitem.product.size_text"
  | "items.cartitem.product.size_country"
  | "items.cartitem.product.src_color"
  | "items.cartitem.product.fitting_info"
  | "items.cartitem.product.gender"
  | "items.cartitem.product.unq_id"
  | "items.cartitem.product.first_deal"
  | "items.cartitem.product.latest_deal"
  | "items.cartitem.product.picks_cnt"
  | "items.cartitem.product.recent_picks_cnt"
  | "items.cartitem.product.bpc1"
  | "items.cartitem.product.is_blevel"
  | "items.cartitem.product.pcode_main"
  | "items.cartitem.product.pcode_sub"
  | "items.cartitem.product.color_code"
  | "items.cartitem.product.color_text"
  | "items.cartitem.product.new_flag"
  | "items.cartitem.product.activated_at"
  | "items.cartitem.product.activated_by"
  | "items.cartitem.product.pcode_analyzed_at"
  | "items.cartitem.product.pcode_analyzed_by"
  | "items.cartitem.product.prate_top"
  | "items.cartitem.product.need_modification"
  | "items.cartitem.product.sizetable"
  | "items.cartitem.product.score"
  | "items.cartitem.product.rep_inventory_type"
  | "items.cartitem.product.total_loss_cnt"
  | "items.cartitem.product.min_expected_stock_at"
  | "items.cartitem.product.last_base_price_verified_at"
  | "items.cartitem.product.dps_cnt"
  | "items.cartitem.product.src_category_name"
  | "items.cartitem.product.origin_price_uk"
  | "items.cartitem.product.origin_currency_uk"
  | "items.cartitem.product.t200_price_uk"
  | "items.cartitem.product.origin_price_fr"
  | "items.cartitem.product.origin_currency_fr"
  | "items.cartitem.product.t200_price_fr"
  | "items.cartitem.product.origin_price_it"
  | "items.cartitem.product.origin_currency_it"
  | "items.cartitem.product.t200_price_it"
  | "items.cartitem.product.new_badge_at"
  | "items.cartitem.product.items"
  | "items.cartitem.product.images"
  | "items.cartitem.product.flag"
  | "items.cartitem.product.latest_deal_created_date_view"
  | "items.cartitem.product.min_expected_stock_date"
  | "items.cartitem.product.apc_full"
  | "items.cartitem.product.is_picked"
  | "items.cartitem.product.brand_is_custompicked"
  | "items.cartitem.product.naver_search_link"
  | "items.cartitem.product.is_season_order"
  | "items.cartitem.product.country_code"
  | "items.cartitem.product.country_code_ko"
  | "items.cartitem.product.logi_expected_date"
  | "items.cartitem.item.id"
  | "items.cartitem.item.product"
  | "items.cartitem.item.title"
  | "items.cartitem.item.status"
  | "items.cartitem.item.holding"
  | "items.cartitem.item.current_inventory"
  | "items.cartitem.item.current_stock"
  | "items.cartitem.item.converted_title"
  | "items.cartitem.item.loss_cnt"
  | "items.cartitem.item.origin_stock_uk"
  | "items.cartitem.item.origin_stock_it"
  | "items.cartitem.item.origin_stock_fr"
  | "items.cartitem.item.max_stock"
  | "items.cartitem.item.consumed_cnt"
  | "items.cartitem.item.preorder_end_at"
  | "items.cartitem.item.product_logi_expected_date"
  | "items.cartitem.item.expected_stock_at"
  | "items.cartitem.item.stock_at"
  | "items.cartitem.item.current_location_key"
  | "items.cartitem.item_price"
  | "items.cartitem.cnt"
  | "items.cartitem.created_at"
  | "items.inventory_type"
  | "items.inventory_deal.id"
  | "items.inventory_deal.status"
  | "items.inventory_deal.type"
  | "items.inventory_deal.title"
  | "items.inventory_deal.seq_no"
  | "items.inventory_deal.seq_title"
  | "items.inventory_deal.preorder_title"
  | "items.inventory_deal.stock_date"
  | "items.inventory_deal.warehousing_date"
  | "items.inventory_deal.created_at"
  | "items.inventory_deal.sms_sent_at"
  | "items.inventory_deal.preorder_begin_at"
  | "items.inventory_deal.preorder_end_at"
  | "items.inventory_deal.inventories_cnt"
  | "items.inventory_deal.is_early_ended"
  | "items.inventory_deal.remark"
  | "items.inventory_deal.cover_title"
  | "items.inventory_deal.cover_subtitle"
  | "items.inventory_deal.cover_desc"
  | "items.inventory_deal.cover_d_img_url"
  | "items.inventory_deal.cover_m_img_url"
  | "items.inventory_deal.encore_no"
  | "items.inventory_deal.feature_orderby"
  | "items.inventory_deal.cover_timer_color"
  | "items.inventory_deal.cover_timer_bg_color"
  | "items.inventory_deal.cover_desc_bg_color"
  | "items.inventory_deal.cover_desc_text_color"
  | "items.inventory_deal.preorder_type"
  | "items.inventory_deal.so_desc"
  | "items.inventory_deal.so_desc_bg_color"
  | "items.inventory_deal.so_content_d_img_url"
  | "items.inventory_deal.so_content_m_img_url"
  | "items.inventory_deal.so_cover_d_img_url"
  | "items.inventory_deal.so_cover_m_img_url"
  | "items.inventory_deal.orderno"
  | "items.inventory_deal.cover_list_img_url"
  | "items.inventory_deal.confirmed_at"
  | "items.inventory_deal.product_type"
  | "items.inventory_deal.products.id"
  | "items.inventory_deal.products.type"
  | "items.inventory_deal.products.brand"
  | "items.inventory_deal.products.title"
  | "items.inventory_deal.products.parsed_title"
  | "items.inventory_deal.products.stock_type"
  | "items.inventory_deal.products.description"
  | "items.inventory_deal.products.rep_img_url"
  | "items.inventory_deal.products.status"
  | "items.inventory_deal.products.price"
  | "items.inventory_deal.products.base_price"
  | "items.inventory_deal.products.original_price"
  | "items.inventory_deal.products.point_percentage"
  | "items.inventory_deal.products.orders_cnt"
  | "items.inventory_deal.products.order_items_cnt"
  | "items.inventory_deal.products.orders_sum"
  | "items.inventory_deal.products.logi"
  | "items.inventory_deal.products.exref"
  | "items.inventory_deal.products.created_at"
  | "items.inventory_deal.products.total_current_stock"
  | "items.inventory_deal.products.main_category"
  | "items.inventory_deal.products.sub_category"
  | "items.inventory_deal.products.visited_cnt"
  | "items.inventory_deal.products.reviews_cnt"
  | "items.inventory_deal.products.is_testing"
  | "items.inventory_deal.products.src_pcode"
  | "items.inventory_deal.products.season"
  | "items.inventory_deal.products.material"
  | "items.inventory_deal.products.model_size"
  | "items.inventory_deal.products.size"
  | "items.inventory_deal.products.size_text"
  | "items.inventory_deal.products.size_country"
  | "items.inventory_deal.products.src_color"
  | "items.inventory_deal.products.fitting_info"
  | "items.inventory_deal.products.gender"
  | "items.inventory_deal.products.unq_id"
  | "items.inventory_deal.products.first_deal"
  | "items.inventory_deal.products.latest_deal"
  | "items.inventory_deal.products.picks_cnt"
  | "items.inventory_deal.products.recent_picks_cnt"
  | "items.inventory_deal.products.bpc1"
  | "items.inventory_deal.products.is_blevel"
  | "items.inventory_deal.products.pcode_main"
  | "items.inventory_deal.products.pcode_sub"
  | "items.inventory_deal.products.color_code"
  | "items.inventory_deal.products.color_text"
  | "items.inventory_deal.products.new_flag"
  | "items.inventory_deal.products.activated_at"
  | "items.inventory_deal.products.activated_by"
  | "items.inventory_deal.products.pcode_analyzed_at"
  | "items.inventory_deal.products.pcode_analyzed_by"
  | "items.inventory_deal.products.prate_top"
  | "items.inventory_deal.products.need_modification"
  | "items.inventory_deal.products.sizetable"
  | "items.inventory_deal.products.score"
  | "items.inventory_deal.products.rep_inventory_type"
  | "items.inventory_deal.products.total_loss_cnt"
  | "items.inventory_deal.products.min_expected_stock_at"
  | "items.inventory_deal.products.last_base_price_verified_at"
  | "items.inventory_deal.products.dps_cnt"
  | "items.inventory_deal.products.src_category_name"
  | "items.inventory_deal.products.origin_price_uk"
  | "items.inventory_deal.products.origin_currency_uk"
  | "items.inventory_deal.products.t200_price_uk"
  | "items.inventory_deal.products.origin_price_fr"
  | "items.inventory_deal.products.origin_currency_fr"
  | "items.inventory_deal.products.t200_price_fr"
  | "items.inventory_deal.products.origin_price_it"
  | "items.inventory_deal.products.origin_currency_it"
  | "items.inventory_deal.products.t200_price_it"
  | "items.inventory_deal.products.new_badge_at"
  | "items.inventory_deal.products.items"
  | "items.inventory_deal.products.images"
  | "items.inventory_deal.products.flag"
  | "items.inventory_deal.products.latest_deal_created_date_view"
  | "items.inventory_deal.products.min_expected_stock_date"
  | "items.inventory_deal.products.apc_full"
  | "items.inventory_deal.products.is_picked"
  | "items.inventory_deal.products.brand_is_custompicked"
  | "items.inventory_deal.products.naver_search_link"
  | "items.inventory_deal.products.is_season_order"
  | "items.inventory_deal.products.country_code"
  | "items.inventory_deal.products.country_code_ko"
  | "items.inventory_deal.products.logi_expected_date"
  | "items.inventory_deal.product_total_cnt"
  | "items.logi.id"
  | "items.logi.title"
  | "items.logi.method"
  | "items.logi.logicompany.id"
  | "items.logi.logicompany.name"
  | "items.logi.logicompany.st_code"
  | "items.logi.base_fee"
  | "items.logi.added_fee"
  | "items.logi.free_price"
  | "items.logi.est_days"
  | "items.logi.created_at"
  | "items.logi_key"
  | "items.status"
  | "items.earned_point"
  | "items.earned_point_to_consume"
  | "items.logi_completed_at"
  | "items.canceled_at"
  | "items.canceled_by"
  | "items.canceled_reason"
  | "items.exrefreq.id"
  | "items.exrefreq.type"
  | "items.exrefreq.reason"
  | "items.exrefreq.product.id"
  | "items.exrefreq.product.type"
  | "items.exrefreq.product.brand"
  | "items.exrefreq.product.title"
  | "items.exrefreq.product.parsed_title"
  | "items.exrefreq.product.stock_type"
  | "items.exrefreq.product.description"
  | "items.exrefreq.product.rep_img_url"
  | "items.exrefreq.product.status"
  | "items.exrefreq.product.price"
  | "items.exrefreq.product.base_price"
  | "items.exrefreq.product.original_price"
  | "items.exrefreq.product.point_percentage"
  | "items.exrefreq.product.orders_cnt"
  | "items.exrefreq.product.order_items_cnt"
  | "items.exrefreq.product.orders_sum"
  | "items.exrefreq.product.logi"
  | "items.exrefreq.product.exref"
  | "items.exrefreq.product.created_at"
  | "items.exrefreq.product.total_current_stock"
  | "items.exrefreq.product.main_category"
  | "items.exrefreq.product.sub_category"
  | "items.exrefreq.product.visited_cnt"
  | "items.exrefreq.product.reviews_cnt"
  | "items.exrefreq.product.is_testing"
  | "items.exrefreq.product.src_pcode"
  | "items.exrefreq.product.season"
  | "items.exrefreq.product.material"
  | "items.exrefreq.product.model_size"
  | "items.exrefreq.product.size"
  | "items.exrefreq.product.size_text"
  | "items.exrefreq.product.size_country"
  | "items.exrefreq.product.src_color"
  | "items.exrefreq.product.fitting_info"
  | "items.exrefreq.product.gender"
  | "items.exrefreq.product.unq_id"
  | "items.exrefreq.product.first_deal"
  | "items.exrefreq.product.latest_deal"
  | "items.exrefreq.product.picks_cnt"
  | "items.exrefreq.product.recent_picks_cnt"
  | "items.exrefreq.product.bpc1"
  | "items.exrefreq.product.is_blevel"
  | "items.exrefreq.product.pcode_main"
  | "items.exrefreq.product.pcode_sub"
  | "items.exrefreq.product.color_code"
  | "items.exrefreq.product.color_text"
  | "items.exrefreq.product.new_flag"
  | "items.exrefreq.product.activated_at"
  | "items.exrefreq.product.activated_by"
  | "items.exrefreq.product.pcode_analyzed_at"
  | "items.exrefreq.product.pcode_analyzed_by"
  | "items.exrefreq.product.prate_top"
  | "items.exrefreq.product.need_modification"
  | "items.exrefreq.product.sizetable"
  | "items.exrefreq.product.score"
  | "items.exrefreq.product.rep_inventory_type"
  | "items.exrefreq.product.total_loss_cnt"
  | "items.exrefreq.product.min_expected_stock_at"
  | "items.exrefreq.product.last_base_price_verified_at"
  | "items.exrefreq.product.dps_cnt"
  | "items.exrefreq.product.src_category_name"
  | "items.exrefreq.product.origin_price_uk"
  | "items.exrefreq.product.origin_currency_uk"
  | "items.exrefreq.product.t200_price_uk"
  | "items.exrefreq.product.origin_price_fr"
  | "items.exrefreq.product.origin_currency_fr"
  | "items.exrefreq.product.t200_price_fr"
  | "items.exrefreq.product.origin_price_it"
  | "items.exrefreq.product.origin_currency_it"
  | "items.exrefreq.product.t200_price_it"
  | "items.exrefreq.product.new_badge_at"
  | "items.exrefreq.product.items"
  | "items.exrefreq.product.images"
  | "items.exrefreq.product.flag"
  | "items.exrefreq.product.latest_deal_created_date_view"
  | "items.exrefreq.product.min_expected_stock_date"
  | "items.exrefreq.product.apc_full"
  | "items.exrefreq.product.is_picked"
  | "items.exrefreq.product.brand_is_custompicked"
  | "items.exrefreq.product.naver_search_link"
  | "items.exrefreq.product.is_season_order"
  | "items.exrefreq.product.country_code"
  | "items.exrefreq.product.country_code_ko"
  | "items.exrefreq.product.logi_expected_date"
  | "items.exrefreq.desc"
  | "items.exrefreq.created_at"
  | "items.exrefreq.accepted_at"
  | "items.exrefreq.images"
  | "items.penalty_fee"
  | "items.refund_amount"
  | "items.loss_replacement"
  | "items.restock_cs"
  | "items.wtcard.id"
  | "items.wtcard.unq_code"
  | "items.wtcard.product.id"
  | "items.wtcard.product.type"
  | "items.wtcard.product.brand"
  | "items.wtcard.product.title"
  | "items.wtcard.product.parsed_title"
  | "items.wtcard.product.stock_type"
  | "items.wtcard.product.description"
  | "items.wtcard.product.rep_img_url"
  | "items.wtcard.product.status"
  | "items.wtcard.product.price"
  | "items.wtcard.product.base_price"
  | "items.wtcard.product.original_price"
  | "items.wtcard.product.point_percentage"
  | "items.wtcard.product.orders_cnt"
  | "items.wtcard.product.order_items_cnt"
  | "items.wtcard.product.orders_sum"
  | "items.wtcard.product.logi"
  | "items.wtcard.product.exref"
  | "items.wtcard.product.created_at"
  | "items.wtcard.product.total_current_stock"
  | "items.wtcard.product.main_category"
  | "items.wtcard.product.sub_category"
  | "items.wtcard.product.visited_cnt"
  | "items.wtcard.product.reviews_cnt"
  | "items.wtcard.product.is_testing"
  | "items.wtcard.product.src_pcode"
  | "items.wtcard.product.season"
  | "items.wtcard.product.material"
  | "items.wtcard.product.model_size"
  | "items.wtcard.product.size"
  | "items.wtcard.product.size_text"
  | "items.wtcard.product.size_country"
  | "items.wtcard.product.src_color"
  | "items.wtcard.product.fitting_info"
  | "items.wtcard.product.gender"
  | "items.wtcard.product.unq_id"
  | "items.wtcard.product.first_deal"
  | "items.wtcard.product.latest_deal"
  | "items.wtcard.product.picks_cnt"
  | "items.wtcard.product.recent_picks_cnt"
  | "items.wtcard.product.bpc1"
  | "items.wtcard.product.is_blevel"
  | "items.wtcard.product.pcode_main"
  | "items.wtcard.product.pcode_sub"
  | "items.wtcard.product.color_code"
  | "items.wtcard.product.color_text"
  | "items.wtcard.product.new_flag"
  | "items.wtcard.product.activated_at"
  | "items.wtcard.product.activated_by"
  | "items.wtcard.product.pcode_analyzed_at"
  | "items.wtcard.product.pcode_analyzed_by"
  | "items.wtcard.product.prate_top"
  | "items.wtcard.product.need_modification"
  | "items.wtcard.product.sizetable"
  | "items.wtcard.product.score"
  | "items.wtcard.product.rep_inventory_type"
  | "items.wtcard.product.total_loss_cnt"
  | "items.wtcard.product.min_expected_stock_at"
  | "items.wtcard.product.last_base_price_verified_at"
  | "items.wtcard.product.dps_cnt"
  | "items.wtcard.product.src_category_name"
  | "items.wtcard.product.origin_price_uk"
  | "items.wtcard.product.origin_currency_uk"
  | "items.wtcard.product.t200_price_uk"
  | "items.wtcard.product.origin_price_fr"
  | "items.wtcard.product.origin_currency_fr"
  | "items.wtcard.product.t200_price_fr"
  | "items.wtcard.product.origin_price_it"
  | "items.wtcard.product.origin_currency_it"
  | "items.wtcard.product.t200_price_it"
  | "items.wtcard.product.new_badge_at"
  | "items.wtcard.product.items"
  | "items.wtcard.product.images"
  | "items.wtcard.product.flag"
  | "items.wtcard.product.latest_deal_created_date_view"
  | "items.wtcard.product.min_expected_stock_date"
  | "items.wtcard.product.apc_full"
  | "items.wtcard.product.is_picked"
  | "items.wtcard.product.brand_is_custompicked"
  | "items.wtcard.product.naver_search_link"
  | "items.wtcard.product.is_season_order"
  | "items.wtcard.product.country_code"
  | "items.wtcard.product.country_code_ko"
  | "items.wtcard.product.logi_expected_date"
  | "items.wtcard.rep_img_url"
  | "items.wtcard.status"
  | "items.wtcard.note"
  | "items.wtcard.created_at"
  | "items.wtcard.is_smdutyfree"
  | "items.wtcard.images"
  | "items.inventory.id"
  | "items.inventory.product.id"
  | "items.inventory.product.type"
  | "items.inventory.product.brand"
  | "items.inventory.product.title"
  | "items.inventory.product.parsed_title"
  | "items.inventory.product.stock_type"
  | "items.inventory.product.description"
  | "items.inventory.product.rep_img_url"
  | "items.inventory.product.status"
  | "items.inventory.product.price"
  | "items.inventory.product.base_price"
  | "items.inventory.product.original_price"
  | "items.inventory.product.point_percentage"
  | "items.inventory.product.orders_cnt"
  | "items.inventory.product.order_items_cnt"
  | "items.inventory.product.orders_sum"
  | "items.inventory.product.logi"
  | "items.inventory.product.exref"
  | "items.inventory.product.created_at"
  | "items.inventory.product.total_current_stock"
  | "items.inventory.product.main_category"
  | "items.inventory.product.sub_category"
  | "items.inventory.product.visited_cnt"
  | "items.inventory.product.reviews_cnt"
  | "items.inventory.product.is_testing"
  | "items.inventory.product.src_pcode"
  | "items.inventory.product.season"
  | "items.inventory.product.material"
  | "items.inventory.product.model_size"
  | "items.inventory.product.size"
  | "items.inventory.product.size_text"
  | "items.inventory.product.size_country"
  | "items.inventory.product.src_color"
  | "items.inventory.product.fitting_info"
  | "items.inventory.product.gender"
  | "items.inventory.product.unq_id"
  | "items.inventory.product.first_deal"
  | "items.inventory.product.latest_deal"
  | "items.inventory.product.picks_cnt"
  | "items.inventory.product.recent_picks_cnt"
  | "items.inventory.product.bpc1"
  | "items.inventory.product.is_blevel"
  | "items.inventory.product.pcode_main"
  | "items.inventory.product.pcode_sub"
  | "items.inventory.product.color_code"
  | "items.inventory.product.color_text"
  | "items.inventory.product.new_flag"
  | "items.inventory.product.activated_at"
  | "items.inventory.product.activated_by"
  | "items.inventory.product.pcode_analyzed_at"
  | "items.inventory.product.pcode_analyzed_by"
  | "items.inventory.product.prate_top"
  | "items.inventory.product.need_modification"
  | "items.inventory.product.sizetable"
  | "items.inventory.product.score"
  | "items.inventory.product.rep_inventory_type"
  | "items.inventory.product.total_loss_cnt"
  | "items.inventory.product.min_expected_stock_at"
  | "items.inventory.product.last_base_price_verified_at"
  | "items.inventory.product.dps_cnt"
  | "items.inventory.product.src_category_name"
  | "items.inventory.product.origin_price_uk"
  | "items.inventory.product.origin_currency_uk"
  | "items.inventory.product.t200_price_uk"
  | "items.inventory.product.origin_price_fr"
  | "items.inventory.product.origin_currency_fr"
  | "items.inventory.product.t200_price_fr"
  | "items.inventory.product.origin_price_it"
  | "items.inventory.product.origin_currency_it"
  | "items.inventory.product.t200_price_it"
  | "items.inventory.product.new_badge_at"
  | "items.inventory.product.items"
  | "items.inventory.product.images"
  | "items.inventory.product.flag"
  | "items.inventory.product.latest_deal_created_date_view"
  | "items.inventory.product.min_expected_stock_date"
  | "items.inventory.product.apc_full"
  | "items.inventory.product.is_picked"
  | "items.inventory.product.brand_is_custompicked"
  | "items.inventory.product.naver_search_link"
  | "items.inventory.product.is_season_order"
  | "items.inventory.product.country_code"
  | "items.inventory.product.country_code_ko"
  | "items.inventory.product.logi_expected_date"
  | "items.inventory.product_item.id"
  | "items.inventory.product_item.product"
  | "items.inventory.product_item.title"
  | "items.inventory.product_item.status"
  | "items.inventory.product_item.holding"
  | "items.inventory.product_item.current_inventory"
  | "items.inventory.product_item.current_stock"
  | "items.inventory.product_item.converted_title"
  | "items.inventory.product_item.loss_cnt"
  | "items.inventory.product_item.origin_stock_uk"
  | "items.inventory.product_item.origin_stock_it"
  | "items.inventory.product_item.origin_stock_fr"
  | "items.inventory.product_item.max_stock"
  | "items.inventory.product_item.consumed_cnt"
  | "items.inventory.product_item.preorder_end_at"
  | "items.inventory.product_item.product_logi_expected_date"
  | "items.inventory.product_item.expected_stock_at"
  | "items.inventory.product_item.stock_at"
  | "items.inventory.product_item.current_location_key"
  | "items.inventory.created_at"
  | "items.inventory.invoice_at"
  | "items.inventory.expected_stock_at"
  | "items.inventory.stock_at"
  | "items.inventory.type"
  | "items.inventory.deal.id"
  | "items.inventory.deal.status"
  | "items.inventory.deal.type"
  | "items.inventory.deal.title"
  | "items.inventory.deal.seq_no"
  | "items.inventory.deal.seq_title"
  | "items.inventory.deal.preorder_title"
  | "items.inventory.deal.stock_date"
  | "items.inventory.deal.warehousing_date"
  | "items.inventory.deal.created_at"
  | "items.inventory.deal.sms_sent_at"
  | "items.inventory.deal.preorder_begin_at"
  | "items.inventory.deal.preorder_end_at"
  | "items.inventory.deal.inventories_cnt"
  | "items.inventory.deal.is_early_ended"
  | "items.inventory.deal.remark"
  | "items.inventory.deal.cover_title"
  | "items.inventory.deal.cover_subtitle"
  | "items.inventory.deal.cover_desc"
  | "items.inventory.deal.cover_d_img_url"
  | "items.inventory.deal.cover_m_img_url"
  | "items.inventory.deal.encore_no"
  | "items.inventory.deal.feature_orderby"
  | "items.inventory.deal.cover_timer_color"
  | "items.inventory.deal.cover_timer_bg_color"
  | "items.inventory.deal.cover_desc_bg_color"
  | "items.inventory.deal.cover_desc_text_color"
  | "items.inventory.deal.preorder_type"
  | "items.inventory.deal.so_desc"
  | "items.inventory.deal.so_desc_bg_color"
  | "items.inventory.deal.so_content_d_img_url"
  | "items.inventory.deal.so_content_m_img_url"
  | "items.inventory.deal.so_cover_d_img_url"
  | "items.inventory.deal.so_cover_m_img_url"
  | "items.inventory.deal.orderno"
  | "items.inventory.deal.cover_list_img_url"
  | "items.inventory.deal.confirmed_at"
  | "items.inventory.deal.product_type"
  | "items.inventory.deal.products"
  | "items.inventory.deal.product_total_cnt"
  | "items.inventory.active"
  | "items.inventory.memo"
  | "items.inventory.order_item_seq"
  | "items.inventory.dp_item.id"
  | "items.inventory.dp_item.deal_product"
  | "items.inventory.dp_item.product_item"
  | "items.inventory.dp_item.cnt"
  | "items.inventory.dp_item.deactivated_at"
  | "items.inventory.dp_item.deactivated_by"
  | "items.inventory.dp_item.deactivated_reason"
  | "items.inventory.dp_item.mdchosen_cnt"
  | "items.inventory.dp_item_seq"
  | "items.inventory.reason"
  | "items.inventory.ao_seq"
  | "items.inventory.ao_type"
  | "items.inventory.price"
  | "items.review.id"
  | "items.review.product.id"
  | "items.review.product.type"
  | "items.review.product.brand"
  | "items.review.product.title"
  | "items.review.product.parsed_title"
  | "items.review.product.stock_type"
  | "items.review.product.description"
  | "items.review.product.rep_img_url"
  | "items.review.product.status"
  | "items.review.product.price"
  | "items.review.product.base_price"
  | "items.review.product.original_price"
  | "items.review.product.point_percentage"
  | "items.review.product.orders_cnt"
  | "items.review.product.order_items_cnt"
  | "items.review.product.orders_sum"
  | "items.review.product.logi"
  | "items.review.product.exref"
  | "items.review.product.created_at"
  | "items.review.product.total_current_stock"
  | "items.review.product.main_category"
  | "items.review.product.sub_category"
  | "items.review.product.visited_cnt"
  | "items.review.product.reviews_cnt"
  | "items.review.product.is_testing"
  | "items.review.product.src_pcode"
  | "items.review.product.season"
  | "items.review.product.material"
  | "items.review.product.model_size"
  | "items.review.product.size"
  | "items.review.product.size_text"
  | "items.review.product.size_country"
  | "items.review.product.src_color"
  | "items.review.product.fitting_info"
  | "items.review.product.gender"
  | "items.review.product.unq_id"
  | "items.review.product.first_deal"
  | "items.review.product.latest_deal"
  | "items.review.product.picks_cnt"
  | "items.review.product.recent_picks_cnt"
  | "items.review.product.bpc1"
  | "items.review.product.is_blevel"
  | "items.review.product.pcode_main"
  | "items.review.product.pcode_sub"
  | "items.review.product.color_code"
  | "items.review.product.color_text"
  | "items.review.product.new_flag"
  | "items.review.product.activated_at"
  | "items.review.product.activated_by"
  | "items.review.product.pcode_analyzed_at"
  | "items.review.product.pcode_analyzed_by"
  | "items.review.product.prate_top"
  | "items.review.product.need_modification"
  | "items.review.product.sizetable"
  | "items.review.product.score"
  | "items.review.product.rep_inventory_type"
  | "items.review.product.total_loss_cnt"
  | "items.review.product.min_expected_stock_at"
  | "items.review.product.last_base_price_verified_at"
  | "items.review.product.dps_cnt"
  | "items.review.product.src_category_name"
  | "items.review.product.origin_price_uk"
  | "items.review.product.origin_currency_uk"
  | "items.review.product.t200_price_uk"
  | "items.review.product.origin_price_fr"
  | "items.review.product.origin_currency_fr"
  | "items.review.product.t200_price_fr"
  | "items.review.product.origin_price_it"
  | "items.review.product.origin_currency_it"
  | "items.review.product.t200_price_it"
  | "items.review.product.new_badge_at"
  | "items.review.product.items"
  | "items.review.product.images"
  | "items.review.product.flag"
  | "items.review.product.latest_deal_created_date_view"
  | "items.review.product.min_expected_stock_date"
  | "items.review.product.apc_full"
  | "items.review.product.is_picked"
  | "items.review.product.brand_is_custompicked"
  | "items.review.product.naver_search_link"
  | "items.review.product.is_season_order"
  | "items.review.product.country_code"
  | "items.review.product.country_code_ko"
  | "items.review.product.logi_expected_date"
  | "items.review.parent.id"
  | "items.review.parent.order"
  | "items.review.parent.product"
  | "items.review.parent.parent"
  | "items.review.parent.user"
  | "items.review.parent.rating"
  | "items.review.parent.content"
  | "items.review.parent.answer"
  | "items.review.parent.rep_img_url"
  | "items.review.parent.images_cnt"
  | "items.review.parent.status"
  | "items.review.parent.height"
  | "items.review.parent.weight"
  | "items.review.parent.size"
  | "items.review.parent.size2"
  | "items.review.parent.created_at"
  | "items.review.parent.answered_at"
  | "items.review.parent.is_admin"
  | "items.review.parent.admin_name"
  | "items.review.parent.sns_url"
  | "items.review.parent.images"
  | "items.review.user.id"
  | "items.review.user.role"
  | "items.review.user.sns"
  | "items.review.user.string_id"
  | "items.review.user.email"
  | "items.review.user.pw"
  | "items.review.user.img_url"
  | "items.review.user.nickname"
  | "items.review.user.name"
  | "items.review.user.phone_number"
  | "items.review.user.gender"
  | "items.review.user.birthdate"
  | "items.review.user.birth_year"
  | "items.review.user.status"
  | "items.review.user.blocked_until"
  | "items.review.user.to_get_pushed"
  | "items.review.user.to_get_mail"
  | "items.review.user.to_get_sms"
  | "items.review.user.zipcode"
  | "items.review.user.address1"
  | "items.review.user.address2"
  | "items.review.user.created_at"
  | "items.review.user.withdraw_reason"
  | "items.review.user.level"
  | "items.review.user.address"
  | "items.review.user.cartitem_cnt"
  | "items.review.user.payment_cnt"
  | "items.review.user.delivery_cnt"
  | "items.review.user.refund_or_exchange_cnt"
  | "items.review.user.point"
  | "items.review.user.used_point"
  | "items.review.user.expected_point"
  | "items.review.user.rtoken"
  | "items.review.user.ruser"
  | "items.review.user.withdraw_at"
  | "items.review.user.picks_cnt"
  | "items.review.user.pick_guide_sent_at"
  | "items.review.user.paid_orders_cnt"
  | "items.review.user.to_get_stock_sms"
  | "items.review.user.to_get_event_sms"
  | "items.review.user.marked_last_visited_at"
  | "items.review.user.point_calculated_at"
  | "items.review.user.tagging"
  | "items.review.user.addresses"
  | "items.review.rating"
  | "items.review.content"
  | "items.review.answer"
  | "items.review.rep_img_url"
  | "items.review.images_cnt"
  | "items.review.status"
  | "items.review.height"
  | "items.review.weight"
  | "items.review.size"
  | "items.review.size2"
  | "items.review.created_at"
  | "items.review.answered_at"
  | "items.review.is_admin"
  | "items.review.admin_name"
  | "items.review.sns_url"
  | "items.review.images"
  | "no"
  | "product_title_summary";
