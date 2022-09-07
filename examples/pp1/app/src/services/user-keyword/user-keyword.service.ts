import { z } from "zod";
import qs from "qs";
import useSWR, { SWRResponse } from "swr";
import { fetch } from "../../typeframe/fetch";
import { ListResult, SWRError } from "../../typeframe/iso-types";
import { UserKeywordListParams } from "./user-keyword.types";
import { UserKeywordSubsetP } from "./user-keyword.generated";

export namespace UserKeywordService {
  export function useUserKeywords<T extends "P">(
    _subset: T,
    params: UserKeywordListParams = {}
  ): SWRResponse<ListResult<UserKeywordSubsetP>, SWRError> {
    return useSWR<ListResult<UserKeywordSubsetP>, SWRError>([
      `/api/userKeyword/mine`,
      qs.stringify({ _subset, params }),
    ]);
  }
  export async function getUserKeywords<T extends "P">(
    _subset: T,
    params: UserKeywordListParams = {}
  ): Promise<ListResult<UserKeywordSubsetP>> {
    return fetch({
      method: "GET",
      url: `/api/userKeyword/mine?${qs.stringify({ _subset, params })}`,
    });
  }

  export async function clearMine(): Promise<{ message: string }> {
    return fetch({
      method: "GET",
      url: `/api/userKeyword/clearMine?${qs.stringify({})}`,
    });
  }
}
