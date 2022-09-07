import { z } from "zod";
import qs from "qs";
import useSWR, { SWRResponse } from "swr";
import { fetch } from "../../typeframe/fetch";
import { ListResult, SWRError } from "../../typeframe/iso-types";
import { NotificationListParams } from "./notification.types";
import { NotificationSubsetP } from "./notification.generated";

export namespace NotificationService {
  export function useMyNotifications<T extends "P">(
    _subset: T,
    params: NotificationListParams = {}
  ): SWRResponse<
    ListResult<NotificationSubsetP> & { unread_count: number },
    SWRError
  > {
    return useSWR<
      ListResult<NotificationSubsetP> & { unread_count: number },
      SWRError
    >([`/api/notification/mine`, qs.stringify({ _subset, params })]);
  }
  export async function getMyNotifications<T extends "P">(
    _subset: T,
    params: NotificationListParams = {}
  ): Promise<ListResult<NotificationSubsetP> & { unread_count: number }> {
    return fetch({
      method: "GET",
      url: `/api/notification/mine?${qs.stringify({ _subset, params })}`,
    });
  }

  export function useUnreadCount(): SWRResponse<
    { unread_count: number },
    SWRError
  > {
    return useSWR<{ unread_count: number }, SWRError>([
      `/api/notification/getUnreadCount`,
      qs.stringify({}),
    ]);
  }
  export async function getUnreadCount(): Promise<{ unread_count: number }> {
    return fetch({
      method: "GET",
      url: `/api/notification/getUnreadCount?${qs.stringify({})}`,
    });
  }

  export async function read(id: number): Promise<{ message: string }> {
    return fetch({
      method: "GET",
      url: `/api/notification/read?${qs.stringify({ id })}`,
    });
  }

  export async function readAll(): Promise<{ message: string }> {
    return fetch({
      method: "GET",
      url: `/api/notification/readAll?${qs.stringify({})}`,
    });
  }
}
