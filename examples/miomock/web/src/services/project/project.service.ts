import { AxiosProgressEvent } from "axios";
import qs from "qs";
import useSWR, { type SWRResponse } from "swr";
import { z } from "zod";
import type { ProjectSubsetKey, ProjectSubsetMapping } from "../sonamu.generated";
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
import type { ProjectListParams, ProjectSaveParams } from "./project.types";

export namespace ProjectService {
  export function useProject<T extends ProjectSubsetKey>(
    subset: T,
    id: number,
    swrOptions?: SwrOptions,
  ): SWRResponse<ProjectSubsetMapping[T], SWRError> {
    return useSWR(
      handleConditional([`/api/project/findById`, { subset, id }], swrOptions?.conditional),
    );
  }
  export async function getProject<T extends ProjectSubsetKey>(
    subset: T,
    id: number,
  ): Promise<ProjectSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/project/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export function useProjects<T extends ProjectSubsetKey>(
    subset: T,
    params: ProjectListParams = {},
    swrOptions?: SwrOptions,
  ): SWRResponse<ListResult<ProjectSubsetMapping[T]>, SWRError> {
    return useSWR(
      handleConditional([`/api/project/findMany`, { subset, params }], swrOptions?.conditional),
    );
  }
  export async function getProjects<T extends ProjectSubsetKey>(
    subset: T,
    params: ProjectListParams = {},
  ): Promise<ListResult<ProjectSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/project/findMany?${qs.stringify({ subset, params })}`,
    });
  }

  export async function save(spa: ProjectSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/project/save`,
      data: { spa },
    });
  }

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/project/del`,
      data: { ids },
    });
  }
}
