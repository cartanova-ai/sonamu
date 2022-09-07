import { z } from "zod";
import qs from "qs";
import useSWR, { SWRResponse } from "swr";
import { fetch } from "../../typeframe/fetch";
import { ListResult, SWRError } from "../../typeframe/iso-types";
import { CoverListParams } from "./cover.types";
import { CoverSubsetP } from "./cover.generated";

export namespace CoverService {
  export function useCovers<T extends "P">(
    _subset: T,
    params: CoverListParams = {}
  ): SWRResponse<ListResult<CoverSubsetP>, SWRError> {
    return useSWR<ListResult<CoverSubsetP>, SWRError>([
      `/api/cover/findMany`,
      qs.stringify({ _subset, params }),
    ]);
  }
  export async function getCovers<T extends "P">(
    _subset: T,
    params: CoverListParams = {}
  ): Promise<ListResult<CoverSubsetP>> {
    return fetch({
      method: "GET",
      url: `/api/cover/findMany?${qs.stringify({ _subset, params })}`,
    });
  }
}
