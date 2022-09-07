import { z } from "zod";
import qs from "qs";
import useSWR, { SWRResponse } from "swr";
import { fetch } from "../../typeframe/fetch";
import { ListResult, SWRError } from "../../typeframe/iso-types";
import { ApopupListParams } from "./apopup.types";
import { ApopupSubsetP } from "./apopup.generated";

export namespace ApopupService {
  export function useActiveApopups<T extends "P">(
    _subset: T,
    params: ApopupListParams = {}
  ): SWRResponse<ListResult<ApopupSubsetP> | { rows: false }, SWRError> {
    return useSWR<ListResult<ApopupSubsetP> | { rows: false }, SWRError>([
      `/api/apopup/active`,
      qs.stringify({ _subset, params }),
    ]);
  }
  export async function getActiveApopups<T extends "P">(
    _subset: T,
    params: ApopupListParams = {}
  ): Promise<ListResult<ApopupSubsetP> | { rows: false }> {
    return fetch({
      method: "GET",
      url: `/api/apopup/active?${qs.stringify({ _subset, params })}`,
    });
  }

  export async function permClose(
    apopup_id: number
  ): Promise<{ message: string }> {
    return fetch({
      method: "GET",
      url: `/api/apopup/permClose?${qs.stringify({ apopup_id })}`,
    });
  }
}
