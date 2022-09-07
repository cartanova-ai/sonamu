import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const InventoryActive = z.enum(["1", "-1"]);
export type InventoryActive = z.infer<typeof InventoryActive>;
export const InventoryAoType = z.enum(["100", "200", "300"]);
export type InventoryAoType = z.infer<typeof InventoryAoType>;
export const InventoryFilterAo = z.enum([
  "ao-seq-none",
  "ao-seq-all",
  "ao-type-200",
  "ao-type-300",
]);
export type InventoryFilterAo = z.infer<typeof InventoryFilterAo>;
export const InventoryPreset = z.enum([
  "buyable",
  "has-order",
  "not-has-order",
  "has-invoiced",
  "not-has-invoiced",
  "expensive-type100",
]);
export type InventoryPreset = z.infer<typeof InventoryPreset>;
export const InventoryReason = z.enum([
  "confirm-deal",
  "exclude",
  "exclude-high-src",
  "exclude-high-loss",
  "exclude-popular",
  "loss-cancel",
  "moved-loss",
  "refund-ready",
  "misdelivered",
  "defect",
  "temp-delayed",
  "stock-missed",
  "temp-op",
  "inhouse-origin",
]);
export type InventoryReason = z.infer<typeof InventoryReason>;
export const InventoryType = z.enum(["101", "110", "120"]);
export type InventoryType = z.infer<typeof InventoryType>;
export const InventoryOrderBy = z.enum(["id-desc"]);
export type InventoryOrderBy = z.infer<typeof InventoryOrderBy>;
export const InventorySearchField = z.enum(["id"]);
export type InventorySearchField = z.infer<typeof InventorySearchField>;

export namespace INVENTORY {
  // ACTIVE
  export const ACTIVE: EnumsLabelKo<InventoryActive> = {
    "1": { ko: "활성" },
    "-1": { ko: "비활성" },
  };

  // AO_TYPE
  export const AO_TYPE: EnumsLabelKo<InventoryAoType> = {
    "100": { ko: "로스고위험" },
    "200": { ko: "추가오더" },
    "300": { ko: "주문건취합" },
  };

  // FILTER_AO
  export const FILTER_AO: EnumsLabelKo<InventoryFilterAo> = {
    "ao-seq-none": { ko: "오더리스트 미포함" },
    "ao-seq-all": { ko: "오더리스트 포함" },
    "ao-type-200": { ko: "추가오더분" },
    "ao-type-300": { ko: "주문건취합" },
  };

  // PRESET
  export const PRESET: EnumsLabelKo<InventoryPreset> = {
    buyable: { ko: "구매가능" },
    "has-order": { ko: "주문건연결" },
    "not-has-order": { ko: "주문건없음" },
    "has-invoiced": { ko: "인보이스 확정" },
    "not-has-invoiced": { ko: "인보이스 미확정" },
    "expensive-type100": { ko: "판매가초과매입인벤토리" },
  };

  // REASON
  export const REASON: EnumsLabelKo<InventoryReason> = {
    "confirm-deal": { ko: "가입고확정" },
    exclude: { ko: "재고비활성화(알수없음)" },
    "exclude-high-src": { ko: "재고비활성화(공급가높음)" },
    "exclude-high-loss": { ko: "재고비활성화(로스확률높음)" },
    "exclude-popular": { ko: "재고비활성화(재고대비인기상품)" },
    "loss-cancel": { ko: "품절취소" },
    "moved-loss": { ko: "주문건이전(로스)" },
    "refund-ready": { ko: "반품대기" },
    misdelivered: { ko: "오배송" },
    defect: { ko: "제품하자" },
    "temp-delayed": { ko: "물류지연" },
    "stock-missed": { ko: "재고누락" },
    "temp-op": { ko: "운영임시처리" },
    "inhouse-origin": { ko: "인하우스빠른배송원본" },
  };

  // TYPE
  export const TYPE: EnumsLabelKo<InventoryType> = {
    "101": { ko: "매입" },
    "110": { ko: "프리오더" },
    "120": { ko: "예약구매" },
  };

  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<InventoryOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<InventorySearchField> = {
    id: { ko: "ID" },
  };
}
