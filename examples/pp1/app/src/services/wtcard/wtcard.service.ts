import { z } from "zod";
import qs from "qs";
import useSWR, { SWRResponse } from "swr";
import { fetch } from "../../typeframe/fetch";
import { ListResult, SWRError } from "../../typeframe/iso-types";
import { WtcardSubsetPD, WtcardSubsetPL } from "./wtcard.generated";
import { WtcardListParams } from "./wtcard.types";

export namespace WtcardService {
  export function useWtcard<T extends "PD">(
    _subset: T,
    id: number
  ): SWRResponse<WtcardSubsetPD, SWRError> {
    return useSWR<WtcardSubsetPD, SWRError>([
      `/api/wtcard/findById`,
      qs.stringify({ _subset, id }),
    ]);
  }
  export async function getWtcard<T extends "PD">(
    _subset: T,
    id: number
  ): Promise<WtcardSubsetPD> {
    return fetch({
      method: "GET",
      url: `/api/wtcard/findById?${qs.stringify({ _subset, id })}`,
    });
  }

  export function useWtcards<T extends "PL">(
    _subset: T,
    params: WtcardListParams = {}
  ): SWRResponse<ListResult<WtcardSubsetPL>, SWRError> {
    return useSWR<ListResult<WtcardSubsetPL>, SWRError>([
      `/api/wtcard/findMany`,
      qs.stringify({ _subset, params }),
    ]);
  }
  export async function getWtcards<T extends "PL">(
    _subset: T,
    params: WtcardListParams = {}
  ): Promise<ListResult<WtcardSubsetPL>> {
    return fetch({
      method: "GET",
      url: `/api/wtcard/findMany?${qs.stringify({ _subset, params })}`,
    });
  }
}
