import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const ApopupIsTesting = z.enum(["10", "-10"]);
export type ApopupIsTesting = z.infer<typeof ApopupIsTesting>;
export const ApopupStatus = z.enum(["10", "-10"]);
export type ApopupStatus = z.infer<typeof ApopupStatus>;
export const ApopupOrderBy = z.enum(["id-desc"]);
export type ApopupOrderBy = z.infer<typeof ApopupOrderBy>;
export const ApopupSearchField = z.enum(["id"]);
export type ApopupSearchField = z.infer<typeof ApopupSearchField>;

export namespace APOPUP {
  // IS_TESTING
  export const IS_TESTING: EnumsLabelKo<ApopupIsTesting> = {
    "10": { ko: "테스트" },
    "-10": { ko: "테스트 아님" },
  };

  // STATUS
  export const STATUS: EnumsLabelKo<ApopupStatus> = {
    "10": { ko: "노출" },
    "-10": { ko: "숨김" },
  };

  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<ApopupOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<ApopupSearchField> = {
    id: { ko: "ID" },
  };
}
