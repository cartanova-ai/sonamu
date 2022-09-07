import { z } from "zod";
import qs from "qs";
import useSWR, { SWRResponse } from "swr";
import { fetch } from "../../typeframe/fetch";
import { ListResult, SWRError } from "../../typeframe/iso-types";
import { SizetableSubsetP } from "./sizetable.generated";
import { SizetableListParams } from "./sizetable.types";

export namespace SizetableService {
  export function useSizetable<T extends "P">(
    _subset: T,
    id: number
  ): SWRResponse<SizetableSubsetP, SWRError> {
    return useSWR<SizetableSubsetP, SWRError>([
      `/api/sizetable/findById`,
      qs.stringify({ _subset, id }),
    ]);
  }
  export async function getSizetable<T extends "P">(
    _subset: T,
    id: number
  ): Promise<SizetableSubsetP> {
    return fetch({
      method: "GET",
      url: `/api/sizetable/findById?${qs.stringify({ _subset, id })}`,
    });
  }

  export function useSizetables<T extends "P">(
    _subset: T,
    params: SizetableListParams = {}
  ): SWRResponse<ListResult<SizetableSubsetP>, SWRError> {
    return useSWR<ListResult<SizetableSubsetP>, SWRError>([
      `/api/sizetable/findMany`,
      qs.stringify({ _subset, params }),
    ]);
  }
  export async function getSizetables<T extends "P">(
    _subset: T,
    params: SizetableListParams = {}
  ): Promise<ListResult<SizetableSubsetP>> {
    return fetch({
      method: "GET",
      url: `/api/sizetable/findMany?${qs.stringify({ _subset, params })}`,
    });
  }
}
