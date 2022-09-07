import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const LogiOrderBy = z.enum(["id-desc"]);
export type LogiOrderBy = z.infer<typeof LogiOrderBy>;
export const LogiSearchField = z.enum(["id"]);
export type LogiSearchField = z.infer<typeof LogiSearchField>;

export namespace LOGI {
  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<LogiOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<LogiSearchField> = {
    id: { ko: "ID" },
  };
}
