import { z } from "zod";
import qs from "qs";
import useSWR, { SWRResponse } from "swr";
import { fetch } from "../../typeframe/fetch";
import { ListResult, SWRError } from "../../typeframe/iso-types";
import { DevicePlatform } from "./device.enums";

export namespace DeviceService {
  export async function register(
    platform: DevicePlatform,
    user_id: number,
    device_token: string
  ): Promise<{ message: string }> {
    return fetch({
      method: "GET",
      url: `/api/device/register?${qs.stringify({
        platform,
        user_id,
        device_token,
      })}`,
    });
  }

  export async function unregister(
    platform: DevicePlatform,
    user_id: number,
    device_token: string
  ): Promise<{ message: string }> {
    return fetch({
      method: "GET",
      url: `/api/device/unregister?${qs.stringify({
        platform,
        user_id,
        device_token,
      })}`,
    });
  }
}
