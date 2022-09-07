import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const SchannelBalanceType = z.enum([
  "1",
  "100",
  "201",
  "202",
  "300",
  "900",
]);
export type SchannelBalanceType = z.infer<typeof SchannelBalanceType>;
export const SchannelBalanceUnit = z.enum(["1", "100"]);
export type SchannelBalanceUnit = z.infer<typeof SchannelBalanceUnit>;
export const SchannelStatus = z.enum(["10", "-10"]);
export type SchannelStatus = z.infer<typeof SchannelStatus>;
export const SchannelType = z.enum(["100", "200"]);
export type SchannelType = z.infer<typeof SchannelType>;
export const SchannelOrderBy = z.enum(["id-desc"]);
export type SchannelOrderBy = z.infer<typeof SchannelOrderBy>;
export const SchannelSearchField = z.enum(["id"]);
export type SchannelSearchField = z.infer<typeof SchannelSearchField>;

export namespace SCHANNEL {
  // BALANCE_TYPE
  export const BALANCE_TYPE: EnumsLabelKo<SchannelBalanceType> = {
    "1": { ko: "즉시 정산 (자체결제)" },
    "100": { ko: "판매일 기준 정산" },
    "201": { ko: "익월 판매분 정산" },
    "202": { ko: "익월 전량 정산" },
    "300": { ko: "비정기 정산" },
    "900": { ko: "정산 제외" },
  };

  // BALANCE_UNIT
  export const BALANCE_UNIT: EnumsLabelKo<SchannelBalanceUnit> = {
    "1": { ko: "수량 단위" },
    "100": { ko: "퍼센트 단위" },
  };

  // STATUS
  export const STATUS: EnumsLabelKo<SchannelStatus> = {
    "10": { ko: "노출" },
    "-10": { ko: "숨김" },
  };

  // TYPE
  export const TYPE: EnumsLabelKo<SchannelType> = {
    "100": { ko: "온라인" },
    "200": { ko: "오프라인" },
  };

  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<SchannelOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<SchannelSearchField> = {
    id: { ko: "ID" },
  };
}
