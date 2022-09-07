import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const CategoryCanShowOnMain = z.enum(["1", "-1"]);
export type CategoryCanShowOnMain = z.infer<typeof CategoryCanShowOnMain>;
export const CategoryHasSizeIds = z.enum([
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
  "30",
  "31",
  "32",
  "33",
]);
export type CategoryHasSizeIds = z.infer<typeof CategoryHasSizeIds>;
export const CategoryStatus = z.enum(["10", "-10"]);
export type CategoryStatus = z.infer<typeof CategoryStatus>;
export const CategoryOrderBy = z.enum(["id-desc"]);
export type CategoryOrderBy = z.infer<typeof CategoryOrderBy>;
export const CategorySearchField = z.enum(["id"]);
export type CategorySearchField = z.infer<typeof CategorySearchField>;

export namespace CATEGORY {
  // CAN_SHOW_ON_MAIN
  export const CAN_SHOW_ON_MAIN: EnumsLabelKo<CategoryCanShowOnMain> = {
    "1": { ko: "가능" },
    "-1": { ko: "불가" },
  };

  // HAS_SIZE_IDS
  export const HAS_SIZE_IDS: EnumsLabelKo<CategoryHasSizeIds> = {
    "0": { ko: "426" },
    "1": { ko: "428" },
    "2": { ko: "429" },
    "3": { ko: "430" },
    "4": { ko: "432" },
    "5": { ko: "451" },
    "6": { ko: "452" },
    "7": { ko: "453" },
    "8": { ko: "454" },
    "9": { ko: "455" },
    "10": { ko: "456" },
    "11": { ko: "457" },
    "12": { ko: "458" },
    "13": { ko: "459" },
    "14": { ko: "460" },
    "15": { ko: "461" },
    "16": { ko: "462" },
    "17": { ko: "463" },
    "18": { ko: "473" },
    "19": { ko: "475" },
    "20": { ko: "477" },
    "21": { ko: "478" },
    "22": { ko: "419" },
    "23": { ko: "442" },
    "24": { ko: "433" },
    "25": { ko: "434" },
    "26": { ko: "435" },
    "27": { ko: "436" },
    "28": { ko: "437" },
    "29": { ko: "438" },
    "30": { ko: "439" },
    "31": { ko: "440" },
    "32": { ko: "466" },
    "33": { ko: "467" },
  };

  // STATUS
  export const STATUS: EnumsLabelKo<CategoryStatus> = {
    "10": { ko: "정상" },
    "-10": { ko: "숨김" },
  };

  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<CategoryOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<CategorySearchField> = {
    id: { ko: "ID" },
  };
}
