import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const ReplyOrderBy = z.enum(["id-desc"]);
export type ReplyOrderBy = z.infer<typeof ReplyOrderBy>;
export const ReplySearchField = z.enum(["id"]);
export type ReplySearchField = z.infer<typeof ReplySearchField>;

export namespace REPLY {
  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<ReplyOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<ReplySearchField> = {
    id: { ko: "ID" },
  };
}
