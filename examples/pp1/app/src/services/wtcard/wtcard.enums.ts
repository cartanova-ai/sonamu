import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const WtcardStatus = z.enum(["10", "-10"]);
export type WtcardStatus = z.infer<typeof WtcardStatus>;
export const WtcardOrderBy = z.enum(["id-desc"]);
export type WtcardOrderBy = z.infer<typeof WtcardOrderBy>;
export const WtcardSearchField = z.enum(["id"]);
export type WtcardSearchField = z.infer<typeof WtcardSearchField>;

export namespace WTCARD {
  // STATUS
  export const STATUS: EnumsLabelKo<WtcardStatus> = {
    "10": { ko: "정상" },
    "-10": { ko: "만료" },
  };

  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<WtcardOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<WtcardSearchField> = {
    id: { ko: "ID" },
  };
}
