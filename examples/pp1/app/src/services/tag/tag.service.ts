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
import { TagSubsetKey, TagSubsetMapping } from "./tag.generated";
import { TagListParams, TagSaveParams } from "./tag.types";

export namespace TagService {
  export function useTag<T extends TagSubsetKey>(
    subset: T,
    id: number,
    options?: SwrOptions
  ): SWRResponse<TagSubsetMapping[T], SWRError> {
    return useSWR<TagSubsetMapping[T], SWRError>(
      handleConditional(
        [`/api/tag/findById`, qs.stringify({ subset, id })],
        options?.conditional
      )
    );
  }
  export async function getTag<T extends TagSubsetKey>(
    subset: T,
    id: number
  ): Promise<TagSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/tag/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export function useTags<T extends TagSubsetKey>(
    subset: T,
    params: TagListParams = {},
    options?: SwrOptions
  ): SWRResponse<ListResult<TagSubsetMapping[T]>, SWRError> {
    return useSWR<ListResult<TagSubsetMapping[T]>, SWRError>(
      handleConditional(
        [`/api/tag/findMany`, qs.stringify({ subset, params })],
        options?.conditional
      )
    );
  }
  export async function getTags<T extends TagSubsetKey>(
    subset: T,
    params: TagListParams = {}
  ): Promise<ListResult<TagSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/tag/findMany?${qs.stringify({ subset, params })}`,
    });
  }

  export async function save(
    saveParamsArray: TagSaveParams[]
  ): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/tag/save`,
      data: { saveParamsArray },
    });
  }

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "GET",
      url: `/api/tag/del?${qs.stringify({ ids })}`,
    });
  }
}
