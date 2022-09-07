import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const ReviewOptions = z.enum(["closedshops"]);
export type ReviewOptions = z.infer<typeof ReviewOptions>;
export const ReviewRatings = z.enum(["2", "4", "6", "8", "10"]);
export type ReviewRatings = z.infer<typeof ReviewRatings>;
export const ReviewStatus = z.enum(["10", "-10"]);
export type ReviewStatus = z.infer<typeof ReviewStatus>;
export const ReviewOrderBy = z.enum(["id-desc"]);
export type ReviewOrderBy = z.infer<typeof ReviewOrderBy>;
export const ReviewSearchField = z.enum(["id"]);
export type ReviewSearchField = z.infer<typeof ReviewSearchField>;

export namespace REVIEW {
  // OPTIONS
  export const OPTIONS: EnumsLabelKo<ReviewOptions> = {
    closedshops: { ko: "" },
  };

  // RATINGS
  export const RATINGS: EnumsLabelKo<ReviewRatings> = {
    "2": { ko: "별로에요 :(" },
    "4": { ko: "그냥 그래요" },
    "6": { ko: "보통이에요 " },
    "8": { ko: "맘에 들어요" },
    "10": { ko: "매우 만족스러워요 :)" },
  };

  // STATUS
  export const STATUS: EnumsLabelKo<ReviewStatus> = {
    "10": { ko: "노출" },
    "-10": { ko: "삭제" },
  };

  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<ReviewOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<ReviewSearchField> = {
    id: { ko: "ID" },
  };
}
