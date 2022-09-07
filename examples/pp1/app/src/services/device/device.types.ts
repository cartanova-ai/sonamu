import { z } from "zod";
import { DeviceBaseSchema, DeviceBaseListParams } from "./device.generated";

// Device - ListParams
export const DeviceListParams = DeviceBaseListParams;
export type DeviceListParams = z.infer<typeof DeviceListParams>;

// Device - SaveParams
export const DeviceSaveParams = DeviceBaseSchema.partial({ id: true });
export type DeviceSaveParams = z.infer<typeof DeviceSaveParams>;
