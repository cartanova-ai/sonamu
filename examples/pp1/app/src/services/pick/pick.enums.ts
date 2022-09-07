import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const PickStatus = z.enum(["10", "-1"]);
export type PickStatus = z.infer<typeof PickStatus>;
export const PickOrderBy = z.enum(["id-desc"]);
export type PickOrderBy = z.infer<typeof PickOrderBy>;
export const PickSearchField = z.enum(["id"]);
export type PickSearchField = z.infer<typeof PickSearchField>;

export namespace PICK {
  // STATUS
  export const STATUS: EnumsLabelKo<PickStatus> = {
    "10": { ko: "구매대기" },
    "-1": { ko: "구매완료" },
  };

  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<PickOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<PickSearchField> = {
    id: { ko: "ID" },
  };
}
