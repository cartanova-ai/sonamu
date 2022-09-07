import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const LogicompanyOrderBy = z.enum(["id-desc"]);
export type LogicompanyOrderBy = z.infer<typeof LogicompanyOrderBy>;
export const LogicompanySearchField = z.enum(["id"]);
export type LogicompanySearchField = z.infer<typeof LogicompanySearchField>;

export namespace LOGICOMPANY {
  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<LogicompanyOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<LogicompanySearchField> = {
    id: { ko: "ID" },
  };
}
