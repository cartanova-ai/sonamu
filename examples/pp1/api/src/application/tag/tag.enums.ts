import { z } from "zod";
import { EnumsLabelKo } from "@sonamu/core";

export const TagOrderBy = z.enum(["id-desc"]);
export type TagOrderBy = z.infer<typeof TagOrderBy>;
export const TagSearchField = z.enum(["id", "name"]);
export type TagSearchField = z.infer<typeof TagSearchField>;

export namespace TAG {
  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<TagOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<TagSearchField> = {
    id: { ko: "ID" },
    name: { ko: "태그명" },
  };
}
