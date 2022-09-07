import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const ExrefOrderBy = z.enum(["id-desc"]);
export type ExrefOrderBy = z.infer<typeof ExrefOrderBy>;
export const ExrefSearchField = z.enum(["id"]);
export type ExrefSearchField = z.infer<typeof ExrefSearchField>;

export namespace EXREF {
  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<ExrefOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<ExrefSearchField> = {
    id: { ko: "ID" },
  };
}
