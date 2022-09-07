import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const SizetableContentFields = z.enum(["normal", "kids"]);
export type SizetableContentFields = z.infer<typeof SizetableContentFields>;
export const SizetableDefaultSize = z.enum([
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
]);
export type SizetableDefaultSize = z.infer<typeof SizetableDefaultSize>;
export const SizetableGender = z.enum(["1", "2", "3", "4"]);
export type SizetableGender = z.infer<typeof SizetableGender>;
export const SizetableOrderBy = z.enum(["id-desc"]);
export type SizetableOrderBy = z.infer<typeof SizetableOrderBy>;
export const SizetableSearchField = z.enum(["id"]);
export type SizetableSearchField = z.infer<typeof SizetableSearchField>;

export namespace SIZETABLE {
  // CONTENT_FIELDS
  export const CONTENT_FIELDS: {
    [key in SizetableContentFields]: { key: string; name: string }[];
  } = {
    normal: [
      {
        key: "standard",
        name: "표준",
      },
      {
        key: "kr",
        name: "한국(KR)",
      },
      {
        key: "eu",
        name: "유럽(EU)",
      },
      {
        key: "it",
        name: "이탈리아(IT)",
      },
      {
        key: "uk",
        name: "영국(UK)",
      },
      {
        key: "fr",
        name: "프랑스(FR)",
      },
      {
        key: "us",
        name: "미국(US)",
      },
      {
        key: "ger",
        name: "독일(GER)",
      },
      {
        key: "waist_cm",
        name: "WAIST (CM)",
      },
      {
        key: "waist_inch",
        name: "WAIST (INCHES)",
      },
      {
        key: "cm",
        name: "CM",
      },
      {
        key: "numerical",
        name: "NUMERICAL",
      },
    ],
    kids: [
      {
        key: "standard",
        name: "표준",
      },
      {
        key: "kr",
        name: "한국(KR)",
      },
      {
        key: "eu",
        name: "유럽(EU)",
      },
      {
        key: "uk",
        name: "영국(UK)",
      },
      {
        key: "age",
        name: "나이",
      },
      {
        key: "height_cm",
        name: "신장(cm)",
      },
      {
        key: "height_inch",
        name: "신장(inch)",
      },
      {
        key: "chest_cm",
        name: "가슴(cm)",
      },
      {
        key: "waist_cm",
        name: "허리(cm)",
      },
      {
        key: "feet_mm",
        name: "발길이(mm)",
      },
      {
        key: "hip_cm",
        name: "힙(cm)",
      },
      {
        key: "head_cm",
        name: "머리(cm)",
      },
      {
        key: "weight_kg",
        name: "몸무게(kg)",
      },
    ],
  };

  // DEFAULT_SIZE
  export const DEFAULT_SIZE: EnumsLabelKo<SizetableDefaultSize> = {
    "0": { ko: "XXXS" },
    "1": { ko: "XXXS-XXS" },
    "2": { ko: "XXS" },
    "3": { ko: "XXS-XS" },
    "4": { ko: "XS" },
    "5": { ko: "XS-S" },
    "6": { ko: "S" },
    "7": { ko: "S-M" },
    "8": { ko: "M" },
    "9": { ko: "M-L" },
    "10": { ko: "L" },
    "11": { ko: "L-XL" },
    "12": { ko: "XL" },
    "13": { ko: "XL-XXL" },
    "14": { ko: "XXL" },
    "15": { ko: "XXL-XXXL" },
    "16": { ko: "XXXL" },
    "17": { ko: "XXXXL" },
  };

  // GENDER
  export const GENDER: EnumsLabelKo<SizetableGender> = {
    "1": { ko: "남성" },
    "2": { ko: "여성" },
    "3": { ko: "공용" },
    "4": { ko: "키즈" },
  };

  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<SizetableOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<SizetableSearchField> = {
    id: { ko: "ID" },
  };
}
