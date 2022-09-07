import { z } from "zod";
import qs from "qs";
import useSWR, { SWRResponse } from "swr";
import { fetch } from "../../typeframe/fetch";
import { ListResult, SWRError } from "../../typeframe/iso-types";
import { PaymentSubsetP } from "./payment.generated";
import { OrderSubsetPD } from "../order/order.generated";

export namespace PaymentService {
  export async function response(
    order_id: number,
    imp_uid: string,
    merchant_uid: string
  ): Promise<{ payment: PaymentSubsetP; order: OrderSubsetPD }> {
    return fetch({
      method: "POST",
      url: `/api/payment/response`,
      data: { order_id, imp_uid, merchant_uid },
    });
  }
}
