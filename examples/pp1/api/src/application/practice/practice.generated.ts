import { z } from "zod";

export const PracticeBaseSchema = z.object({});
export type PracticeBaseSchema = z.infer<typeof PracticeBaseSchema>;

export const PracticeSubsetA = z.object({});
export type PracticeSubsetA = z.infer<typeof PracticeSubsetA>;

export type PracticeSubsetMapping = {
  A: PracticeSubsetA;
};
export const PracticeSubsetKey = z.enum(["A"]);
export type PracticeSubsetKey = z.infer<typeof PracticeSubsetKey>;

/* BEGIN- Server-side Only */
import { SubsetQuery } from "@sonamu/core";
export const practiceSubsetQueries: {
  [key in PracticeSubsetKey]: SubsetQuery;
} = { A: { select: [], virtual: [], joins: [], loaders: [] } };

export type PracticeFieldExpr = string;
/* END Server-side Only */
