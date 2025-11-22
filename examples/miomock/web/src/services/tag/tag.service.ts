import { AxiosProgressEvent } from "axios";
import qs from "qs";
import useSWR, { type SWRResponse } from "swr";
import { z } from "zod";
import type { TagSubsetKey, TagSubsetMapping } from "../sonamu.generated";
import {
  EventHandlers,
  fetch,
  handleConditional,
  type ListResult,
  SSEStreamOptions,
  type SWRError,
  type SwrOptions,
  swrPostFetcher,
  useSSEStream,
} from "../sonamu.shared";
import type { TagListParams, TagSaveParams } from "./tag.types";

export namespace TagService {
  export function useTag<T extends TagSubsetKey>(
    subset: T,
    id: number,
    swrOptions?: SwrOptions,
  ): SWRResponse<TagSubsetMapping[T], SWRError> {
    return useSWR(
      handleConditional([`/api/tag/findById`, { subset, id }], swrOptions?.conditional),
    );
  }
  export async function getTag<T extends TagSubsetKey>(
    subset: T,
    id: number,
  ): Promise<TagSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/tag/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export function useTags<T extends TagSubsetKey>(
    subset: T,
    params: TagListParams = {},
    swrOptions?: SwrOptions,
  ): SWRResponse<ListResult<TagSubsetMapping[T]>, SWRError> {
    return useSWR(
      handleConditional([`/api/tag/findMany`, { subset, params }], swrOptions?.conditional),
    );
  }
  export async function getTags<T extends TagSubsetKey>(
    subset: T,
    params: TagListParams = {},
  ): Promise<ListResult<TagSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/tag/findMany?${qs.stringify({ subset, params })}`,
    });
  }

  export async function save(spa: TagSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/tag/save`,
      data: { spa },
    });
  }

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/tag/del`,
      data: { ids },
    });
  }
}
