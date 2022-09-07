import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const CoverOrderBy = z.enum(["id-desc"]);
export type CoverOrderBy = z.infer<typeof CoverOrderBy>;
export const CoverSearchField = z.enum(["id"]);
export type CoverSearchField = z.infer<typeof CoverSearchField>;
export const CoverItemStatus = z.enum(["10", "-10"]);
export type CoverItemStatus = z.infer<typeof CoverItemStatus>;

export namespace COVER {
  // ITEM_STATUS
  export const ITEM_STATUS: EnumsLabelKo<CoverItemStatus> = {
    "10": { ko: "노출" },
    "-10": { ko: "숨김" },
  };

  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<CoverOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<CoverSearchField> = {
    id: { ko: "ID" },
  };
}
