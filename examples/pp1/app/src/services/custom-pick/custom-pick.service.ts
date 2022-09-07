import { z } from "zod";
import qs from "qs";
import useSWR, { SWRResponse } from "swr";
import { fetch } from "../../typeframe/fetch";
import { ListResult, SWRError } from "../../typeframe/iso-types";
import { CustomPickListParams } from "./custom-pick.types";
import { CustomPickSubsetP } from "./custom-pick.generated";

export namespace CustomPickService {
  export function useMyCustomPicks<T extends "P">(
    _subset: T,
    params: CustomPickListParams = {}
  ): SWRResponse<ListResult<CustomPickSubsetP>, SWRError> {
    return useSWR<ListResult<CustomPickSubsetP>, SWRError>([
      `/api/customPick/mine`,
      qs.stringify({ _subset, params }),
    ]);
  }
  export async function getMyCustomPicks<T extends "P">(
    _subset: T,
    params: CustomPickListParams = {}
  ): Promise<ListResult<CustomPickSubsetP>> {
    return fetch({
      method: "GET",
      url: `/api/customPick/mine?${qs.stringify({ _subset, params })}`,
    });
  }

  export async function pick(
    brand_id: number,
    category_id: number | null
  ): Promise<{ result: 1 }> {
    return fetch({
      method: "GET",
      url: `/api/customPick/pick?${qs.stringify({ brand_id, category_id })}`,
    });
  }

  export async function unpick(
    brand_id: number,
    category_id: number | null
  ): Promise<{ result: 1 }> {
    return fetch({
      method: "GET",
      url: `/api/customPick/unpick?${qs.stringify({ brand_id, category_id })}`,
    });
  }
}
