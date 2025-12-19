import qs from "qs";
import useSWR, { type SWRResponse } from "swr";
import type { CompanySubsetKey, CompanySubsetMapping } from "../sonamu.generated";
import {
  fetch,
  handleConditional,
  type ListResult,
  type SWRError,
  type SwrOptions,
} from "../sonamu.shared";
import type { CompanyListParams, CompanySaveParams } from "./company.types";

export namespace CompanyService {
  export function useCompany<T extends CompanySubsetKey>(
    subset: T,
    id: number,
    swrOptions?: SwrOptions,
  ): SWRResponse<CompanySubsetMapping[T], SWRError> {
    return useSWR(
      handleConditional([`/api/company/findById`, { subset, id }], swrOptions?.conditional),
    );
  }
  export async function getCompany<T extends CompanySubsetKey>(
    subset: T,
    id: number,
  ): Promise<CompanySubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/company/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export function useCompanies<T extends CompanySubsetKey, LP extends CompanyListParams>(
    subset: T,
    rawParams?: LP,
    swrOptions?: SwrOptions,
  ): SWRResponse<ListResult<LP, CompanySubsetMapping[T]>, SWRError> {
    return useSWR(
      handleConditional([`/api/company/findMany`, { subset, rawParams }], swrOptions?.conditional),
    );
  }
  export async function getCompanies<T extends CompanySubsetKey, LP extends CompanyListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, CompanySubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/company/findMany?${qs.stringify({ subset, rawParams })}`,
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
