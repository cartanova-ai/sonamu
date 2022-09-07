import { z } from "zod";
import qs from "qs";
import useSWR, { SWRResponse } from "swr";
import { fetch } from "../../typeframe/fetch";
import { ListResult, SWRError } from "../../typeframe/iso-types";
import { DealListParams, OpenDeals } from "./deal.types";

export namespace DealService {
  export function useOpenDeals<T extends "P">(
    _subset: T,
    params: DealListParams = {}
  ): SWRResponse<OpenDeals, SWRError> {
    return useSWR<OpenDeals, SWRError>([
      `/api/deal/openDeals`,
      qs.stringify({ _subset, params }),
    ]);
  }
  export async function getOpenDeals<T extends "P">(
    _subset: T,
    params: DealListParams = {}
  ): Promise<OpenDeals> {
    return fetch({
      method: "GET",
      url: `/api/deal/openDeals?${qs.stringify({ _subset, params })}`,
    });
  }
}
