import { z } from "zod";
import qs from "qs";
import useSWR, { SWRResponse } from "swr";
import { fetch } from "../../typeframe/fetch";
import { ListResult, SWRError } from "../../typeframe/iso-types";
import { PlogListParams } from "./plog.types";
import { PlogSubsetP } from "./plog.generated";

export namespace PlogService {
  export function useMyPlogs<T extends "P">(
    _subset: T,
    params: PlogListParams = {}
  ): SWRResponse<ListResult<PlogSubsetP>, SWRError> {
    return useSWR<ListResult<PlogSubsetP>, SWRError>([
      `/api/plog/mine`,
      qs.stringify({ _subset, params }),
    ]);
  }
  export async function getMyPlogs<T extends "P">(
    _subset: T,
    params: PlogListParams = {}
  ): Promise<ListResult<PlogSubsetP>> {
    return fetch({
      method: "GET",
      url: `/api/plog/mine?${qs.stringify({ _subset, params })}`,
    });
  }

  export async function registerAttendanceCheck(): Promise<{}> {
    return fetch({
      method: "GET",
      url: `/api/plog/registerAttendanceCheck?${qs.stringify({})}`,
    });
  }

  export async function useCoupon(key: string): Promise<{ message: string }> {
    return fetch({
      method: "POST",
      url: `/api/plog/useCoupon`,
      data: { key },
    });
  }
}
