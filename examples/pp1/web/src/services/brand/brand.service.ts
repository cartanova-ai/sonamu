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
} from "../sonamu.shared";
import { BrandSubsetKey, BrandSubsetMapping } from "../sonamu.generated";
import { BrandListParams, BrandSaveParams } from "./brand.types";

export namespace BrandService {
  export function useBrand<T extends BrandSubsetKey>(
    subset: T,
    id: number,
    options?: SwrOptions
  ): SWRResponse<BrandSubsetMapping[T], SWRError> {
    return useSWR(
      handleConditional(
        [`/api/brand/findById`, { subset, id }],
        options?.conditional
      )
    );
  }
  export async function getBrand<T extends BrandSubsetKey>(
    subset: T,
    id: number
  ): Promise<BrandSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/brand/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export function useBrands<T extends BrandSubsetKey>(
    subset: T,
    params: BrandListParams = {},
    options?: SwrOptions
  ): SWRResponse<ListResult<BrandSubsetMapping[T]>, SWRError> {
    return useSWR(
      handleConditional(
        [`/api/brand/findMany`, { subset, params }],
        options?.conditional
      )
    );
  }
  export async function getBrands<T extends BrandSubsetKey>(
    subset: T,
    params: BrandListParams = {}
  ): Promise<ListResult<BrandSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/brand/findMany?${qs.stringify({ subset, params })}`,
    });
  }

  export async function save(
    saveParamsArray: BrandSaveParams[]
  ): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/brand/save`,
      data: { saveParamsArray },
    });
  }

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "GET",
      url: `/api/brand/del?${qs.stringify({ ids })}`,
    });
  }

  export async function attach(ids: number[], what: string): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/brand/attach`,
      data: { ids, what },
    });
  }
}
