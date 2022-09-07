import { z } from "zod";
import qs from "qs";
import useSWR, { SWRResponse } from "swr";
import {
  fetch,
  ListResult,
  SWRError,
  SwrOptions,
  handleConditional,
} from "../sonamu.shared";

export namespace FileService {
  export async function upload(
    file: File,
    onUploadProgress?: (pe: ProgressEvent) => void
  ): Promise<{ file: { path: string; url: string } }> {
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
}
