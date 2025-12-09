
import qs from "qs";
import useSWR, { type SWRResponse } from "swr";
import type { TagSubsetKey, TagSubsetMapping } from "../sonamu.generated";
import {
  fetch,
  handleConditional,
  type ListResult,
  type SWRError,
  type SwrOptions,
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

  export function useTags<T extends TagSubsetKey, LP extends TagListParams>(
    subset: T,
    rawParams?: LP,
    swrOptions?: SwrOptions,
  ): SWRResponse<ListResult<LP, TagSubsetMapping[T]>, SWRError> {
    return useSWR(
      handleConditional([`/api/tag/findMany`, { subset, rawParams }], swrOptions?.conditional),
    );
  }
  export async function getTags<T extends TagSubsetKey, LP extends TagListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, TagSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/tag/findMany?${qs.stringify({ subset, rawParams })}`,
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
