import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const DealProductItemDeactivatedReason = z.enum([
  "exclude-high-src",
  "exclude-high-loss",
  "exclude-popular",
  "exclude-t200-stock",
]);
export type DealProductItemDeactivatedReason = z.infer<
  typeof DealProductItemDeactivatedReason
>;
export const DealIsEarlyEnded = z.enum(["10", "-10"]);
export type DealIsEarlyEnded = z.infer<typeof DealIsEarlyEnded>;
export const DealPreorderType = z.enum(["100", "200"]);
export type DealPreorderType = z.infer<typeof DealPreorderType>;
export const DealState = z.enum([
  "ready",
  "ready-active",
  "active",
  "ended",
  "closed",
]);
export type DealState = z.infer<typeof DealState>;
export const DealType = z.enum(["100", "110", "120", "200"]);
export type DealType = z.infer<typeof DealType>;
export const DealOrderBy = z.enum(["id-desc"]);
export type DealOrderBy = z.infer<typeof DealOrderBy>;
export const DealSearchField = z.enum(["id"]);
export type DealSearchField = z.infer<typeof DealSearchField>;

export namespace DEAL {
  // DEACTIVATED_REASON
  export const DEACTIVATED_REASON: EnumsLabelKo<DealProductItemDeactivatedReason> =
    {
      "exclude-high-src": { ko: "공급가높음" },
      "exclude-high-loss": { ko: "로스확률높음" },
      "exclude-popular": { ko: "재고대비인기상품" },
      "exclude-t200-stock": { ko: "구매대행: 재고없음" },
    };

  // IS_EARLY_ENDED
  export const IS_EARLY_ENDED: EnumsLabelKo<DealIsEarlyEnded> = {
    "10": { ko: "조기종료" },
    "-10": { ko: "조기종료 아님" },
  };

  // PREORDER_TYPE
  export const PREORDER_TYPE: EnumsLabelKo<DealPreorderType> = {
    "100": { ko: "일반" },
    "200": { ko: "스페셜오더" },
  };

  // STATE
  export const STATE: EnumsLabelKo<DealState> = {
    ready: { ko: "준비" },
    "ready-active": { ko: "준비-가입고대기" },
    active: { ko: "진행" },
    ended: { ko: "종료<24" },
    closed: { ko: "종료" },
  };

  // TYPE
  export const TYPE: EnumsLabelKo<DealType> = {
    "100": { ko: "일반" },
    "110": { ko: "프리오더" },
    "120": { ko: "예약구매" },
    "200": { ko: "인보이스" },
  };

  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<DealOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<DealSearchField> = {
    id: { ko: "ID" },
  };
}
