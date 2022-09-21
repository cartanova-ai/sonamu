import { z } from "zod";
import { EnumsLabelKo } from "sonamu";

export const BrandOrderBy = z.enum(["id-desc"]);
export type BrandOrderBy = z.infer<typeof BrandOrderBy>;
export const BrandSearchField = z.enum(["id"]);
export type BrandSearchField = z.infer<typeof BrandSearchField>;

export namespace BRAND {
  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<BrandOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<BrandSearchField> = {
    id: { ko: "ID" },
  };
}
