import { z } from "zod";
import { SubsetQuery, zArrayable } from "../../typeframe/shared";
import {
  SizetableGender,
  SizetableSearchField,
  SizetableOrderBy,
} from "./sizetable.enums";

export const SizetableBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  category_id: z.number().int(),
  brand_id: z.number().int(),
  gender: SizetableGender,
  // contents: HasMany SizetableContent
});
export type SizetableBaseSchema = z.infer<typeof SizetableBaseSchema>;
export const SizetableContentBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  sizetable_id: z.number().int(),
  standard: z.string().max(16),
  kr: z.string().max(16),
  eu: z.string().max(16),
  it: z.string().max(16),
  uk: z.string().max(16),
  fr: z.string().max(16),
  us: z.string().max(16),
  ger: z.string().max(16),
  waist_cm: z.string().max(16),
  waist_inch: z.string().max(16),
  cm: z.string().max(16),
  numerical: z.string().max(16),
  age: z.string().max(16),
  height_cm: z.string().max(16),
  height_inch: z.string().max(16),
  chest_cm: z.string().max(16),
  feet_mm: z.string().max(16),
  hip_cm: z.string().max(16),
  head_cm: z.string().max(16),
  weight_kg: z.string().max(16),
  orderno: z.number().int(),
});
export type SizetableContentBaseSchema = z.infer<
  typeof SizetableContentBaseSchema
>;
export const SizetableBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: SizetableSearchField,
    keyword: z.string(),
    orderBy: SizetableOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
    gender: SizetableGender,
  })
  .partial();
export type SizetableBaseListParams = z.infer<typeof SizetableBaseListParams>;

export const SizetableSubsetA = z.object({
  id: z.number().int().nonnegative(),
  gender: SizetableGender,
  category_id: z.number().int().nonnegative(),
  brand_id: z.number().int().nonnegative(),
  contents: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      standard: z.string().max(16),
      kr: z.string().max(16),
      eu: z.string().max(16),
      it: z.string().max(16),
      uk: z.string().max(16),
      fr: z.string().max(16),
      us: z.string().max(16),
      ger: z.string().max(16),
      waist_cm: z.string().max(16),
      waist_inch: z.string().max(16),
      cm: z.string().max(16),
      numerical: z.string().max(16),
      age: z.string().max(16),
      height_cm: z.string().max(16),
      height_inch: z.string().max(16),
      chest_cm: z.string().max(16),
      feet_mm: z.string().max(16),
      hip_cm: z.string().max(16),
      head_cm: z.string().max(16),
      weight_kg: z.string().max(16),
      orderno: z.number().int(),
    })
  ),
});
export type SizetableSubsetA = z.infer<typeof SizetableSubsetA>;

export const SizetableSubsetP = z.object({
  id: z.number().int().nonnegative(),
  gender: SizetableGender,
  category_id: z.number().int().nonnegative(),
  brand_id: z.number().int().nonnegative(),
  contents: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      standard: z.string().max(16),
      kr: z.string().max(16),
      eu: z.string().max(16),
      it: z.string().max(16),
      uk: z.string().max(16),
      fr: z.string().max(16),
      us: z.string().max(16),
      ger: z.string().max(16),
      waist_cm: z.string().max(16),
      waist_inch: z.string().max(16),
      cm: z.string().max(16),
      numerical: z.string().max(16),
      age: z.string().max(16),
      height_cm: z.string().max(16),
      height_inch: z.string().max(16),
      chest_cm: z.string().max(16),
      feet_mm: z.string().max(16),
      hip_cm: z.string().max(16),
      head_cm: z.string().max(16),
      weight_kg: z.string().max(16),
      orderno: z.number().int(),
    })
  ),
});
export type SizetableSubsetP = z.infer<typeof SizetableSubsetP>;

export type SizetableSubsetMapping = {
  A: SizetableSubsetA;
  P: SizetableSubsetP;
};
export const SizetableSubsetKey = z.enum(["A", "P"]);
export type SizetableSubsetKey = z.infer<typeof SizetableSubsetKey>;

export const sizetableSubsetQueries: {
  [key in SizetableSubsetKey]: SubsetQuery;
} = {
  A: {
    select: [
      "sizetables.id",
      "sizetables.gender",
      "sizetables.category_id",
      "sizetables.brand_id",
    ],
    virtual: [],
    joins: [],
    loaders: [
      {
        as: "contents",
        table: "sizetable_contents",
        manyJoin: {
          from: "sizetables.id",
          to: "sizetable_contents.sizetable_id",
        },
        oneJoins: [],
        select: [
          "sizetable_contents.id",
          "sizetable_contents.standard",
          "sizetable_contents.kr",
          "sizetable_contents.eu",
          "sizetable_contents.it",
          "sizetable_contents.uk",
          "sizetable_contents.fr",
          "sizetable_contents.us",
          "sizetable_contents.ger",
          "sizetable_contents.waist_cm",
          "sizetable_contents.waist_inch",
          "sizetable_contents.cm",
          "sizetable_contents.numerical",
          "sizetable_contents.age",
          "sizetable_contents.height_cm",
          "sizetable_contents.height_inch",
          "sizetable_contents.chest_cm",
          "sizetable_contents.feet_mm",
          "sizetable_contents.hip_cm",
          "sizetable_contents.head_cm",
          "sizetable_contents.weight_kg",
          "sizetable_contents.orderno",
        ],
      },
    ],
  },
  P: {
    select: [
      "sizetables.id",
      "sizetables.gender",
      "sizetables.category_id",
      "sizetables.brand_id",
    ],
    virtual: [],
    joins: [],
    loaders: [
      {
        as: "contents",
        table: "sizetable_contents",
        manyJoin: {
          from: "sizetables.id",
          to: "sizetable_contents.sizetable_id",
        },
        oneJoins: [],
        select: [
          "sizetable_contents.id",
          "sizetable_contents.standard",
          "sizetable_contents.kr",
          "sizetable_contents.eu",
          "sizetable_contents.it",
          "sizetable_contents.uk",
          "sizetable_contents.fr",
          "sizetable_contents.us",
          "sizetable_contents.ger",
          "sizetable_contents.waist_cm",
          "sizetable_contents.waist_inch",
          "sizetable_contents.cm",
          "sizetable_contents.numerical",
          "sizetable_contents.age",
          "sizetable_contents.height_cm",
          "sizetable_contents.height_inch",
          "sizetable_contents.chest_cm",
          "sizetable_contents.feet_mm",
          "sizetable_contents.hip_cm",
          "sizetable_contents.head_cm",
          "sizetable_contents.weight_kg",
          "sizetable_contents.orderno",
        ],
      },
    ],
  },
};
export type SizetableFieldExpr =
  | "id"
  | "category.id"
  | "category.prefix"
  | "category.name"
  | "category.name_ko"
  | "category.top.id"
  | "category.top.prefix"
  | "category.top.name"
  | "category.top.name_ko"
  | "category.top.orderno"
  | "category.top.css_class"
  | "category.top.status"
  | "category.top.img_url"
  | "category.top.can_show_on_main"
  | "category.top.text"
  | "category.top.products_cnt"
  | "category.parent.id"
  | "category.parent.prefix"
  | "category.parent.name"
  | "category.parent.name_ko"
  | "category.parent.orderno"
  | "category.parent.css_class"
  | "category.parent.status"
  | "category.parent.img_url"
  | "category.parent.can_show_on_main"
  | "category.parent.text"
  | "category.parent.products_cnt"
  | "category.orderno"
  | "category.css_class"
  | "category.status"
  | "category.img_url"
  | "category.can_show_on_main"
  | "category.text"
  | "category.products_cnt"
  | "category.children.id"
  | "category.children.prefix"
  | "category.children.name"
  | "category.children.name_ko"
  | "category.children.orderno"
  | "category.children.css_class"
  | "category.children.status"
  | "category.children.img_url"
  | "category.children.can_show_on_main"
  | "category.children.text"
  | "category.children.products_cnt"
  | "brand.id"
  | "brand.name"
  | "brand.orderno"
  | "brand.created_at"
  | "brand.official_site_italy"
  | "brand.official_site_int"
  | "brand.is_luxury"
  | "brand.margin_rate"
  | "brand.is_popular"
  | "brand.name_for_search"
  | "brand.name_ko"
  | "brand.desc"
  | "brand.admin_memo"
  | "brand.nv_search_type"
  | "brand.ignore_color"
  | "brand.picks_cnt"
  | "brand.products_cnt"
  | "brand.d_cover_img_url"
  | "brand.m_cover_img_url"
  | "brand.is_custompicked"
  | "brand.is_new"
  | "gender"
  | "contents.id"
  | "contents.standard"
  | "contents.kr"
  | "contents.eu"
  | "contents.it"
  | "contents.uk"
  | "contents.fr"
  | "contents.us"
  | "contents.ger"
  | "contents.waist_cm"
  | "contents.waist_inch"
  | "contents.cm"
  | "contents.numerical"
  | "contents.age"
  | "contents.height_cm"
  | "contents.height_inch"
  | "contents.chest_cm"
  | "contents.feet_mm"
  | "contents.hip_cm"
  | "contents.head_cm"
  | "contents.weight_kg"
  | "contents.orderno";
