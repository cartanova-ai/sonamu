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
import {
  DepartmentSubsetKey,
  DepartmentSubsetMapping,
} from "../sonamu.generated";
import { DepartmentListParams, DepartmentSaveParams } from "./department.types";

export namespace DepartmentService {
  export function useDepartment<T extends DepartmentSubsetKey>(
    subset: T,
    id: number,
    swrOptions?: SwrOptions,
  ): SWRResponse<DepartmentSubsetMapping[T], SWRError> {
    return useSWR(
      handleConditional(
        [`/api/department/findById`, { subset, id }],
        swrOptions?.conditional,
      ),
    );
  }
  export async function getDepartment<T extends DepartmentSubsetKey>(
    subset: T,
    id: number,
  ): Promise<DepartmentSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/department/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export function useDepartments<T extends DepartmentSubsetKey>(
    subset: T,
    params: DepartmentListParams = {},
    swrOptions?: SwrOptions,
  ): SWRResponse<ListResult<DepartmentSubsetMapping[T]>, SWRError> {
    return useSWR(
      handleConditional(
        [`/api/department/findMany`, { subset, params }],
        swrOptions?.conditional,
      ),
    );
  }
  export async function getDepartments<T extends DepartmentSubsetKey>(
    subset: T,
    params: DepartmentListParams = {},
  ): Promise<ListResult<DepartmentSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/department/findMany?${qs.stringify({ subset, params })}`,
    });
  }

  export async function save(spa: DepartmentSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/department/save`,
      data: { spa },
    });
  }

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/department/del`,
      data: { ids },
    });
  }
}
