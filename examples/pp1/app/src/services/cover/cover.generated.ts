import { z } from "zod";
import { SubsetQuery, zArrayable } from "../../typeframe/shared";
import { CoverItemStatus, CoverSearchField, CoverOrderBy } from "./cover.enums";

export const CoverBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  title: z.string().max(64),
  key: z.string().max(64),
  // items: HasMany CoverItem
});
export type CoverBaseSchema = z.infer<typeof CoverBaseSchema>;
export const CoverItemBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  cover_id: z.number().int(),
  title: z.string().max(128),
  subtitle: z.string().max(256),
  desc: z.string().max(512),
  img_url: z.string().max(128),
  video_url: z.string().max(128),
  youtube_url: z.string().max(128),
  bgcolor: z.string().max(8),
  link: z.string().max(256),
  status: CoverItemStatus,
});
export type CoverItemBaseSchema = z.infer<typeof CoverItemBaseSchema>;
export const CoverBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: CoverSearchField,
    keyword: z.string(),
    orderBy: CoverOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
  })
  .partial();
export type CoverBaseListParams = z.infer<typeof CoverBaseListParams>;

export const CoverSubsetA = z.object({
  id: z.number().int().nonnegative(),
  title: z.string().max(64),
  key: z.string().max(64),
  items: z.array(
    z.object({
      title: z.string().max(128),
      subtitle: z.string().max(256),
      desc: z.string().max(512),
      img_url: z.string().max(128),
      bgcolor: z.string().max(8),
      link: z.string().max(256),
      status: CoverItemStatus,
    })
  ),
});
export type CoverSubsetA = z.infer<typeof CoverSubsetA>;

export const CoverSubsetP = z.object({
  id: z.number().int().nonnegative(),
  title: z.string().max(64),
  key: z.string().max(64),
  items: z.array(
    z.object({
      title: z.string().max(128),
      subtitle: z.string().max(256),
      desc: z.string().max(512),
      img_url: z.string().max(128),
      bgcolor: z.string().max(8),
      link: z.string().max(256),
      status: CoverItemStatus,
    })
  ),
});
export type CoverSubsetP = z.infer<typeof CoverSubsetP>;

export type CoverSubsetMapping = {
  A: CoverSubsetA;
  P: CoverSubsetP;
};
export const CoverSubsetKey = z.enum(["A", "P"]);
export type CoverSubsetKey = z.infer<typeof CoverSubsetKey>;

export const coverSubsetQueries: { [key in CoverSubsetKey]: SubsetQuery } = {
  A: {
    select: ["covers.id", "covers.title", "covers.key"],
    virtual: [],
    joins: [],
    loaders: [
      {
        as: "items",
        table: "cover_items",
        manyJoin: { from: "covers.id", to: "cover_items.cover_id" },
        oneJoins: [],
        select: [
          "cover_items.title",
          "cover_items.subtitle",
          "cover_items.desc",
          "cover_items.img_url",
          "cover_items.bgcolor",
          "cover_items.link",
          "cover_items.status",
        ],
      },
    ],
  },
  P: {
    select: ["covers.id", "covers.title", "covers.key"],
    virtual: [],
    joins: [],
    loaders: [
      {
        as: "items",
        table: "cover_items",
        manyJoin: { from: "covers.id", to: "cover_items.cover_id" },
        oneJoins: [],
        select: [
          "cover_items.title",
          "cover_items.subtitle",
          "cover_items.desc",
          "cover_items.img_url",
          "cover_items.bgcolor",
          "cover_items.link",
          "cover_items.status",
        ],
      },
    ],
  },
};
export type CoverFieldExpr =
  | "id"
  | "title"
  | "key"
  | "items.id"
  | "items.title"
  | "items.subtitle"
  | "items.desc"
  | "items.img_url"
  | "items.video_url"
  | "items.youtube_url"
  | "items.bgcolor"
  | "items.link"
  | "items.status";
