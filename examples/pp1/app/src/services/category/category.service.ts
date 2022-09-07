import { z } from "zod";
import qs from "qs";
import useSWR, { SWRResponse } from "swr";
import { fetch } from "../../typeframe/fetch";
import { ListResult, SWRError } from "../../typeframe/iso-types";
import { CategoryListParams } from "./category.types";
import { CategorySubsetP } from "./category.generated";

export namespace CategoryService {
  export function useLuxuryCategories<T extends "P">(
    _subset: T,
    params: CategoryListParams = {}
  ): SWRResponse<ListResult<CategorySubsetP>, SWRError> {
    return useSWR<ListResult<CategorySubsetP>, SWRError>([
      `/api/category/luxury`,
      qs.stringify({ _subset, params }),
    ]);
  }
  export async function getLuxuryCategories<T extends "P">(
    _subset: T,
    params: CategoryListParams = {}
  ): Promise<ListResult<CategorySubsetP>> {
    return fetch({
      method: "GET",
      url: `/api/category/luxury?${qs.stringify({ _subset, params })}`,
    });
  }
}
