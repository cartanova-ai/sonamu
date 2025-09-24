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
import { EmployeeSubsetKey, EmployeeSubsetMapping } from "../sonamu.generated";
import { EmployeeListParams, EmployeeSaveParams } from "./employee.types";

export namespace EmployeeService {
  export function useEmployee<T extends EmployeeSubsetKey>(
    subset: T,
    id: number,
    swrOptions?: SwrOptions,
  ): SWRResponse<EmployeeSubsetMapping[T], SWRError> {
    return useSWR(
      handleConditional(
        [`/api/employee/findById`, { subset, id }],
        swrOptions?.conditional,
      ),
    );
  }
  export async function getEmployee<T extends EmployeeSubsetKey>(
    subset: T,
    id: number,
  ): Promise<EmployeeSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/employee/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export function useEmployees<T extends EmployeeSubsetKey>(
    subset: T,
    params: EmployeeListParams = {},
    swrOptions?: SwrOptions,
  ): SWRResponse<ListResult<EmployeeSubsetMapping[T]>, SWRError> {
    return useSWR(
      handleConditional(
        [`/api/employee/findMany`, { subset, params }],
        swrOptions?.conditional,
      ),
    );
  }
  export async function getEmployees<T extends EmployeeSubsetKey>(
    subset: T,
    params: EmployeeListParams = {},
  ): Promise<ListResult<EmployeeSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/employee/findMany?${qs.stringify({ subset, params })}`,
    });
  }

  export async function save(spa: EmployeeSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/employee/save`,
      data: { spa },
    });
  }

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/employee/del`,
      data: { ids },
    });
  }
}
