import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const AppconfType = z.enum(["100", "200"]);
export type AppconfType = z.infer<typeof AppconfType>;
export const AppconfOrderBy = z.enum(["id-desc"]);
export type AppconfOrderBy = z.infer<typeof AppconfOrderBy>;
export const AppconfSearchField = z.enum(["id"]);
export type AppconfSearchField = z.infer<typeof AppconfSearchField>;

export namespace APPCONF {
  // TYPE
  export const TYPE: EnumsLabelKo<AppconfType> = {
    "100": { ko: "일반" },
    "200": { ko: "커스텀" },
  };

  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<AppconfOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<AppconfSearchField> = {
    id: { ko: "ID" },
  };
}
