import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const HkeywordIsFixed = z.enum(["1", "2"]);
export type HkeywordIsFixed = z.infer<typeof HkeywordIsFixed>;
export const HkeywordStatus = z.enum(["10", "-1"]);
export type HkeywordStatus = z.infer<typeof HkeywordStatus>;
export const HkeywordOrderBy = z.enum(["id-desc"]);
export type HkeywordOrderBy = z.infer<typeof HkeywordOrderBy>;
export const HkeywordSearchField = z.enum(["id"]);
export type HkeywordSearchField = z.infer<typeof HkeywordSearchField>;

export namespace HKEYWORD {
  // IS_FIXED
  export const IS_FIXED: EnumsLabelKo<HkeywordIsFixed> = {
    "1": { ko: "미사용" },
    "2": { ko: "사용" },
  };

  // STATUS
  export const STATUS: EnumsLabelKo<HkeywordStatus> = {
    "10": { ko: "노출" },
    "-1": { ko: "숨김" },
  };

  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<HkeywordOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<HkeywordSearchField> = {
    id: { ko: "ID" },
  };
}
