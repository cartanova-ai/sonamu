import { z } from "zod";
import qs from "qs";
import useSWR, { SWRResponse } from "swr";
import { fetch } from "../../typeframe/fetch";
import { ListResult, SWRError } from "../../typeframe/iso-types";
import { AppconfListParams, Bank } from "./appconf.types";
import { AppconfSubsetP } from "./appconf.generated";

export namespace AppconfService {
  export function useAppconfs<T extends "P">(
    _subset: T,
    params: AppconfListParams = {}
  ): SWRResponse<ListResult<AppconfSubsetP>, SWRError> {
    return useSWR<ListResult<AppconfSubsetP>, SWRError>([
      `/api/appconf/findMany`,
      qs.stringify({ _subset, params }),
    ]);
  }
  export async function getAppconfs<T extends "P">(
    _subset: T,
    params: AppconfListParams = {}
  ): Promise<ListResult<AppconfSubsetP>> {
    return fetch({
      method: "GET",
      url: `/api/appconf/findMany?${qs.stringify({ _subset, params })}`,
    });
  }

  export function useBanks(): SWRResponse<ListResult<Bank>, SWRError> {
    return useSWR<ListResult<Bank>, SWRError>([
      `/api/appconf/getBanks`,
      qs.stringify({}),
    ]);
  }
  export async function getBanks(): Promise<ListResult<Bank>> {
    return fetch({
      method: "GET",
      url: `/api/appconf/getBanks?${qs.stringify({})}`,
    });
  }
}
