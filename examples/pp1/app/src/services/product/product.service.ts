import { z } from "zod";
import qs from "qs";
import useSWR, { SWRResponse } from "swr";
import {
  fetch,
  ListResult,
  SWRError,
  SwrOptions,
  handleConditional,
} from "../sonamu.shared";
import { ProductSubsetKey, ProductSubsetMapping } from "./product.generated";
import { ProductListParams, ProductSaveParams } from "./product.types";

export namespace ProductService {
  export function useProduct<T extends ProductSubsetKey>(
    subset: T,
    id: number,
    options?: SwrOptions
  ): SWRResponse<ProductSubsetMapping[T], SWRError> {
    return useSWR<ProductSubsetMapping[T], SWRError>(
      handleConditional(
        [`/api/product/findById`, qs.stringify({ subset, id })],
        options?.conditional
      )
    );
  }
  export async function getProduct<T extends ProductSubsetKey>(
    subset: T,
    id: number
  ): Promise<ProductSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/product/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export function useProducts<T extends ProductSubsetKey>(
    subset: T,
    params: ProductListParams = {},
    options?: SwrOptions
  ): SWRResponse<ListResult<ProductSubsetMapping[T]>, SWRError> {
    return useSWR<ListResult<ProductSubsetMapping[T]>, SWRError>(
      handleConditional(
        [`/api/product/findMany`, qs.stringify({ subset, params })],
        options?.conditional
      )
    );
  }
  export async function getProducts<T extends ProductSubsetKey>(
    subset: T,
    params: ProductListParams = {}
  ): Promise<ListResult<ProductSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/product/findMany?${qs.stringify({ subset, params })}`,
    });
  }

  export async function save(
    saveParamsArray: ProductSaveParams[]
  ): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/product/save`,
      data: { saveParamsArray },
    });
  }

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "GET",
      url: `/api/product/del?${qs.stringify({ ids })}`,
    });
  }
}
