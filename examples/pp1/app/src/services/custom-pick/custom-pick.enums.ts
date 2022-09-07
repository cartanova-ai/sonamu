import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const CustomPickOrderBy = z.enum(["id-desc"]);
export type CustomPickOrderBy = z.infer<typeof CustomPickOrderBy>;
export const CustomPickSearchField = z.enum(["id"]);
export type CustomPickSearchField = z.infer<typeof CustomPickSearchField>;

export namespace CUSTOM_PICK {
  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<CustomPickOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<CustomPickSearchField> = {
    id: { ko: "ID" },
  };
}
