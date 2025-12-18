
import qs from "qs";
import useSWR, { type SWRResponse } from "swr";
import type { DocumentSubsetKey, DocumentSubsetMapping } from "../sonamu.generated";
import {
  fetch,
  handleConditional,
  type ListResult,
  type SWRError,
  type SwrOptions,
  swrPostFetcher,
} from "../sonamu.shared";
import type { DocumentListParams, DocumentSaveParams, DocumentSemanticParams } from "./document.types";

export namespace DocumentService {
  export function useDocument<T extends DocumentSubsetKey>(
    subset: T,
    id: number,
    swrOptions?: SwrOptions,
  ): SWRResponse<DocumentSubsetMapping[T], SWRError> {
    return useSWR(
      handleConditional([`/api/document/findById`, { subset, id }], swrOptions?.conditional),
    );
  }
  export async function getDocument<T extends DocumentSubsetKey>(
    subset: T,
    id: number,
  ): Promise<DocumentSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/document/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export function useFindMany<T extends DocumentSubsetKey, LP extends DocumentListParams>(
    subset: T,
    rawParams?: LP,
    swrOptions?: SwrOptions,
  ): SWRResponse<ListResult<LP, DocumentSubsetMapping[T]>, SWRError> {
    return useSWR(
      handleConditional([`/api/document/findMany`, { subset, rawParams }], swrOptions?.conditional),
    );
  }
  export async function findMany<T extends DocumentSubsetKey, LP extends DocumentListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, DocumentSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/document/findMany?${qs.stringify({ subset, rawParams })}`,
    });
  }

  export function useSimilarDocumentsByVector<T extends DocumentSubsetKey>(
    subset: T,
    params: DocumentSemanticParams,
    swrOptions?: SwrOptions,
  ): SWRResponse<{ rows: DocumentSubsetMapping[T] & { similarity: number }[] }, SWRError> {
    return useSWR(
      handleConditional(
        [`/api/document/findManySemanticByVector`, { subset, params }],
        swrOptions?.conditional,
      ),
      swrPostFetcher,
    );
  }
  export async function getSimilarDocumentsByVector<T extends DocumentSubsetKey>(
    subset: T,
    params: DocumentSemanticParams,
  ): Promise<{ rows: DocumentSubsetMapping[T] & { similarity: number }[] }> {
    return fetch({
      method: "POST",
      url: `/api/document/findManySemanticByVector`,
      data: { subset, params },
    });
  }

  export function useEmbedQuery(
    text: string,
    model: "voyage" | "openai",
    inputType: "document" | "query",
    swrOptions?: SwrOptions,
  ): SWRResponse<number[], SWRError> {
    return useSWR(
      handleConditional(
        [`/api/document/embedQuery`, { text, model, inputType }],
        swrOptions?.conditional,
      ),
    );
  }
  export async function embedQuery(
    text: string,
    model: "voyage" | "openai",
    inputType: "document" | "query",
  ): Promise<number[]> {
    return fetch({
      method: "GET",
      url: `/api/document/embedQuery?${qs.stringify({ text, model, inputType })}`,
    });
  }

  export async function save(spa: DocumentSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/document/save`,
      data: { spa },
    });
  }

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/document/del`,
      data: { ids },
    });
  }
}
