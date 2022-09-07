import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const CartitemOrderBy = z.enum(["id-desc"]);
export type CartitemOrderBy = z.infer<typeof CartitemOrderBy>;
export const CartitemSearchField = z.enum(["id"]);
export type CartitemSearchField = z.infer<typeof CartitemSearchField>;

export namespace CARTITEM {
  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<CartitemOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<CartitemSearchField> = {
    id: { ko: "ID" },
  };
}
