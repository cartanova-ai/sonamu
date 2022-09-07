import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const DlogStatus = z.enum(["5", "10", "-10"]);
export type DlogStatus = z.infer<typeof DlogStatus>;
export const DlogOrderBy = z.enum(["id-desc"]);
export type DlogOrderBy = z.infer<typeof DlogOrderBy>;
export const DlogSearchField = z.enum(["id"]);
export type DlogSearchField = z.infer<typeof DlogSearchField>;

export namespace DLOG {
  // STATUS
  export const STATUS: EnumsLabelKo<DlogStatus> = {
    "5": { ko: "대기" },
    "10": { ko: "정상" },
    "-10": { ko: "실패" },
  };

  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<DlogOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<DlogSearchField> = {
    id: { ko: "ID" },
  };
}
