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
import { PostSubsetKey, PostSubsetMapping } from "./post.generated";
import { PostListParams, PostSaveParams } from "./post.types";

export namespace PostService {
  export function usePost<T extends PostSubsetKey>(
    subset: T,
    id: number,
    options?: SwrOptions
  ): SWRResponse<PostSubsetMapping[T], SWRError> {
    return useSWR<PostSubsetMapping[T], SWRError>(
      handleConditional(
        [`/api/post/findById`, qs.stringify({ subset, id })],
        options?.conditional
      )
    );
  }
  export async function getPost<T extends PostSubsetKey>(
    subset: T,
    id: number
  ): Promise<PostSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/post/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export function usePosts<T extends PostSubsetKey>(
    subset: T,
    params: PostListParams = {},
    options?: SwrOptions
  ): SWRResponse<ListResult<PostSubsetMapping[T]>, SWRError> {
    return useSWR<ListResult<PostSubsetMapping[T]>, SWRError>(
      handleConditional(
        [`/api/post/findMany`, qs.stringify({ subset, params })],
        options?.conditional
      )
    );
  }
  export async function getPosts<T extends PostSubsetKey>(
    subset: T,
    params: PostListParams = {}
  ): Promise<ListResult<PostSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/post/findMany?${qs.stringify({ subset, params })}`,
    });
  }

  export async function save(
    saveParamsArray: PostSaveParams[]
  ): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/post/save`,
      data: { saveParamsArray },
    });
  }

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "GET",
      url: `/api/post/del?${qs.stringify({ ids })}`,
    });
  }

  export async function like(id: number): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/post/like`,
      data: { id },
    });
  }
}
