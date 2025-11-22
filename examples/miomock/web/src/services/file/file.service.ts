import type { AxiosProgressEvent } from "axios";
import qs from "qs";
import useSWR, { type SWRResponse } from "swr";
import { z } from "zod";
import type { FileSubsetKey, FileSubsetMapping } from "../sonamu.generated";
import {
  EventHandlers,
  fetch,
  handleConditional,
  type ListResult,
  SSEStreamOptions,
  type SWRError,
  type SwrOptions,
  swrPostFetcher,
  useSSEStream,
} from "../sonamu.shared";
import type { FileListParams, FileSaveParams } from "./file.types";

export namespace FileService {
  export function useFile<T extends FileSubsetKey>(
    subset: T,
    id: number,
    swrOptions?: SwrOptions,
  ): SWRResponse<FileSubsetMapping[T], SWRError> {
    return useSWR(
      handleConditional([`/api/file/findById`, { subset, id }], swrOptions?.conditional),
    );
  }
  export async function getFile<T extends FileSubsetKey>(
    subset: T,
    id: number,
  ): Promise<FileSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/file/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export function useFiles<T extends FileSubsetKey>(
    subset: T,
    params: FileListParams = {},
    swrOptions?: SwrOptions,
  ): SWRResponse<ListResult<FileSubsetMapping[T]>, SWRError> {
    return useSWR(
      handleConditional([`/api/file/findMany`, { subset, params }], swrOptions?.conditional),
    );
  }
  export async function getFiles<T extends FileSubsetKey>(
    subset: T,
    params: FileListParams = {},
  ): Promise<ListResult<FileSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/file/findMany?${qs.stringify({ subset, params })}`,
    });
  }

  export async function save(spa: FileSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/file/save`,
      data: { spa },
    });
  }

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/file/del`,
      data: { ids },
    });
  }

  export async function upload(
    file: File,
    onUploadProgress?: (pe: AxiosProgressEvent) => void,
  ): Promise<{ file: { name: string; url: string; mime_type: string } }> {
    const formData = new FormData();
    formData.append("file", file);
    return fetch({
      method: "POST",
      url: `/api/file/upload`,
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress,
      data: formData,
    });
  }

  export async function uploadMultiple(
    files: File[],
    onUploadProgress?: (pe: AxiosProgressEvent) => void,
  ): Promise<{ files: { name: string; url: string; mime_type: string }[] }> {
    const formData = new FormData();
    files.forEach((f) => {
      formData.append("files", f);
    });
    return fetch({
      method: "POST",
      url: `/api/file/uploadMultiple`,
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress,
      data: formData,
    });
  }
}
