import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const UserKeywordOrderBy = z.enum(["id-desc"]);
export type UserKeywordOrderBy = z.infer<typeof UserKeywordOrderBy>;
export const UserKeywordSearchField = z.enum(["id"]);
export type UserKeywordSearchField = z.infer<typeof UserKeywordSearchField>;
export const UserKeywordType = z.enum(["100", "200"]);
export type UserKeywordType = z.infer<typeof UserKeywordType>;

export namespace USER_KEYWORD {
  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<UserKeywordOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<UserKeywordSearchField> = {
    id: { ko: "ID" },
  };

  // TYPE
  export const TYPE: EnumsLabelKo<UserKeywordType> = {
    "100": { ko: "직접입력" },
    "200": { ko: "선택" },
  };
}
