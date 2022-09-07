import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const PgroupFilter = z.enum([
  "onsale",
  "has-pick",
  "sorted-new",
  "pick",
  "buyable",
  "send-today",
]);
export type PgroupFilter = z.infer<typeof PgroupFilter>;
export const PgroupStatus = z.enum(["10", "-10"]);
export type PgroupStatus = z.infer<typeof PgroupStatus>;
export const PgroupToShowCategory = z.enum(["1", "-1"]);
export type PgroupToShowCategory = z.infer<typeof PgroupToShowCategory>;
export const PgroupToShowSoldout = z.enum(["1", "-1"]);
export type PgroupToShowSoldout = z.infer<typeof PgroupToShowSoldout>;
export const PgroupType = z.enum(["100", "200"]);
export type PgroupType = z.infer<typeof PgroupType>;
export const PgroupOrderBy = z.enum(["id-desc"]);
export type PgroupOrderBy = z.infer<typeof PgroupOrderBy>;
export const PgroupSearchField = z.enum(["id"]);
export type PgroupSearchField = z.infer<typeof PgroupSearchField>;

export namespace PGROUP {
  // FILTER
  export const FILTER: EnumsLabelKo<PgroupFilter> = {
    onsale: { ko: "판매중" },
    "has-pick": { ko: "픽 있는 상품" },
    "sorted-new": { ko: "2주이내신상품" },
    pick: { ko: "품절(PICK가능)" },
    buyable: { ko: "구매가능" },
    "send-today": { ko: "당일발송가능" },
  };

  // STATUS
  export const STATUS: EnumsLabelKo<PgroupStatus> = {
    "10": { ko: "노출" },
    "-10": { ko: "숨김" },
  };

  // TO_SHOW_CATEGORY
  export const TO_SHOW_CATEGORY: EnumsLabelKo<PgroupToShowCategory> = {
    "1": { ko: "노출" },
    "-1": { ko: "숨김" },
  };

  // TO_SHOW_SOLDOUT
  export const TO_SHOW_SOLDOUT: EnumsLabelKo<PgroupToShowSoldout> = {
    "1": { ko: "노출" },
    "-1": { ko: "숨김" },
  };

  // TYPE
  export const TYPE: EnumsLabelKo<PgroupType> = {
    "100": { ko: "수동" },
    "200": { ko: "자동" },
  };

  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<PgroupOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<PgroupSearchField> = {
    id: { ko: "ID" },
  };
}
