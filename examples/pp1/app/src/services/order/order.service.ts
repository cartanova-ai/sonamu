import { z } from "zod";
import qs from "qs";
import useSWR, { SWRResponse } from "swr";
import { fetch } from "../../typeframe/fetch";
import { ListResult, SWRError } from "../../typeframe/iso-types";
import { OrderSubsetPD, OrderSubsetPL } from "./order.generated";
import {
  OrderListParams,
  OrderSaveParams,
  OrderUpdateAddressParams,
  OrderInstmnt,
} from "./order.types";

export namespace OrderService {
  export function useOrder<T extends "PD">(
    _subset: T,
    id: number
  ): SWRResponse<OrderSubsetPD, SWRError> {
    return useSWR<OrderSubsetPD, SWRError>([
      `/api/order/findById`,
      qs.stringify({ _subset, id }),
    ]);
  }
  export async function getOrder<T extends "PD">(
    _subset: T,
    id: number
  ): Promise<OrderSubsetPD> {
    return fetch({
      method: "GET",
      url: `/api/order/findById?${qs.stringify({ _subset, id })}`,
    });
  }

  export function useMyOrders<T extends "PL">(
    _subset: T,
    params: OrderListParams = {}
  ): SWRResponse<ListResult<OrderSubsetPL>, SWRError> {
    return useSWR<ListResult<OrderSubsetPL>, SWRError>([
      `/api/order/mine`,
      qs.stringify({ _subset, params }),
    ]);
  }
  export async function getMyOrders<T extends "PL">(
    _subset: T,
    params: OrderListParams = {}
  ): Promise<ListResult<OrderSubsetPL>> {
    return fetch({
      method: "GET",
      url: `/api/order/mine?${qs.stringify({ _subset, params })}`,
    });
  }

  export async function save(
    saveParams: OrderSaveParams
  ): Promise<OrderSubsetPD> {
    return fetch({
      method: "POST",
      url: `/api/order/save`,
      data: { saveParams },
    });
  }

  export async function userCancel(
    order_id: number,
    order_item_ids: number[]
  ): Promise<{ message: string }> {
    return fetch({
      method: "POST",
      url: `/api/order/userCancel`,
      data: { order_id, order_item_ids },
    });
  }

  export async function requestReturn(
    order_id: number,
    order_item_id: number,
    comment: string,
    images: string[] = []
  ): Promise<{ message: string }> {
    return fetch({
      method: "POST",
      url: `/api/order/requestReturn`,
      data: { order_id, order_item_id, comment, images },
    });
  }

  export async function cancelRequestReturn(
    order_id: number,
    order_item_id: number
  ): Promise<{ message: string }> {
    return fetch({
      method: "POST",
      url: `/api/order/cancelRequestReturn`,
      data: { order_id, order_item_id },
    });
  }

  export async function updateOrderAddress(
    order_id: number,
    params: OrderUpdateAddressParams
  ): Promise<{ message: string }> {
    return fetch({
      method: "POST",
      url: `/api/order/updateOrderAddress`,
      data: { order_id, params },
    });
  }

  export function useInstmnts(): SWRResponse<OrderInstmnt[], SWRError> {
    return useSWR<OrderInstmnt[], SWRError>([
      `/api/order/instmnts`,
      qs.stringify({}),
    ]);
  }
  export async function getInstmnts(): Promise<OrderInstmnt[]> {
    return fetch({
      method: "GET",
      url: `/api/order/instmnts?${qs.stringify({})}`,
    });
  }
}
