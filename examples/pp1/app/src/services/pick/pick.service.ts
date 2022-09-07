import { z } from "zod";
import qs from "qs";
import useSWR, { SWRResponse } from "swr";
import { fetch } from "../../typeframe/fetch";
import { ListResult, SWRError } from "../../typeframe/iso-types";
import { PickListParams } from "./pick.types";
import { PickSubsetP } from "./pick.generated";

export namespace PickService {
  export function useMyPicks<T extends "P">(
    _subset: T,
    params: PickListParams = {}
  ): SWRResponse<ListResult<PickSubsetP>, SWRError> {
    return useSWR<ListResult<PickSubsetP>, SWRError>([
      `/api/pick/mine`,
      qs.stringify({ _subset, params }),
    ]);
  }
  export async function getMyPicks<T extends "P">(
    _subset: T,
    params: PickListParams = {}
  ): Promise<ListResult<PickSubsetP>> {
    return fetch({
      method: "GET",
      url: `/api/pick/mine?${qs.stringify({ _subset, params })}`,
    });
  }

  export async function pickProduct(
    product_id: number
  ): Promise<{ result: 1 }> {
    return fetch({
      method: "GET",
      url: `/api/pick/pickProduct?${qs.stringify({ product_id })}`,
    });
  }

  export async function unpickProduct(
    product_id: number
  ): Promise<{ result: 1 }> {
    return fetch({
      method: "GET",
      url: `/api/pick/unpickProduct?${qs.stringify({ product_id })}`,
    });
  }
}
