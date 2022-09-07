import { z } from "zod";
import { SubsetQuery, zArrayable } from "../../typeframe/shared";
import {
  ApopupStatus,
  ApopupIsTesting,
  ApopupSearchField,
  ApopupOrderBy,
} from "./apopup.enums";

export const ApopupBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  title: z.string().max(128),
  p_img_url: z.string().max(128),
  m_img_url: z.string().max(128),
  link: z.string().max(256),
  status: ApopupStatus,
  created_at: z.string(),
  is_testing: ApopupIsTesting,
  began_at: z.string().nullable(),
  ended_at: z.string().nullable(),
});
export type ApopupBaseSchema = z.infer<typeof ApopupBaseSchema>;
export const ApopupBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: ApopupSearchField,
    keyword: z.string(),
    orderBy: ApopupOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
    status: ApopupStatus,
    is_testing: ApopupIsTesting,
  })
  .partial();
export type ApopupBaseListParams = z.infer<typeof ApopupBaseListParams>;

export const ApopupSubsetA = z.object({
  id: z.number().int().nonnegative(),
  title: z.string().max(128),
  p_img_url: z.string().max(128),
  m_img_url: z.string().max(128),
  link: z.string().max(256),
  status: ApopupStatus,
  created_at: z.string(),
  is_testing: ApopupIsTesting,
  began_at: z.string().nullable(),
  ended_at: z.string().nullable(),
});
export type ApopupSubsetA = z.infer<typeof ApopupSubsetA>;

export const ApopupSubsetP = z.object({
  id: z.number().int().nonnegative(),
  title: z.string().max(128),
  p_img_url: z.string().max(128),
  m_img_url: z.string().max(128),
  link: z.string().max(256),
  status: ApopupStatus,
  created_at: z.string(),
  is_testing: ApopupIsTesting,
  began_at: z.string().nullable(),
  ended_at: z.string().nullable(),
});
export type ApopupSubsetP = z.infer<typeof ApopupSubsetP>;

export type ApopupSubsetMapping = {
  A: ApopupSubsetA;
  P: ApopupSubsetP;
};
export const ApopupSubsetKey = z.enum(["A", "P"]);
export type ApopupSubsetKey = z.infer<typeof ApopupSubsetKey>;

export const apopupSubsetQueries: { [key in ApopupSubsetKey]: SubsetQuery } = {
  A: {
    select: [
      "apopups.id",
      "apopups.title",
      "apopups.p_img_url",
      "apopups.m_img_url",
      "apopups.link",
      "apopups.status",
      "apopups.created_at",
      "apopups.is_testing",
      "apopups.began_at",
      "apopups.ended_at",
    ],
    virtual: [],
    joins: [],
    loaders: [],
  },
  P: {
    select: [
      "apopups.id",
      "apopups.title",
      "apopups.p_img_url",
      "apopups.m_img_url",
      "apopups.link",
      "apopups.status",
      "apopups.created_at",
      "apopups.is_testing",
      "apopups.began_at",
      "apopups.ended_at",
    ],
    virtual: [],
    joins: [],
    loaders: [],
  },
};
export type ApopupFieldExpr =
  | "id"
  | "title"
  | "p_img_url"
  | "m_img_url"
  | "link"
  | "status"
  | "created_at"
  | "is_testing"
  | "began_at"
  | "ended_at";
