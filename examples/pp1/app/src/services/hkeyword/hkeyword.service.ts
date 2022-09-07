import { z } from "zod";
import qs from "qs";
import useSWR, { SWRResponse } from "swr";
import { fetch } from "../../typeframe/fetch";
import { ListResult, SWRError } from "../../typeframe/iso-types";
import { HkeywordListParams } from "./hkeyword.types";
import { HkeywordSubsetP } from "./hkeyword.generated";

export namespace HkeywordService {
  export function useHkeywords<T extends "P">(
    _subset: T,
    params: HkeywordListParams = {}
  ): SWRResponse<ListResult<HkeywordSubsetP>, SWRError> {
    return useSWR<ListResult<HkeywordSubsetP>, SWRError>([
      `/api/hkeyword/findMany`,
      qs.stringify({ _subset, params }),
    ]);
  }
  export async function getHkeywords<T extends "P">(
    _subset: T,
    params: HkeywordListParams = {}
  ): Promise<ListResult<HkeywordSubsetP>> {
    return fetch({
      method: "GET",
      url: `/api/hkeyword/findMany?${qs.stringify({ _subset, params })}`,
    });
  }
}
