import { pick } from "lodash";
import { z } from "zod";
import { EnumsLabelKo } from "sonamu";

export const UserOrderBy = z.enum(["id-desc"]);
export type UserOrderBy = z.infer<typeof UserOrderBy>;

export const UserSearchField = z.enum(["name", "string_id"]);
export type UserSearchField = z.infer<typeof UserSearchField>;

export const UserRole = z.enum(["normal", "staff", "supervisor"]);
export type UserRole = z.infer<typeof UserRole>;

export const UserStatus = z.enum(["ready", "active", "held"]);
export type UserStatus = z.infer<typeof UserStatus>;

export namespace USER {
  // ROLE
  export const ROLE: EnumsLabelKo<UserRole> = {
    normal: { ko: "일반" },
    staff: { ko: "스탭" },
    supervisor: { ko: "최고관리자" },
  };

  // STATUS
  export const STATUS: EnumsLabelKo<UserStatus> = {
    ready: { ko: "대기" },
    active: { ko: "활성" },
    held: { ko: "중지" },
  };
  export const PUBLIC_STATUS = pick(STATUS, ["ready", "active"]);

  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<UserOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<UserSearchField> = {
    name: { ko: "이름" },
    string_id: { ko: "로그인ID" },
  };
}
