import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const PlogSpecials = z.enum(["0", "1"]);
export type PlogSpecials = z.infer<typeof PlogSpecials>;
export const PlogStatus = z.enum(["5", "10", "-1"]);
export type PlogStatus = z.infer<typeof PlogStatus>;
export const PlogType = z.enum([
  "100",
  "110",
  "200",
  "210",
  "220",
  "250",
  "260",
  "270",
  "300",
  "400",
  "501",
  "800",
  "900",
  "950",
]);
export type PlogType = z.infer<typeof PlogType>;

export const PlogFilter = z.enum(["current-month"]);
export type PlogFilter = z.infer<typeof PlogFilter>;

export const PlogOrderBy = z.enum(["id-desc"]);
export type PlogOrderBy = z.infer<typeof PlogOrderBy>;
export const PlogSearchField = z.enum(["id"]);
export type PlogSearchField = z.infer<typeof PlogSearchField>;

export namespace PLOG {
  // SPECIALS
  export const SPECIALS: EnumsLabelKo<PlogSpecials> = {
    "0": { ko: "1213RED" },
    "1": { ko: "1128RED" },
  };

  // STATUS
  export const STATUS: EnumsLabelKo<PlogStatus> = {
    "5": { ko: "대기" },
    "10": { ko: "사용가능" },
    "-1": { ko: "삭제" },
  };

  // TYPE
  export const TYPE: EnumsLabelKo<PlogType> = {
    "100": { ko: "리뷰 작성 적립" },
    "110": { ko: "리뷰 SNS URL 추가 적립" },
    "200": { ko: "회원가입 적립" },
    "210": { ko: "추천가입 적립" },
    "220": { ko: "추천인 적립" },
    "250": { ko: "이벤트 멤버십 가입 포인트 지급" },
    "260": { ko: "쿠폰 적립" },
    "270": { ko: "출석체크 적립" },
    "300": { ko: "구매 적립" },
    "400": { ko: "사용" },
    "501": { ko: "프리오더 주문취소 적립" },
    "800": { ko: "환불" },
    "900": { ko: "관리자 부여" },
    "950": { ko: "관리자 차감" },
  };

  // FILTER
  export const FILTER: EnumsLabelKo<PlogFilter> = {
    "current-month": { ko: "현재 월" },
  };

  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<PlogOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<PlogSearchField> = {
    id: { ko: "ID" },
  };
}
