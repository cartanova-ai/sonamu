import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const NotificationCaseKey = z.enum([
  "PUSH-P-S",
  "PUSH-P-PO",
  "PUSH-P-POB",
  "PUSH-P-RN",
  "PUSH-CUSTOM",
]);
export type NotificationCaseKey = z.infer<typeof NotificationCaseKey>;

export const NotificationOrderBy = z.enum(["id-desc"]);
export type NotificationOrderBy = z.infer<typeof NotificationOrderBy>;
export const NotificationSearchField = z.enum(["id"]);
export type NotificationSearchField = z.infer<typeof NotificationSearchField>;

export namespace NOTIFICATION {
  // CASE_KEY
  export const CASE_KEY: EnumsLabelKo<NotificationCaseKey> = {
    "PUSH-P-S": { ko: "입고알림" },
    "PUSH-P-PO": { ko: "타임세일 상품 입고알림" },
    "PUSH-P-POB": { ko: "타임세일 브랜드 입고알림" },
    "PUSH-P-RN": { ko: "리뉴얼 상품 입고알림" },
    "PUSH-CUSTOM": { ko: "공지사항/이벤트" },
  };

  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<NotificationOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<NotificationSearchField> = {
    id: { ko: "ID" },
  };
}
