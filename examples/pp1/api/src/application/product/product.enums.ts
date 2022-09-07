import { z } from "zod";
import { EnumsLabelKo } from "@sonamu/core";

export const ProductOrderBy = z.enum(["id-desc", "price-asc", "price-desc"]);
export type ProductOrderBy = z.infer<typeof ProductOrderBy>;
export const ProductSearchField = z.enum(["title"]);
export type ProductSearchField = z.infer<typeof ProductSearchField>;

export const ProductType = z.enum(["craft", "buy"]);
export type ProductType = z.infer<typeof ProductType>;
export const ProductStatus = z.enum(["active", "held", "hidden"]);
export type ProductStatus = z.infer<typeof ProductStatus>;

export namespace PRODUCT {
  // STATUS
  export const STATUS: EnumsLabelKo<ProductStatus> = {
    active: { ko: "활성" },
    held: { ko: "홀드" },
    hidden: { ko: "숨김" },
  };

  // TYPE
  export const TYPE: EnumsLabelKo<ProductType> = {
    craft: { ko: "제작" },
    buy: { ko: "사입" },
  };

  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<ProductOrderBy> = {
    "id-desc": { ko: "최신순" },
    "price-desc": { ko: "가격 높은순" },
    "price-asc": { ko: "가격 낮은순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<ProductSearchField> = {
    title: { ko: "상품명" },
  };
}
