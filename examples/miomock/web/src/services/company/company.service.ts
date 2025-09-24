import { z } from "zod";
import qs from "qs";
import useSWR, { SWRResponse } from "swr";
import {
  fetch,
  ListResult,
  SWRError,
  SwrOptions,
  handleConditional,
  swrPostFetcher,
  EventHandlers,
  SSEStreamOptions,
  useSSEStream,
} from "../sonamu.shared";
import { CompanySubsetKey, CompanySubsetMapping } from "../sonamu.generated";
import { CompanyListParams, CompanySaveParams } from "./company.types";

export namespace CompanyService {
  export function useCompany<T extends CompanySubsetKey>(
    subset: T,
    id: number,
    swrOptions?: SwrOptions
  ): SWRResponse<CompanySubsetMapping[T], SWRError> {
    return useSWR(
      handleConditional(
        [`/api/company/findById`, { subset, id }],
        swrOptions?.conditional
      )
    );
  }
  export async function getCompany<T extends CompanySubsetKey>(
    subset: T,
    id: number
  ): Promise<CompanySubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/company/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export function useCompanies<T extends CompanySubsetKey>(
    subset: T,
    params: CompanyListParams = {},
    swrOptions?: SwrOptions
  ): SWRResponse<ListResult<CompanySubsetMapping[T]>, SWRError> {
    return useSWR(
      handleConditional(
        [`/api/company/findMany`, { subset, params }],
        swrOptions?.conditional
      )
    );
  }
  export async function getCompanies<T extends CompanySubsetKey>(
    subset: T,
    params: CompanyListParams = {}
  ): Promise<ListResult<CompanySubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/company/findMany?${qs.stringify({ subset, params })}`,
    });
  }

  export async function save(spa: CompanySaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/company/save`,
      data: { spa },
    });
  }

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/company/del`,
      data: { ids },
    });
  }
}
