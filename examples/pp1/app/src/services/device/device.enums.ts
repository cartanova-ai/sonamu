import { z } from "zod";
import { EnumsLabelKo } from "../../typeframe/shared";

export const DeviceOrderBy = z.enum(["id-desc"]);
export type DeviceOrderBy = z.infer<typeof DeviceOrderBy>;
export const DeviceSearchField = z.enum(["id"]);
export type DeviceSearchField = z.infer<typeof DeviceSearchField>;

export const DevicePlatform = z.enum(["ios", "android"]);
export type DevicePlatform = z.infer<typeof DevicePlatform>;

export namespace DEVICE {
  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<DeviceOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<DeviceSearchField> = {
    id: { ko: "ID" },
  };

  // Platform
  export const PLATFORM: EnumsLabelKo<DevicePlatform> = {
    ios: { ko: "iOS" },
    android: { ko: "Android" },
  };
}
