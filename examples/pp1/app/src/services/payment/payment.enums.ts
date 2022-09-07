import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const PaymentStatus = z.enum(["7", "9", "10", "-99", "-10"]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;
export const PaymentType = z.enum([
  "100",
  "101",
  "201",
  "202",
  "203",
  "402",
  "403",
]);
export type PaymentType = z.infer<typeof PaymentType>;
export const PaymentOrderBy = z.enum(["id-desc"]);
export type PaymentOrderBy = z.infer<typeof PaymentOrderBy>;
export const PaymentSearchField = z.enum(["id"]);
export type PaymentSearchField = z.infer<typeof PaymentSearchField>;

export namespace PAYMENT {
  // STATUS
  export const STATUS: EnumsLabelKo<PaymentStatus> = {
    "7": { ko: "부분취소" },
    "9": { ko: "결제대기" },
    "10": { ko: "결제승인" },
    "-99": { ko: "결제실패" },
    "-10": { ko: "전체취소" },
  };

  // TYPE
  export const TYPE: EnumsLabelKo<PaymentType> = {
    "100": { ko: "무통장입금" },
    "101": { ko: "가상계좌" },
    "201": { ko: "신용카드" },
    "202": { ko: "실시간계좌이체" },
    "203": { ko: "휴대폰결제" },
    "402": { ko: "카카오페이" },
    "403": { ko: "삼성페이" },
  };

  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<PaymentOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<PaymentSearchField> = {
    id: { ko: "ID" },
  };
}
