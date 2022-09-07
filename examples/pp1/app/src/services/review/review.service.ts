import { z } from "zod";
import qs from "qs";
import useSWR, { SWRResponse } from "swr";
import { fetch } from "../../typeframe/fetch";
import { ListResult, SWRError } from "../../typeframe/iso-types";
import { ReviewSubsetPD, ReviewSubsetPL } from "./review.generated";
import { ReviewListParams, ReviewSaveParams } from "./review.types";

export namespace ReviewService {
  export function useReview<T extends "PD">(
    _subset: T,
    id: number
  ): SWRResponse<ReviewSubsetPD, SWRError> {
    return useSWR<ReviewSubsetPD, SWRError>([
      `/api/review/findById`,
      qs.stringify({ _subset, id }),
    ]);
  }
  export async function getReview<T extends "PD">(
    _subset: T,
    id: number
  ): Promise<ReviewSubsetPD> {
    return fetch({
      method: "GET",
      url: `/api/review/findById?${qs.stringify({ _subset, id })}`,
    });
  }

  export function useReviews<T extends "PL">(
    _subset: T,
    params: ReviewListParams = {}
  ): SWRResponse<ListResult<ReviewSubsetPL>, SWRError> {
    return useSWR<ListResult<ReviewSubsetPL>, SWRError>([
      `/api/review/findMany`,
      qs.stringify({ _subset, params }),
    ]);
  }
  export async function getReviews<T extends "PL">(
    _subset: T,
    params: ReviewListParams = {}
  ): Promise<ListResult<ReviewSubsetPL>> {
    return fetch({
      method: "GET",
      url: `/api/review/findMany?${qs.stringify({ _subset, params })}`,
    });
  }

  export async function save(
    saveParams: ReviewSaveParams
  ): Promise<ReviewSubsetPL> {
    return fetch({
      method: "POST",
      url: `/api/review/save`,
      data: { saveParams },
    });
  }

  export async function del(id: number): Promise<{ message: string }> {
    return fetch({
      method: "GET",
      url: `/api/review/del?${qs.stringify({ id })}`,
    });
  }
}
