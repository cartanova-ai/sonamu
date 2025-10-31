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
import {
  UserSubsetKey,
  UserSubsetMapping,
  UserSubsetSS,
} from "../sonamu.generated";
import { UserListParams, UserLoginParams } from "./user.types";

export namespace UserService {
  export function useUser<T extends UserSubsetKey>(
    subset: T,
    id: number,
    options?: SwrOptions
  ): SWRResponse<UserSubsetMapping[T], SWRError> {
    return useSWR(
      handleConditional(
        [`/api/user/findById`, { subset, id }],
        options?.conditional
      )
    );
  }
  export async function getUser<T extends UserSubsetKey>(
    subset: T,
    id: number
  ): Promise<UserSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/user/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export function useUsers<T extends UserSubsetKey>(
    subset: T,
    params: UserListParams = {},
    options?: SwrOptions
  ): SWRResponse<ListResult<UserSubsetMapping[T]>, SWRError> {
    return useSWR(
      handleConditional(
        [`/api/user/findMany`, { subset, params }],
        options?.conditional
      )
    );
  }
  export async function getUsers<T extends UserSubsetKey>(
    subset: T,
    params: UserListParams = {}
  ): Promise<ListResult<UserSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/user/findMany?${qs.stringify({ subset, params })}`,
    });
  }

  export async function login(
    loginParams: UserLoginParams
  ): Promise<{ success: boolean; user?: UserSubsetSS }> {
    return fetch({
      method: "POST",
      url: `/api/user/login`,
      data: { loginParams },
    });
  }

  export function useMe(
    options?: SwrOptions
  ): SWRResponse<UserSubsetSS | null, SWRError> {
    return useSWR(
      handleConditional([`/api/user/me`, {}], options?.conditional)
    );
  }
  export async function me(): Promise<UserSubsetSS | null> {
    return fetch({
      method: "GET",
      url: `/api/user/me?${qs.stringify({})}`,
    });
  }

  export async function logout(): Promise<{ message: string }> {
    return fetch({
      method: "GET",
      url: `/api/user/logout?${qs.stringify({})}`,
    });
  }

  export async function test1(): Promise<{ message: string }> {
    return fetch({
      method: "GET",
      url: `/api/user/test1?${qs.stringify({})}`,
    });
  }
}
