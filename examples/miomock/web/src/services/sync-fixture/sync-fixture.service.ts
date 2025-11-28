
import qs from "qs";
import useSWR, { type SWRResponse } from "swr";
import type { SyncFixtureSubsetKey, SyncFixtureSubsetMapping } from "../sonamu.generated";
import {
  fetch,
  handleConditional,
  type ListResult,
  type SWRError,
  type SwrOptions,
} from "../sonamu.shared";
import type { SyncFixtureListParams, SyncFixtureSaveParams } from "./sync-fixture.types";

export namespace SyncFixtureService {
  export function useSyncFixture<T extends SyncFixtureSubsetKey>(
    subset: T,
    id: number,
    swrOptions?: SwrOptions,
  ): SWRResponse<SyncFixtureSubsetMapping[T], SWRError> {
    return useSWR(
      handleConditional([`/api/syncFixture/findById`, { subset, id }], swrOptions?.conditional),
    );
  }
  export async function getSyncFixture<T extends SyncFixtureSubsetKey>(
    subset: T,
    id: number,
  ): Promise<SyncFixtureSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/syncFixture/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export function useSyncFixtures<T extends SyncFixtureSubsetKey>(
    subset: T,
    params: SyncFixtureListParams = {},
    swrOptions?: SwrOptions,
  ): SWRResponse<ListResult<SyncFixtureSubsetMapping[T]>, SWRError> {
    return useSWR(
      handleConditional([`/api/syncFixture/findMany`, { subset, params }], swrOptions?.conditional),
    );
  }
  export async function getSyncFixtures<T extends SyncFixtureSubsetKey>(
    subset: T,
    params: SyncFixtureListParams = {},
  ): Promise<ListResult<SyncFixtureSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/syncFixture/findMany?${qs.stringify({ subset, params })}`,
    });
  }

  export async function save(spa: SyncFixtureSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/syncFixture/save`,
      data: { spa },
    });
  }

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/syncFixture/del`,
      data: { ids },
    });
  }
}
