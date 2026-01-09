/** biome-ignore-all lint: generated는 무시 */
/** biome-ignore-all assist: generated는 무시 */

import {
  queryOptions,
  type UseMutationOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import type { AxiosProgressEvent } from "axios";
import qs from "qs";
import { CompanyListParams, CompanySaveParams } from "./company/company.types";
import { DepartmentListParams, DepartmentSaveParams } from "./department/department.types";
import {
  DocumentListParams,
  DocumentSaveParams,
  DocumentSemanticParams,
} from "./document/document.types";
import { EmployeeListParams, EmployeeSaveParams } from "./employee/employee.types";
import { FileListParams, FileSaveParams } from "./file/file.types";
import { ProjectListParams, ProjectSaveParams } from "./project/project.types";
import {
  CompanySubsetKey,
  CompanySubsetMapping,
  DepartmentSubsetKey,
  DepartmentSubsetMapping,
  DocumentSubsetKey,
  DocumentSubsetMapping,
  EmployeeSubsetKey,
  EmployeeSubsetMapping,
  FileSubsetKey,
  FileSubsetMapping,
  ProjectSubsetKey,
  ProjectSubsetMapping,
  SyncFixtureSubsetKey,
  SyncFixtureSubsetMapping,
  TagSubsetKey,
  TagSubsetMapping,
  UserSubsetKey,
  UserSubsetMapping,
} from "./sonamu.generated";
import {
  type EventHandlers,
  fetch,
  type ListResult,
  type SSEStreamOptions,
  useSSEStream,
} from "./sonamu.shared";
import { SyncFixtureListParams, SyncFixtureSaveParams } from "./sync-fixture/sync-fixture.types";
import { TagListParams, TagSaveParams } from "./tag/tag.types";
import {
  UserListParams,
  UserLoginParams,
  UserRegisterParams,
  UserSaveParams,
} from "./user/user.types";

export namespace UserService {
  export async function getUser<T extends UserSubsetKey>(
    subset: T,
    id: number,
  ): Promise<UserSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/user/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export const getUserQueryOptions = <T extends UserSubsetKey>(subset: T, id: number) =>
    queryOptions({
      queryKey: ["User", "getUser", subset, id],
      queryFn: () => getUser(subset, id),
    });

  export const useUser = <T extends UserSubsetKey>(
    subset: T,
    id: number,
    options?: { enabled?: boolean },
  ) =>
    useQuery({
      ...getUserQueryOptions(subset, id),
      ...options,
    });

  export async function getUsers<T extends UserSubsetKey, LP extends UserListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, UserSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/user/findMany?${qs.stringify({ subset, rawParams })}`,
      signal: AbortSignal.timeout(1000),
    });
  }

  export const getUsersQueryOptions = <T extends UserSubsetKey, LP extends UserListParams>(
    subset: T,
    rawParams?: LP,
  ) =>
    queryOptions({
      queryKey: ["User", "getUsers", subset, rawParams],
      queryFn: () => getUsers(subset, rawParams),
    });

  export const useUsers = <T extends UserSubsetKey, LP extends UserListParams>(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useQuery({
      ...getUsersQueryOptions(subset, rawParams),
      ...options,
    });

  export async function save(spa: UserSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/user/save`,
      data: { spa },
    });
  }

  export const useSaveMutation = () =>
    useMutation({
      mutationFn: (params: { spa: UserSaveParams[] }) => save(params.spa),
    });

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/user/del`,
      data: { ids },
    });
  }

  export const useDelMutation = () =>
    useMutation({
      mutationFn: (params: { ids: number[] }) => del(params.ids),
    });

  export async function getMyIP(): Promise<{ ip: string }> {
    return fetch({
      method: "GET",
      url: `/api/user/getMyIP`,
    });
  }

  export const getMyIPQueryOptions = () =>
    queryOptions({
      queryKey: ["User", "getMyIP"],
      queryFn: () => getMyIP(),
    });

  export const useGetMyIP = (options?: { enabled?: boolean }) =>
    useQuery({
      ...getMyIPQueryOptions(),
      ...options,
    });

  export async function me(): Promise<UserSubsetMapping["SS"] | null> {
    return fetch({
      method: "GET",
      url: `/api/user/me`,
    });
  }

  export const meQueryOptions = () =>
    queryOptions({
      queryKey: ["User", "me"],
      queryFn: () => me(),
    });

  export const useMe = (options?: { enabled?: boolean }) =>
    useQuery({
      ...meQueryOptions(),
      ...options,
    });

  export async function login(params: UserLoginParams): Promise<{ user: UserSubsetMapping["SS"] }> {
    return fetch({
      method: "POST",
      url: `/api/user/login`,
      data: { params },
    });
  }

  export const useLoginMutation = () =>
    useMutation({
      mutationFn: (params: { params: UserLoginParams }) => login(params.params),
    });

  export async function logout(): Promise<{ message: string }> {
    return fetch({
      method: "GET",
      url: `/api/user/logout`,
    });
  }

  export const useLogoutMutation = () =>
    useMutation({
      mutationFn: (params: void) => logout(),
    });

  export async function register(
    params: UserRegisterParams,
  ): Promise<{ user: UserSubsetMapping["SS"] }> {
    return fetch({
      method: "POST",
      url: `/api/user/register`,
      data: { params },
    });
  }

  export const useRegisterMutation = () =>
    useMutation({
      mutationFn: (params: { params: UserRegisterParams }) => register(params.params),
    });

  export async function trxTest(): Promise<void> {
    return fetch({
      method: "GET",
      url: `/api/user/trxTest`,
    });
  }

  export const trxTestQueryOptions = () =>
    queryOptions({
      queryKey: ["User", "trxTest"],
      queryFn: () => trxTest(),
    });

  export const useTrxTest = (options?: { enabled?: boolean }) =>
    useQuery({
      ...trxTestQueryOptions(),
      ...options,
    });
}

export namespace TagService {
  export async function getTag<T extends TagSubsetKey>(
    subset: T,
    id: number,
  ): Promise<TagSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/tag/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export const getTagQueryOptions = <T extends TagSubsetKey>(subset: T, id: number) =>
    queryOptions({
      queryKey: ["Tag", "getTag", subset, id],
      queryFn: () => getTag(subset, id),
    });

  export const useTag = <T extends TagSubsetKey>(
    subset: T,
    id: number,
    options?: { enabled?: boolean },
  ) =>
    useQuery({
      ...getTagQueryOptions(subset, id),
      ...options,
    });

  export async function getTags<T extends TagSubsetKey, LP extends TagListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, TagSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/tag/findMany?${qs.stringify({ subset, rawParams })}`,
    });
  }

  export const getTagsQueryOptions = <T extends TagSubsetKey, LP extends TagListParams>(
    subset: T,
    rawParams?: LP,
  ) =>
    queryOptions({
      queryKey: ["Tag", "getTags", subset, rawParams],
      queryFn: () => getTags(subset, rawParams),
    });

  export const useTags = <T extends TagSubsetKey, LP extends TagListParams>(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useQuery({
      ...getTagsQueryOptions(subset, rawParams),
      ...options,
    });

  export async function save(spa: TagSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/tag/save`,
      data: { spa },
    });
  }

  export const useSaveMutation = () =>
    useMutation({
      mutationFn: (params: { spa: TagSaveParams[] }) => save(params.spa),
    });

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/tag/del`,
      data: { ids },
    });
  }

  export const useDelMutation = () =>
    useMutation({
      mutationFn: (params: { ids: number[] }) => del(params.ids),
    });

  export async function cached(): Promise<TagSubsetMapping["A"]> {
    return fetch({
      method: "GET",
      url: `/api/tag/cached`,
    });
  }

  export async function deleteCached(): Promise<void> {
    return fetch({
      method: "GET",
      url: `/api/tag/deleteCached`,
    });
  }
}

export namespace SyncFixtureService {
  export async function getSyncFixture<T extends SyncFixtureSubsetKey>(
    subset: T,
    id: number,
  ): Promise<SyncFixtureSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/syncFixture/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export const getSyncFixtureQueryOptions = <T extends SyncFixtureSubsetKey>(
    subset: T,
    id: number,
  ) =>
    queryOptions({
      queryKey: ["SyncFixture", "getSyncFixture", subset, id],
      queryFn: () => getSyncFixture(subset, id),
    });

  export const useSyncFixture = <T extends SyncFixtureSubsetKey>(
    subset: T,
    id: number,
    options?: { enabled?: boolean },
  ) =>
    useQuery({
      ...getSyncFixtureQueryOptions(subset, id),
      ...options,
    });

  export async function getSyncFixtures<
    T extends SyncFixtureSubsetKey,
    LP extends SyncFixtureListParams,
  >(subset: T, rawParams?: LP): Promise<ListResult<LP, SyncFixtureSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/syncFixture/findMany?${qs.stringify({ subset, rawParams })}`,
    });
  }

  export const getSyncFixturesQueryOptions = <
    T extends SyncFixtureSubsetKey,
    LP extends SyncFixtureListParams,
  >(
    subset: T,
    rawParams?: LP,
  ) =>
    queryOptions({
      queryKey: ["SyncFixture", "getSyncFixtures", subset, rawParams],
      queryFn: () => getSyncFixtures(subset, rawParams),
    });

  export const useSyncFixtures = <T extends SyncFixtureSubsetKey, LP extends SyncFixtureListParams>(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useQuery({
      ...getSyncFixturesQueryOptions(subset, rawParams),
      ...options,
    });

  export async function save(spa: SyncFixtureSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/syncFixture/save`,
      data: { spa },
    });
  }

  export const useSaveMutation = () =>
    useMutation({
      mutationFn: (params: { spa: SyncFixtureSaveParams[] }) => save(params.spa),
    });

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/syncFixture/del`,
      data: { ids },
    });
  }

  export const useDelMutation = () =>
    useMutation({
      mutationFn: (params: { ids: number[] }) => del(params.ids),
    });
}

export namespace ProjectService {
  export async function getProject<T extends ProjectSubsetKey>(
    subset: T,
    id: number,
  ): Promise<ProjectSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/project/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export const getProjectQueryOptions = <T extends ProjectSubsetKey>(subset: T, id: number) =>
    queryOptions({
      queryKey: ["Project", "getProject", subset, id],
      queryFn: () => getProject(subset, id),
    });

  export const useProject = <T extends ProjectSubsetKey>(
    subset: T,
    id: number,
    options?: { enabled?: boolean },
  ) =>
    useQuery({
      ...getProjectQueryOptions(subset, id),
      ...options,
    });

  export async function getProjects<T extends ProjectSubsetKey, LP extends ProjectListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, ProjectSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/project/findMany?${qs.stringify({ subset, rawParams })}`,
    });
  }

  export const getProjectsQueryOptions = <T extends ProjectSubsetKey, LP extends ProjectListParams>(
    subset: T,
    rawParams?: LP,
  ) =>
    queryOptions({
      queryKey: ["Project", "getProjects", subset, rawParams],
      queryFn: () => getProjects(subset, rawParams),
    });

  export const useProjects = <T extends ProjectSubsetKey, LP extends ProjectListParams>(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useQuery({
      ...getProjectsQueryOptions(subset, rawParams),
      ...options,
    });

  export async function save(spa: ProjectSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/project/save`,
      data: { spa },
    });
  }

  export const useSaveMutation = () =>
    useMutation({
      mutationFn: (params: { spa: ProjectSaveParams[] }) => save(params.spa),
    });

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/project/del`,
      data: { ids },
    });
  }

  export const useDelMutation = () =>
    useMutation({
      mutationFn: (params: { ids: number[] }) => del(params.ids),
    });

  export function useAsk(
    params: { prompt: string },
    handlers: EventHandlers<
      {
        onToken: {
          token: string;
        };
        onComplete: {
          fullText: string;
        };
        onError: {
          error: {
            name: string;
            message: string;
            cause?: any;
            stack?: string;
          };
        };
      } & { end?: () => void }
    >,
    options: SSEStreamOptions,
  ) {
    return useSSEStream<{
      onToken: {
        token: string;
      };
      onComplete: {
        fullText: string;
      };
      onError: {
        error: {
          name: string;
          message: string;
          cause?: any;
          stack?: string;
        };
      };
    }>(`/api/project/ask`, params, handlers, options);
  }

  export async function search(search: string): Promise<
    {
      name: string;
      description: string | null;
      score: number;
      name_hl: string;
      description_hl: string;
      hl_all: string[];
    }[]
  > {
    return fetch({
      method: "GET",
      url: `/api/project/search?${qs.stringify({ search })}`,
    });
  }
}

export namespace FileService {
  export async function getFile<T extends FileSubsetKey>(
    subset: T,
    id: number,
  ): Promise<FileSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/file/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export const getFileQueryOptions = <T extends FileSubsetKey>(subset: T, id: number) =>
    queryOptions({
      queryKey: ["File", "getFile", subset, id],
      queryFn: () => getFile(subset, id),
    });

  export const useFile = <T extends FileSubsetKey>(
    subset: T,
    id: number,
    options?: { enabled?: boolean },
  ) =>
    useQuery({
      ...getFileQueryOptions(subset, id),
      ...options,
    });

  export async function getFiles<T extends FileSubsetKey, LP extends FileListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, FileSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/file/findMany?${qs.stringify({ subset, rawParams })}`,
    });
  }

  export const getFilesQueryOptions = <T extends FileSubsetKey, LP extends FileListParams>(
    subset: T,
    rawParams?: LP,
  ) =>
    queryOptions({
      queryKey: ["File", "getFiles", subset, rawParams],
      queryFn: () => getFiles(subset, rawParams),
    });

  export const useFiles = <T extends FileSubsetKey, LP extends FileListParams>(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useQuery({
      ...getFilesQueryOptions(subset, rawParams),
      ...options,
    });

  export async function save(spa: FileSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/file/save`,
      data: { spa },
    });
  }

  export const useSaveMutation = () =>
    useMutation({
      mutationFn: (params: { spa: FileSaveParams[] }) => save(params.spa),
    });

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/file/del`,
      data: { ids },
    });
  }

  export const useDelMutation = () =>
    useMutation({
      mutationFn: (params: { ids: number[] }) => del(params.ids),
    });

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

  export const useUploadMutation = (
    options?: UseMutationOptions<
      { file: { name: string; url: string; mime_type: string } },
      Error,
      { file: File }
    > & {
      onUploadProgress?: (e: AxiosProgressEvent) => void;
    },
  ) =>
    useMutation({
      mutationFn: async (params: { file: File }) => {
        const { file } = params;
        const formData = new FormData();
        formData.append("file", file);
        return fetch({
          method: "POST",
          url: `/api/file/upload`,
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: options?.onUploadProgress,
          data: formData,
        });
      },
      retry: false,
      ...options,
    });

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

  export const useUploadMultipleMutation = (
    options?: UseMutationOptions<
      { files: { name: string; url: string; mime_type: string }[] },
      Error,
      { files: File[] }
    > & {
      onUploadProgress?: (e: AxiosProgressEvent) => void;
    },
  ) =>
    useMutation({
      mutationFn: async (params: { files: File[] }) => {
        const { files } = params;
        const formData = new FormData();
        files.forEach((f) => {
          formData.append("files", f);
        });
        return fetch({
          method: "POST",
          url: `/api/file/uploadMultiple`,
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: options?.onUploadProgress,
          data: formData,
        });
      },
      retry: false,
      ...options,
    });

  export async function inlineUpload(
    uploadParams: { category: string },
    files: File[],
    onUploadProgress?: (pe: AxiosProgressEvent) => void,
  ): Promise<{ category: string; files: { name: string; url: string; mime_type: string }[] }> {
    const formData = new FormData();
    files.forEach((f) => {
      formData.append("files", f);
    });
    formData.append("uploadParams", String(uploadParams));
    return fetch({
      method: "POST",
      url: `/api/file/inlineUpload`,
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress,
      data: formData,
    });
  }

  export const useInlineUploadMutation = (
    options?: UseMutationOptions<
      { category: string; files: { name: string; url: string; mime_type: string }[] },
      Error,
      { files: File[]; uploadParams: { category: string } }
    > & {
      onUploadProgress?: (e: AxiosProgressEvent) => void;
    },
  ) =>
    useMutation({
      mutationFn: async (params: { files: File[]; uploadParams: { category: string } }) => {
        const { files, uploadParams } = params;
        const formData = new FormData();
        files.forEach((f) => {
          formData.append("files", f);
        });
        formData.append("uploadParams", String(uploadParams));
        return fetch({
          method: "POST",
          url: `/api/file/inlineUpload`,
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: options?.onUploadProgress,
          data: formData,
        });
      },
      retry: false,
      ...options,
    });
}

export namespace EmployeeService {
  export async function getEmployee<T extends EmployeeSubsetKey>(
    subset: T,
    id: number,
  ): Promise<EmployeeSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/employee/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export const getEmployeeQueryOptions = <T extends EmployeeSubsetKey>(subset: T, id: number) =>
    queryOptions({
      queryKey: ["Employee", "getEmployee", subset, id],
      queryFn: () => getEmployee(subset, id),
    });

  export const useEmployee = <T extends EmployeeSubsetKey>(
    subset: T,
    id: number,
    options?: { enabled?: boolean },
  ) =>
    useQuery({
      ...getEmployeeQueryOptions(subset, id),
      ...options,
    });

  export async function getEmployees<T extends EmployeeSubsetKey, LP extends EmployeeListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, EmployeeSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/employee/findMany?${qs.stringify({ subset, rawParams })}`,
    });
  }

  export const getEmployeesQueryOptions = <
    T extends EmployeeSubsetKey,
    LP extends EmployeeListParams,
  >(
    subset: T,
    rawParams?: LP,
  ) =>
    queryOptions({
      queryKey: ["Employee", "getEmployees", subset, rawParams],
      queryFn: () => getEmployees(subset, rawParams),
    });

  export const useEmployees = <T extends EmployeeSubsetKey, LP extends EmployeeListParams>(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useQuery({
      ...getEmployeesQueryOptions(subset, rawParams),
      ...options,
    });

  export async function save(spa: EmployeeSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/employee/save`,
      data: { spa },
    });
  }

  export const useSaveMutation = () =>
    useMutation({
      mutationFn: (params: { spa: EmployeeSaveParams[] }) => save(params.spa),
    });

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/employee/del`,
      data: { ids },
    });
  }

  export const useDelMutation = () =>
    useMutation({
      mutationFn: (params: { ids: number[] }) => del(params.ids),
    });
}

export namespace DocumentService {
  export async function getDocument<T extends DocumentSubsetKey>(
    subset: T,
    id: number,
  ): Promise<DocumentSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/document/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export const getDocumentQueryOptions = <T extends DocumentSubsetKey>(subset: T, id: number) =>
    queryOptions({
      queryKey: ["Document", "getDocument", subset, id],
      queryFn: () => getDocument(subset, id),
    });

  export const useDocument = <T extends DocumentSubsetKey>(
    subset: T,
    id: number,
    options?: { enabled?: boolean },
  ) =>
    useQuery({
      ...getDocumentQueryOptions(subset, id),
      ...options,
    });

  export async function findMany<T extends DocumentSubsetKey, LP extends DocumentListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, DocumentSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/document/findMany?${qs.stringify({ subset, rawParams })}`,
    });
  }

  export const findManyQueryOptions = <T extends DocumentSubsetKey, LP extends DocumentListParams>(
    subset: T,
    rawParams?: LP,
  ) =>
    queryOptions({
      queryKey: ["Document", "findMany", subset, rawParams],
      queryFn: () => findMany(subset, rawParams),
    });

  export const useFindMany = <T extends DocumentSubsetKey, LP extends DocumentListParams>(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useQuery({
      ...findManyQueryOptions(subset, rawParams),
      ...options,
    });

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

  export const getSimilarDocumentsByVectorQueryOptions = <T extends DocumentSubsetKey>(
    subset: T,
    params: DocumentSemanticParams,
  ) =>
    queryOptions({
      queryKey: ["Document", "getSimilarDocumentsByVector", subset, params],
      queryFn: () => getSimilarDocumentsByVector(subset, params),
    });

  export const useSimilarDocumentsByVector = <T extends DocumentSubsetKey>(
    subset: T,
    params: DocumentSemanticParams,
    options?: { enabled?: boolean },
  ) =>
    useQuery({
      ...getSimilarDocumentsByVectorQueryOptions(subset, params),
      ...options,
    });

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

  export const embedQueryQueryOptions = (
    text: string,
    model: "voyage" | "openai",
    inputType: "document" | "query",
  ) =>
    queryOptions({
      queryKey: ["Document", "embedQuery", text, model, inputType],
      queryFn: () => embedQuery(text, model, inputType),
    });

  export const useEmbedQuery = (
    text: string,
    model: "voyage" | "openai",
    inputType: "document" | "query",
    options?: { enabled?: boolean },
  ) =>
    useQuery({
      ...embedQueryQueryOptions(text, model, inputType),
      ...options,
    });

  export async function save(spa: DocumentSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/document/save`,
      data: { spa },
    });
  }

  export const useSaveMutation = () =>
    useMutation({
      mutationFn: (params: { spa: DocumentSaveParams[] }) => save(params.spa),
    });

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/document/del`,
      data: { ids },
    });
  }

  export const useDelMutation = () =>
    useMutation({
      mutationFn: (params: { ids: number[] }) => del(params.ids),
    });
}

export namespace DepartmentService {
  export async function getDepartment<T extends DepartmentSubsetKey>(
    subset: T,
    id: number,
  ): Promise<DepartmentSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/department/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export const getDepartmentQueryOptions = <T extends DepartmentSubsetKey>(subset: T, id: number) =>
    queryOptions({
      queryKey: ["Department", "getDepartment", subset, id],
      queryFn: () => getDepartment(subset, id),
    });

  export const useDepartment = <T extends DepartmentSubsetKey>(
    subset: T,
    id: number,
    options?: { enabled?: boolean },
  ) =>
    useQuery({
      ...getDepartmentQueryOptions(subset, id),
      ...options,
    });

  export async function getDepartments<
    T extends DepartmentSubsetKey,
    LP extends DepartmentListParams,
  >(subset: T, rawParams?: LP): Promise<ListResult<LP, DepartmentSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/department/findMany?${qs.stringify({ subset, rawParams })}`,
    });
  }

  export const getDepartmentsQueryOptions = <
    T extends DepartmentSubsetKey,
    LP extends DepartmentListParams,
  >(
    subset: T,
    rawParams?: LP,
  ) =>
    queryOptions({
      queryKey: ["Department", "getDepartments", subset, rawParams],
      queryFn: () => getDepartments(subset, rawParams),
    });

  export const useDepartments = <T extends DepartmentSubsetKey, LP extends DepartmentListParams>(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useQuery({
      ...getDepartmentsQueryOptions(subset, rawParams),
      ...options,
    });

  export async function save(spa: DepartmentSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/department/save`,
      data: { spa },
    });
  }

  export const useSaveMutation = () =>
    useMutation({
      mutationFn: (params: { spa: DepartmentSaveParams[] }) => save(params.spa),
    });

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/department/del`,
      data: { ids },
    });
  }

  export const useDelMutation = () =>
    useMutation({
      mutationFn: (params: { ids: number[] }) => del(params.ids),
    });
}

export namespace CompanyService {
  export async function getCompany<T extends CompanySubsetKey>(
    subset: T,
    id: number,
  ): Promise<CompanySubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/company/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export const getCompanyQueryOptions = <T extends CompanySubsetKey>(subset: T, id: number) =>
    queryOptions({
      queryKey: ["Company", "getCompany", subset, id],
      queryFn: () => getCompany(subset, id),
    });

  export const useCompany = <T extends CompanySubsetKey>(
    subset: T,
    id: number,
    options?: { enabled?: boolean },
  ) =>
    useQuery({
      ...getCompanyQueryOptions(subset, id),
      ...options,
    });

  export async function getCompanies<T extends CompanySubsetKey, LP extends CompanyListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, CompanySubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/company/findMany?${qs.stringify({ subset, rawParams })}`,
    });
  }

  export const getCompaniesQueryOptions = <
    T extends CompanySubsetKey,
    LP extends CompanyListParams,
  >(
    subset: T,
    rawParams?: LP,
  ) =>
    queryOptions({
      queryKey: ["Company", "getCompanies", subset, rawParams],
      queryFn: () => getCompanies(subset, rawParams),
    });

  export const useCompanies = <T extends CompanySubsetKey, LP extends CompanyListParams>(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useQuery({
      ...getCompaniesQueryOptions(subset, rawParams),
      ...options,
    });

  export async function save(spa: CompanySaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/company/save`,
      data: { spa },
    });
  }

  export const useSaveMutation = () =>
    useMutation({
      mutationFn: (params: { spa: CompanySaveParams[] }) => save(params.spa),
    });

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/company/del`,
      data: { ids },
    });
  }

  export const useDelMutation = () =>
    useMutation({
      mutationFn: (params: { ids: number[] }) => del(params.ids),
    });
}
