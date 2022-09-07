import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const ExrefreqReasons = z.enum([
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
]);
export type ExrefreqReasons = z.infer<typeof ExrefreqReasons>;
export const ExrefreqType = z.enum(["200", "400"]);
export type ExrefreqType = z.infer<typeof ExrefreqType>;
export const ExrefreqOrderBy = z.enum(["id-desc"]);
export type ExrefreqOrderBy = z.infer<typeof ExrefreqOrderBy>;
export const ExrefreqSearchField = z.enum(["id"]);
export type ExrefreqSearchField = z.infer<typeof ExrefreqSearchField>;

export namespace EXREFREQ {
  // REASONS
  export const REASONS: EnumsLabelKo<ExrefreqReasons> = {
    "100": { ko: "색상 및 사이즈 변경" },
    "200": { ko: "다른 상품 잘못 주문" },
    "300": { ko: "서비스 불만족" },
    "400": { ko: "상품파손" },
    "500": { ko: "상품정보 상이" },
    "600": { ko: "오배송" },
    "700": { ko: "색상 등 다른상품 오배송" },
    "800": { ko: "단순변심" },
  };

  // TYPE
  export const TYPE: EnumsLabelKo<ExrefreqType> = {
    "200": { ko: "반품" },
    "400": { ko: "교환" },
  };

  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<ExrefreqOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<ExrefreqSearchField> = {
    id: { ko: "ID" },
  };
}
