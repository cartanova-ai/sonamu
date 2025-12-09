
import qs from "qs";
import useSWR, { type SWRResponse } from "swr";
import type { ProjectSubsetKey, ProjectSubsetMapping } from "../sonamu.generated";
import {
  type EventHandlers,
  fetch,
  handleConditional,
  type ListResult,
  type SSEStreamOptions,
  type SWRError,
  type SwrOptions,
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

  export function useProjects<T extends ProjectSubsetKey, LP extends ProjectListParams>(
    subset: T,
    rawParams?: LP,
    swrOptions?: SwrOptions,
  ): SWRResponse<ListResult<LP, ProjectSubsetMapping[T]>, SWRError> {
    return useSWR(
      handleConditional([`/api/project/findMany`, { subset, rawParams }], swrOptions?.conditional),
    );
  }
  export async function getProjects<T extends ProjectSubsetKey, LP extends ProjectListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, ProjectSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/project/findMany?${qs.stringify({ subset, rawParams })}`,
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

  export function useAsk(
    params: { prompt: string },
    handlers: EventHandlers<
      {
        onToken: {
          token: string;
        };
        onComplete: {
          fullText: string;
        };
        onError: {
          error: {
            name: string;
            message: string;
            cause?: any;
            stack?: string;
          };
        };
      } & { end?: () => void }
    >,
    options: SSEStreamOptions,
  ) {
    return useSSEStream<{
      onToken: {
        token: string;
      };
      onComplete: {
        fullText: string;
      };
      onError: {
        error: {
          name: string;
          message: string;
          cause?: any;
          stack?: string;
        };
      };
    }>(`/api/project/ask`, params, handlers, options);
  }
}
