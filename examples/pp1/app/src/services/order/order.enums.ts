import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const OrderAvailable = z.enum([
  "5",
  "9",
  "10",
  "20",
  "21",
  "22",
  "25",
  "40",
  "100",
  "140",
  "-20",
  "-29",
  "-30",
  "-5",
  "-9",
  "-10",
]);
export type OrderAvailable = z.infer<typeof OrderAvailable>;
export const OrderCrStatus = z.enum(["not", "request", "issued"]);
export type OrderCrStatus = z.infer<typeof OrderCrStatus>;
export const OrderCrType = z.enum(["person", "company"]);
export type OrderCrType = z.infer<typeof OrderCrType>;
export const OrderFilter = z.enum(["loss-replacement-needed"]);
export type OrderFilter = z.infer<typeof OrderFilter>;
export const OrderLogType = z.enum([
  "checkout",
  "modifyForm",
  "paymentResponse",
  "dlogResponse",
  "dlogResponseAdmin",
  "cancel/user-normal",
  "cancel/admin-normal",
  "cancel/admin-loss",
  "cancel/server-soldout",
  "cancel/server-unpaid",
  "cancel/admin-confirm-refund",
  "actionStatusTo9",
  "actionStatusTo20",
  "actionStatusTo21",
  "actionStatusTo22",
  "setLogiKey",
  "requestReturn",
  "cancelRequestReturn",
  "confirmRefund",
  "logiCompleted",
  "rollbackStatusTo10",
  "rollbackStatusTo20",
  "rollbackStatusTo21",
  "rollbackStatusTo22",
  "rollbackRefund",
  "rollbackCancel",
  "addCsNote",
  "setCashReceiptIssued",
  "unsetCashReceiptIssued",
  "setLossReplacementNeeded",
  "unsetLossReplacementNeeded",
  "setRestockCsNeeded",
  "unsetRestockCsNeeded",
]);
export type OrderLogType = z.infer<typeof OrderLogType>;
export const OrderType = z.enum(["101", "102", "200", "601"]);
export type OrderType = z.infer<typeof OrderType>;
export const OrderPenaltyPaymentType = z.enum([
  "extra-cancel",
  "user-deposit",
  "balancing",
]);
export type OrderPenaltyPaymentType = z.infer<typeof OrderPenaltyPaymentType>;
export const OrderReasonText = z.enum([
  "user-normal",
  "admin-normal",
  "admin-loss",
  "admin-confirm-refund",
  "admin-unpaid",
  "server-soldout",
  "server-unpaid",
]);
export type OrderReasonText = z.infer<typeof OrderReasonText>;
export const OrderItemStatus = z.enum([
  "5",
  "9",
  "10",
  "20",
  "21",
  "22",
  "25",
  "40",
  "100",
  "140",
  "-1",
  "-5",
  "-9",
  "-10",
  "-20",
  "-29",
  "-30",
]);
export type OrderItemStatus = z.infer<typeof OrderItemStatus>;
export const OrderOrderBy = z.enum(["id-desc"]);
export type OrderOrderBy = z.infer<typeof OrderOrderBy>;
export const OrderSearchField = z.enum(["id"]);
export type OrderSearchField = z.infer<typeof OrderSearchField>;

export namespace ORDER {
  // AVAILABLE
  export const AVAILABLE: EnumsLabelKo<OrderAvailable> = {
    "5": { ko: "" },
    "9": { ko: "dlogResponse,dlogResponseAdmin,userCancel,adminNormalCancel" },
    "10": {
      ko: "actionStatusTo20,actionStatusTo22,userCancel,adminNormalCancel",
    },
    "20": {
      ko: "actionStatusTo21,adminNormalCancel,adminLossCancel,rollbackStatusTo10,setLossReplacementNeeded",
    },
    "21": { ko: "setLogiKey,adminNormalCancel,rollbackStatusTo20" },
    "22": { ko: "setLogiKey,adminNormalCancel,rollbackStatusTo10" },
    "25": {
      ko: "checkLogiComplete,requestReturn,rollbackStatusTo21,rollbackStatusTo22",
    },
    "40": { ko: "" },
    "100": { ko: "requestReturn,writeReview" },
    "140": { ko: "" },
    "-20": { ko: "cancelRequestReturn,confirmReturn" },
    "-29": { ko: "confirmRefund" },
    "-30": { ko: "rollbackRefund" },
    "-5": { ko: "confirmUnpaidCancel" },
    "-9": { ko: "confirmRefund" },
    "-10": { ko: "rollbackRefund" },
  };

  // CR_STATUS
  export const CR_STATUS: EnumsLabelKo<OrderCrStatus> = {
    not: { ko: "미발행" },
    request: { ko: "발행요청" },
    issued: { ko: "발행확인" },
  };

  // CR_TYPE
  export const CR_TYPE: EnumsLabelKo<OrderCrType> = {
    person: { ko: "개인" },
    company: { ko: "사업자" },
  };

  // FILTER
  export const FILTER: EnumsLabelKo<OrderFilter> = {
    "loss-replacement-needed": { ko: "로스대체필요" },
  };

  // LOG_TYPE
  export const LOG_TYPE: EnumsLabelKo<OrderLogType> = {
    checkout: { ko: "체크아웃" },
    modifyForm: { ko: "주문서수정" },
    paymentResponse: { ko: "결제확인-아임포트" },
    dlogResponse: { ko: "결제확인-무통장" },
    dlogResponseAdmin: { ko: "관리자결제확인-무통장" },
    "cancel/user-normal": { ko: "취소-고객취소" },
    "cancel/admin-normal": { ko: "취소-관리자일반" },
    "cancel/admin-loss": { ko: "취소-관리자로스" },
    "cancel/server-soldout": { ko: "취소-서버품절" },
    "cancel/server-unpaid": { ko: "취소-서버미입금" },
    "cancel/admin-confirm-refund": { ko: "취소-반품확인" },
    actionStatusTo9: { ko: "입금대기처리" },
    actionStatusTo20: { ko: "해외배송대기처리" },
    actionStatusTo21: { ko: "해외배송중처리" },
    actionStatusTo22: { ko: "국내배송대기처리" },
    setLogiKey: { ko: "송장번호입력" },
    requestReturn: { ko: "반품신청" },
    cancelRequestReturn: { ko: "반품신청취소" },
    confirmRefund: { ko: "환불완료처리" },
    logiCompleted: { ko: "배송완료처리" },
    rollbackStatusTo10: { ko: "롤백: 결제완료" },
    rollbackStatusTo20: { ko: "롤백: 해외배송대기" },
    rollbackStatusTo21: { ko: "롤백: 해외배송중" },
    rollbackStatusTo22: { ko: "롤백: 국내배송대기" },
    rollbackRefund: { ko: "롤백: 환불대기" },
    rollbackCancel: { ko: "무통장입금건-취소롤백" },
    addCsNote: { ko: "CS메모추가" },
    setCashReceiptIssued: { ko: "현금영수증발행완료처리" },
    unsetCashReceiptIssued: { ko: "현금영수증발행완료취소처리" },
    setLossReplacementNeeded: { ko: "로스대체필요설정" },
    unsetLossReplacementNeeded: { ko: "로스대체필요수동해제" },
    setRestockCsNeeded: { ko: "재입고CS필요설정" },
    unsetRestockCsNeeded: { ko: "재입고CS필요해제" },
  };

  // ORDER_TYPE
  export const ORDER_TYPE: EnumsLabelKo<OrderType> = {
    "101": { ko: "회원 직접 구매" },
    "102": { ko: "회원 장바구니 구매" },
    "200": { ko: "비회원 구매" },
    "601": { ko: "외부채널 주문" },
  };

  // PENALTY_PAYMENT_TYPE
  export const PENALTY_PAYMENT_TYPE: EnumsLabelKo<OrderPenaltyPaymentType> = {
    "extra-cancel": { ko: "부분취소금액차감" },
    "user-deposit": { ko: "고객별도입금" },
    balancing: { ko: "환불금액차감" },
  };

  // REASON_TEXT
  export const REASON_TEXT: EnumsLabelKo<OrderReasonText> = {
    "user-normal": { ko: "고객 취소" },
    "admin-normal": { ko: "관리자 취소" },
    "admin-loss": { ko: "로스" },
    "admin-confirm-refund": { ko: "반품" },
    "admin-unpaid": { ko: "입금기간경과(관리자)" },
    "server-soldout": { ko: "품절" },
    "server-unpaid": { ko: "입금기간경과(서버)" },
  };

  // ITEM_STATUS
  export const ITEM_STATUS: EnumsLabelKo<OrderItemStatus> = {
    "5": { ko: "결제대기" },
    "9": { ko: "입금대기" },
    "10": { ko: "결제완료" },
    "20": { ko: "해외배송대기" },
    "21": { ko: "해외배송중" },
    "22": { ko: "국내배송대기" },
    "25": { ko: "국내배송중" },
    "40": { ko: "교환대기" },
    "100": { ko: "배송완료" },
    "140": { ko: "교환완료" },
    "-1": { ko: "삭제" },
    "-5": { ko: "미입금취소대기" },
    "-9": { ko: "취소환불대기(무통장)" },
    "-10": { ko: "취소완료" },
    "-20": { ko: "반품대기" },
    "-29": { ko: "반품환불대기(무통장)" },
    "-30": { ko: "반품완료" },
  };

  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<OrderOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<OrderSearchField> = {
    id: { ko: "ID" },
  };
}
