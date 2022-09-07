import { z } from "zod";
import qs from "qs";
import useSWR, { SWRResponse } from "swr";
import { fetch } from "../../typeframe/fetch";
import { ListResult, SWRError } from "../../typeframe/iso-types";
import { CartitemListParams, CartitemSaveParams } from "./cartitem.types";
import { CartitemSubsetP } from "./cartitem.generated";

export namespace CartitemService {
  export function useMyCartitems<T extends "P">(
    _subset: T,
    params: CartitemListParams = {}
  ): SWRResponse<ListResult<CartitemSubsetP>, SWRError> {
    return useSWR<ListResult<CartitemSubsetP>, SWRError>([
      `/api/cartitem/mine`,
      qs.stringify({ _subset, params }),
    ]);
  }
  export async function getMyCartitems<T extends "P">(
    _subset: T,
    params: CartitemListParams = {}
  ): Promise<ListResult<CartitemSubsetP>> {
    return fetch({
      method: "GET",
      url: `/api/cartitem/mine?${qs.stringify({ _subset, params })}`,
    });
  }

  export async function save(
    params: CartitemSaveParams
  ): Promise<CartitemSubsetP> {
    return fetch({
      method: "POST",
      url: `/api/cartitem/save`,
      data: { params },
    });
  }

  export async function del(id: number): Promise<{ message: string }> {
    return fetch({
      method: "GET",
      url: `/api/cartitem/del?${qs.stringify({ id })}`,
    });
  }
}
