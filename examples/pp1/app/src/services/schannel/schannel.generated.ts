import { z } from "zod";
import { SubsetQuery, zArrayable } from "../../typeframe/shared";
import {
  SchannelType,
  SchannelBalanceType,
  SchannelBalanceUnit,
  SchannelStatus,
  SchannelSearchField,
  SchannelOrderBy,
} from "./schannel.enums";

export const SchannelBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  type: SchannelType,
  name: z.string().max(128),
  img_url: z.string().max(128),
  address: z.string().max(256).nullable(),
  balance_type: SchannelBalanceType,
  balance_period: z.number().int().nonnegative(),
  balance_unit: SchannelBalanceUnit,
  selling_commission: z.number().int().nonnegative(),
  status: SchannelStatus,
  memo: z.string(),
});
export type SchannelBaseSchema = z.infer<typeof SchannelBaseSchema>;
export const SchannelBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: SchannelSearchField,
    keyword: z.string(),
    orderBy: SchannelOrderBy,
    withoutCount: z.boolean(),
    id: zArrayable(z.number().int().positive()),
    type: SchannelType,
    balance_type: SchannelBalanceType,
    balance_unit: SchannelBalanceUnit,
    status: SchannelStatus,
  })
  .partial();
export type SchannelBaseListParams = z.infer<typeof SchannelBaseListParams>;

export const SchannelSubsetA = z.object({
  id: z.number().int().nonnegative(),
  type: SchannelType,
  name: z.string().max(128),
  img_url: z.string().max(128),
  address: z.string().max(256).nullable(),
  balance_type: SchannelBalanceType,
  balance_period: z.number().int().nonnegative(),
  balance_unit: SchannelBalanceUnit,
  selling_commission: z.number().int().nonnegative(),
  status: SchannelStatus,
  memo: z.string(),
});
export type SchannelSubsetA = z.infer<typeof SchannelSubsetA>;

export type SchannelSubsetMapping = {
  A: SchannelSubsetA;
};
export const SchannelSubsetKey = z.enum(["A"]);
export type SchannelSubsetKey = z.infer<typeof SchannelSubsetKey>;

export const schannelSubsetQueries: {
  [key in SchannelSubsetKey]: SubsetQuery;
} = {
  A: {
    select: [
      "schannels.id",
      "schannels.type",
      "schannels.name",
      "schannels.img_url",
      "schannels.address",
      "schannels.balance_type",
      "schannels.balance_period",
      "schannels.balance_unit",
      "schannels.selling_commission",
      "schannels.status",
      "schannels.memo",
    ],
    virtual: [],
    joins: [],
    loaders: [],
  },
};
export type SchannelFieldExpr =
  | "id"
  | "type"
  | "name"
  | "img_url"
  | "address"
  | "balance_type"
  | "balance_period"
  | "balance_unit"
  | "selling_commission"
  | "status"
  | "memo";
