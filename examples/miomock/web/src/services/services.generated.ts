/**
 * @generated
 * 직접 수정하지 마세요.
 */

/* oxlint-disable */

import { type AsyncIdConfig } from "@sonamu-kit/react-components/components";
import {
  queryOptions,
  useQuery,
  useInfiniteQuery,
  infiniteQueryOptions,
  useMutation,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { type AxiosProgressEvent } from "axios";
import qs from "qs";

import { AuditEventListParams, AuditEventSaveParams } from "./audit-event/audit-event.types";
import { AuditLogListParams } from "./audit-log/audit-log.types";
import { ChatOutEvents, ChatInEvents } from "./chat/chat.types";
import { CompanyListParams, CompanySaveParams } from "./company/company.types";
import {
  DashboardStats,
  RecentActivityOutEvents,
  RecentActivityInEvents,
  ActivityPeriod,
  ActivityGroup,
} from "./dashboard/dashboard.types";
import { DepartmentListParams, DepartmentSaveParams } from "./department/department.types";
import {
  DocumentListParams,
  DocumentSemanticParams,
  DocumentSaveParams,
} from "./document/document.types";
import { EmployeeListParams, EmployeeSaveParams } from "./employee/employee.types";
import { FileListParams, FileSaveParams } from "./file/file.types";
import { MilestoneListParams, MilestoneSaveParams } from "./milestone/milestone.types";
import { ProjectListParams, ProjectSaveParams } from "./project/project.types";
import {
  UserSubsetKey,
  UserSubsetMapping,
  TagSubsetKey,
  TagSubsetMapping,
  SyncFixtureSubsetKey,
  SyncFixtureSubsetMapping,
  ProjectSubsetKey,
  ProjectSubsetMapping,
  MilestoneSubsetKey,
  MilestoneSubsetMapping,
  FileSubsetKey,
  FileSubsetMapping,
  EmployeeSubsetKey,
  EmployeeSubsetMapping,
  DocumentSubsetKey,
  DocumentSubsetMapping,
  DepartmentSubsetKey,
  DepartmentSubsetMapping,
  CompanySubsetKey,
  CompanySubsetMapping,
  AuditLogSubsetKey,
  AuditLogSubsetMapping,
  AuditEventSubsetKey,
  AuditEventSubsetMapping,
} from "./sonamu.generated";
import {
  type ListResult,
  type FilterQuery,
  type SonamuFile,
  fetch,
  type EventHandlers,
  type SSEStreamOptions,
  type WebSocketChannelOptions,
  useSSEStream,
  useWebSocketChannel,
  toFormData,
  dedupeAndFlatten,
  useRefreshable,
} from "./sonamu.shared";
import { SyncFixtureListParams, SyncFixtureSaveParams } from "./sync-fixture/sync-fixture.types";
import { TagListParams, TagSaveParams } from "./tag/tag.types";
import { TelemetryQueryParams, TelemetrySnapshot } from "./telemetry/telemetry.types";
import { UserListParams, UserSaveParams } from "./user/user.types";

export namespace UserService {
  export async function getUser<T extends UserSubsetKey>(
    subset: T,
    id: string,
  ): Promise<UserSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/user/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export const getUserQueryOptions = <T extends UserSubsetKey>(subset: T, id: string) =>
    queryOptions({
      queryKey: ["User", "getUser", subset, id],
      queryFn: () => getUser(subset, id),
    });

  export const useUser = <T extends UserSubsetKey>(
    subset: T,
    id: string,
    options?: { enabled?: boolean },
  ) =>
    useRefreshable(
      useQuery({
        ...getUserQueryOptions(subset, id),
        ...options,
      }),
    );

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
    useRefreshable(
      useQuery({
        ...getUsersQueryOptions(subset, rawParams),
        ...options,
      }),
    );

  export const getUsersInfiniteQueryOptions = <T extends UserSubsetKey, LP extends UserListParams>(
    subset: T,
    rawParams?: LP,
  ) =>
    infiniteQueryOptions({
      queryKey: ["User", "getUsers", "infinite", subset, rawParams],
      queryFn: ({ pageParam }) => getUsers(subset, { ...rawParams, page: pageParam }),
      initialPageParam: 1 as number,
      getNextPageParam: (lastPage, allPages) => {
        const total = (lastPage as { total?: number })?.total ?? 0;
        const loaded = allPages.reduce(
          (sum, p) => sum + ((p as { rows?: unknown[] })?.rows?.length ?? 0),
          0,
        );
        return loaded < total ? allPages.length + 1 : undefined;
      },
      select: dedupeAndFlatten,
    });

  export const useUsersInfinite = <T extends UserSubsetKey, LP extends UserListParams>(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useRefreshable(
      useInfiniteQuery({
        ...getUsersInfiniteQueryOptions(subset, rawParams),
        ...options,
      }),
    );

  export async function save(spa: UserSaveParams[]): Promise<string[]> {
    return fetch({
      method: "POST",
      url: `/api/user/save`,
      data: { spa },
    });
  }

  export const useSaveMutation = () =>
    useMutation({
      mutationFn: (params: { spa: UserSaveParams[] }) => UserService.save(params.spa),
    });

  export async function del(ids: string[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/user/del`,
      data: { ids },
    });
  }

  export const useDelMutation = () =>
    useMutation({
      mutationFn: (params: { ids: string[] }) => UserService.del(params.ids),
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
    useRefreshable(
      useQuery({
        ...getMyIPQueryOptions(),
        ...options,
      }),
    );

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
    useRefreshable(
      useQuery({
        ...trxTestQueryOptions(),
        ...options,
      }),
    );
}

export namespace TelemetryService {
  export async function getTelemetrySnapshot(
    rawParams?: TelemetryQueryParams,
  ): Promise<TelemetrySnapshot> {
    return fetch({
      method: "GET",
      url: `/api/telemetry/getSnapshot?${qs.stringify({ rawParams })}`,
    });
  }

  export const getTelemetrySnapshotQueryOptions = (rawParams?: TelemetryQueryParams) =>
    queryOptions({
      queryKey: ["Telemetry", "getTelemetrySnapshot", rawParams],
      queryFn: () => getTelemetrySnapshot(rawParams),
    });

  export const useTelemetrySnapshot = (
    rawParams?: TelemetryQueryParams,
    options?: { enabled?: boolean },
  ) =>
    useRefreshable(
      useQuery({
        ...getTelemetrySnapshotQueryOptions(rawParams),
        ...options,
      }),
    );
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
    useRefreshable(
      useQuery({
        ...getTagQueryOptions(subset, id),
        ...options,
      }),
    );

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
    useRefreshable(
      useQuery({
        ...getTagsQueryOptions(subset, rawParams),
        ...options,
      }),
    );

  export const getTagsInfiniteQueryOptions = <T extends TagSubsetKey, LP extends TagListParams>(
    subset: T,
    rawParams?: LP,
  ) =>
    infiniteQueryOptions({
      queryKey: ["Tag", "getTags", "infinite", subset, rawParams],
      queryFn: ({ pageParam }) => getTags(subset, { ...rawParams, page: pageParam }),
      initialPageParam: 1 as number,
      getNextPageParam: (lastPage, allPages) => {
        const total = (lastPage as { total?: number })?.total ?? 0;
        const loaded = allPages.reduce(
          (sum, p) => sum + ((p as { rows?: unknown[] })?.rows?.length ?? 0),
          0,
        );
        return loaded < total ? allPages.length + 1 : undefined;
      },
      select: dedupeAndFlatten,
    });

  export const useTagsInfinite = <T extends TagSubsetKey, LP extends TagListParams>(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useRefreshable(
      useInfiniteQuery({
        ...getTagsInfiniteQueryOptions(subset, rawParams),
        ...options,
      }),
    );

  export async function save(spa: TagSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/tag/save`,
      data: { spa },
    });
  }

  export const useSaveMutation = () =>
    useMutation({
      mutationFn: (params: { spa: TagSaveParams[] }) => TagService.save(params.spa),
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
      mutationFn: (params: { ids: number[] }) => TagService.del(params.ids),
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

  export async function runWorkflow(): Promise<void> {
    return fetch({
      method: "POST",
      url: `/api/tag/runWorkflow`,
    });
  }
}

export namespace SyncFixtureSubService {
  export async function getSyncFixtureSub<T extends SyncFixtureSubsetKey>(
    subset: T,
    id: number,
  ): Promise<SyncFixtureSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/syncFixtureSub/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export const getSyncFixtureSubQueryOptions = <T extends SyncFixtureSubsetKey>(
    subset: T,
    id: number,
  ) =>
    queryOptions({
      queryKey: ["SyncFixtureSub", "getSyncFixtureSub", subset, id],
      queryFn: () => getSyncFixtureSub(subset, id),
    });

  export const useSyncFixtureSub = <T extends SyncFixtureSubsetKey>(
    subset: T,
    id: number,
    options?: { enabled?: boolean },
  ) =>
    useRefreshable(
      useQuery({
        ...getSyncFixtureSubQueryOptions(subset, id),
        ...options,
      }),
    );
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
    useRefreshable(
      useQuery({
        ...getSyncFixtureQueryOptions(subset, id),
        ...options,
      }),
    );

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
    useRefreshable(
      useQuery({
        ...getSyncFixturesQueryOptions(subset, rawParams),
        ...options,
      }),
    );

  export const getSyncFixturesInfiniteQueryOptions = <
    T extends SyncFixtureSubsetKey,
    LP extends SyncFixtureListParams,
  >(
    subset: T,
    rawParams?: LP,
  ) =>
    infiniteQueryOptions({
      queryKey: ["SyncFixture", "getSyncFixtures", "infinite", subset, rawParams],
      queryFn: ({ pageParam }) => getSyncFixtures(subset, { ...rawParams, page: pageParam }),
      initialPageParam: 1 as number,
      getNextPageParam: (lastPage, allPages) => {
        const total = (lastPage as { total?: number })?.total ?? 0;
        const loaded = allPages.reduce(
          (sum, p) => sum + ((p as { rows?: unknown[] })?.rows?.length ?? 0),
          0,
        );
        return loaded < total ? allPages.length + 1 : undefined;
      },
      select: dedupeAndFlatten,
    });

  export const useSyncFixturesInfinite = <
    T extends SyncFixtureSubsetKey,
    LP extends SyncFixtureListParams,
  >(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useRefreshable(
      useInfiniteQuery({
        ...getSyncFixturesInfiniteQueryOptions(subset, rawParams),
        ...options,
      }),
    );

  export async function save(spa: SyncFixtureSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/syncFixture/save`,
      data: { spa },
    });
  }

  export const useSaveMutation = () =>
    useMutation({
      mutationFn: (params: { spa: SyncFixtureSaveParams[] }) => SyncFixtureService.save(params.spa),
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
      mutationFn: (params: { ids: number[] }) => SyncFixtureService.del(params.ids),
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
    useRefreshable(
      useQuery({
        ...getProjectQueryOptions(subset, id),
        ...options,
      }),
    );

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
    useRefreshable(
      useQuery({
        ...getProjectsQueryOptions(subset, rawParams),
        ...options,
      }),
    );

  export const getProjectsInfiniteQueryOptions = <
    T extends ProjectSubsetKey,
    LP extends ProjectListParams,
  >(
    subset: T,
    rawParams?: LP,
  ) =>
    infiniteQueryOptions({
      queryKey: ["Project", "getProjects", "infinite", subset, rawParams],
      queryFn: ({ pageParam }) => getProjects(subset, { ...rawParams, page: pageParam }),
      initialPageParam: 1 as number,
      getNextPageParam: (lastPage, allPages) => {
        const total = (lastPage as { total?: number })?.total ?? 0;
        const loaded = allPages.reduce(
          (sum, p) => sum + ((p as { rows?: unknown[] })?.rows?.length ?? 0),
          0,
        );
        return loaded < total ? allPages.length + 1 : undefined;
      },
      select: dedupeAndFlatten,
    });

  export const useProjectsInfinite = <T extends ProjectSubsetKey, LP extends ProjectListParams>(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useRefreshable(
      useInfiniteQuery({
        ...getProjectsInfiniteQueryOptions(subset, rawParams),
        ...options,
      }),
    );

  export async function save(spa: ProjectSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/project/save`,
      data: { spa },
    });
  }

  export const useSaveMutation = () =>
    useMutation({
      mutationFn: (params: { spa: ProjectSaveParams[] }) => ProjectService.save(params.spa),
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
      mutationFn: (params: { ids: number[] }) => ProjectService.del(params.ids),
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

  export async function search(
    search: string,
  ): Promise<
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

export namespace MilestoneService {
  export async function getMilestone<T extends MilestoneSubsetKey>(
    subset: T,
    id: number,
  ): Promise<MilestoneSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/milestone/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export const getMilestoneQueryOptions = <T extends MilestoneSubsetKey>(subset: T, id: number) =>
    queryOptions({
      queryKey: ["Milestone", "getMilestone", subset, id],
      queryFn: () => getMilestone(subset, id),
    });

  export const useMilestone = <T extends MilestoneSubsetKey>(
    subset: T,
    id: number,
    options?: { enabled?: boolean },
  ) =>
    useRefreshable(
      useQuery({
        ...getMilestoneQueryOptions(subset, id),
        ...options,
      }),
    );

  export async function getMilestones<T extends MilestoneSubsetKey, LP extends MilestoneListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, MilestoneSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/milestone/findMany?${qs.stringify({ subset, rawParams })}`,
    });
  }

  export const getMilestonesQueryOptions = <
    T extends MilestoneSubsetKey,
    LP extends MilestoneListParams,
  >(
    subset: T,
    rawParams?: LP,
  ) =>
    queryOptions({
      queryKey: ["Milestone", "getMilestones", subset, rawParams],
      queryFn: () => getMilestones(subset, rawParams),
    });

  export const useMilestones = <T extends MilestoneSubsetKey, LP extends MilestoneListParams>(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useRefreshable(
      useQuery({
        ...getMilestonesQueryOptions(subset, rawParams),
        ...options,
      }),
    );

  export const getMilestonesInfiniteQueryOptions = <
    T extends MilestoneSubsetKey,
    LP extends MilestoneListParams,
  >(
    subset: T,
    rawParams?: LP,
  ) =>
    infiniteQueryOptions({
      queryKey: ["Milestone", "getMilestones", "infinite", subset, rawParams],
      queryFn: ({ pageParam }) => getMilestones(subset, { ...rawParams, page: pageParam }),
      initialPageParam: 1 as number,
      getNextPageParam: (lastPage, allPages) => {
        const total = (lastPage as { total?: number })?.total ?? 0;
        const loaded = allPages.reduce(
          (sum, p) => sum + ((p as { rows?: unknown[] })?.rows?.length ?? 0),
          0,
        );
        return loaded < total ? allPages.length + 1 : undefined;
      },
      select: dedupeAndFlatten,
    });

  export const useMilestonesInfinite = <
    T extends MilestoneSubsetKey,
    LP extends MilestoneListParams,
  >(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useRefreshable(
      useInfiniteQuery({
        ...getMilestonesInfiniteQueryOptions(subset, rawParams),
        ...options,
      }),
    );

  export async function save(spa: MilestoneSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/milestone/save`,
      data: { spa },
    });
  }

  export const useSaveMutation = () =>
    useMutation({
      mutationFn: (params: { spa: MilestoneSaveParams[] }) => MilestoneService.save(params.spa),
    });

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/milestone/del`,
      data: { ids },
    });
  }

  export const useDelMutation = () =>
    useMutation({
      mutationFn: (params: { ids: number[] }) => MilestoneService.del(params.ids),
    });

  export async function complete(id: number): Promise<MilestoneSubsetMapping["A"]> {
    return fetch({
      method: "POST",
      url: `/api/milestone/complete`,
      data: { id },
    });
  }

  export const useCompleteMutation = () =>
    useMutation({
      mutationFn: (params: { id: number }) => MilestoneService.complete(params.id),
    });

  export async function uncomplete(id: number): Promise<MilestoneSubsetMapping["A"]> {
    return fetch({
      method: "POST",
      url: `/api/milestone/uncomplete`,
      data: { id },
    });
  }

  export const useUncompleteMutation = () =>
    useMutation({
      mutationFn: (params: { id: number }) => MilestoneService.uncomplete(params.id),
    });
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
    useRefreshable(
      useQuery({
        ...getFileQueryOptions(subset, id),
        ...options,
      }),
    );

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
    useRefreshable(
      useQuery({
        ...getFilesQueryOptions(subset, rawParams),
        ...options,
      }),
    );

  export const getFilesInfiniteQueryOptions = <T extends FileSubsetKey, LP extends FileListParams>(
    subset: T,
    rawParams?: LP,
  ) =>
    infiniteQueryOptions({
      queryKey: ["File", "getFiles", "infinite", subset, rawParams],
      queryFn: ({ pageParam }) => getFiles(subset, { ...rawParams, page: pageParam }),
      initialPageParam: 1 as number,
      getNextPageParam: (lastPage, allPages) => {
        const total = (lastPage as { total?: number })?.total ?? 0;
        const loaded = allPages.reduce(
          (sum, p) => sum + ((p as { rows?: unknown[] })?.rows?.length ?? 0),
          0,
        );
        return loaded < total ? allPages.length + 1 : undefined;
      },
      select: dedupeAndFlatten,
    });

  export const useFilesInfinite = <T extends FileSubsetKey, LP extends FileListParams>(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useRefreshable(
      useInfiniteQuery({
        ...getFilesInfiniteQueryOptions(subset, rawParams),
        ...options,
      }),
    );

  export async function save(spa: FileSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/file/save`,
      data: { spa },
    });
  }

  export const useSaveMutation = () =>
    useMutation({
      mutationFn: (params: { spa: FileSaveParams[] }) => FileService.save(params.spa),
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
      mutationFn: (params: { ids: number[] }) => FileService.del(params.ids),
    });

  export async function upload(
    files: File[],
    onUploadProgress?: (pe: AxiosProgressEvent) => void,
  ): Promise<{ files: SonamuFile[] }> {
    const formData = new FormData();
    files.forEach((f) => {
      formData.append("files", f);
    });

    return fetch({
      method: "POST",
      url: `/api/file/upload`,
      onUploadProgress,
      data: formData,
    });
  }

  export const useUploadMutation = (
    options?: UseMutationOptions<{ files: SonamuFile[] }, Error, { files: File[] }> & {
      onUploadProgress?: (e: AxiosProgressEvent) => void;
    },
  ) =>
    useMutation({
      mutationFn: (params: { files: File[] }) => FileService.upload(params.files),
      retry: false,
      ...options,
    });

  export async function inlineUpload(
    params: { category: string },
    files: File[],
    onUploadProgress?: (pe: AxiosProgressEvent) => void,
  ): Promise<{ category: string; files: SonamuFile[] }> {
    const formData = new FormData();
    files.forEach((f) => {
      formData.append("files", f);
    });
    toFormData(params, formData, "params");
    return fetch({
      method: "POST",
      url: `/api/file/inlineUpload`,
      onUploadProgress,
      data: formData,
    });
  }

  export const useInlineUploadMutation = (
    options?: UseMutationOptions<
      { category: string; files: SonamuFile[] },
      Error,
      { params: { category: string }; files: File[] }
    > & {
      onUploadProgress?: (e: AxiosProgressEvent) => void;
    },
  ) =>
    useMutation({
      mutationFn: (params: { params: { category: string }; files: File[] }) =>
        FileService.inlineUpload(params.params, params.files),
      retry: false,
      ...options,
    });

  export async function inlineUploadFlat(
    category: string,
    files: File[],
    onUploadProgress?: (pe: AxiosProgressEvent) => void,
  ): Promise<{
    category: string;
    files: { name: string; url: string; mime_type: string; size: number }[];
  }> {
    const formData = new FormData();
    files.forEach((f) => {
      formData.append("files", f);
    });
    formData.append("category", String(category));
    return fetch({
      method: "POST",
      url: `/api/file/inlineUploadFlat`,
      onUploadProgress,
      data: formData,
    });
  }

  export const useInlineUploadFlatMutation = (
    options?: UseMutationOptions<
      { category: string; files: { name: string; url: string; mime_type: string; size: number }[] },
      Error,
      { params: string; files: File[] }
    > & {
      onUploadProgress?: (e: AxiosProgressEvent) => void;
    },
  ) =>
    useMutation({
      mutationFn: (params: { params: string; files: File[] }) =>
        FileService.inlineUploadFlat(params.params, params.files),
      retry: false,
      ...options,
    });

  export async function testBufferUpload(
    params: { name: string },
    files: File[],
    onUploadProgress?: (pe: AxiosProgressEvent) => void,
  ): Promise<{
    name: string;
    files: { filename: string; url: string; mimetype: string; size: number; md5: string }[];
  }> {
    const formData = new FormData();
    files.forEach((f) => {
      formData.append("files", f);
    });
    toFormData(params, formData, "params");
    return fetch({
      method: "POST",
      url: `/api/file/testBufferUpload`,
      onUploadProgress,
      data: formData,
    });
  }

  export const useTestBufferUploadMutation = (
    options?: UseMutationOptions<
      {
        name: string;
        files: { filename: string; url: string; mimetype: string; size: number; md5: string }[];
      },
      Error,
      { params: { name: string }; files: File[] }
    > & {
      onUploadProgress?: (e: AxiosProgressEvent) => void;
    },
  ) =>
    useMutation({
      mutationFn: (params: { params: { name: string }; files: File[] }) =>
        FileService.testBufferUpload(params.params, params.files),
      retry: false,
      ...options,
    });

  export async function testStreamUpload(
    params: { name: string },
    files: File[],
    onUploadProgress?: (pe: AxiosProgressEvent) => void,
  ): Promise<{
    name: string;
    files: { filename: string; url: string; mimetype: string; size: number; key: string }[];
  }> {
    const formData = new FormData();
    files.forEach((f) => {
      formData.append("files", f);
    });
    toFormData(params, formData, "params");
    return fetch({
      method: "POST",
      url: `/api/file/testStreamUpload`,
      onUploadProgress,
      data: formData,
    });
  }

  export const useTestStreamUploadMutation = (
    options?: UseMutationOptions<
      {
        name: string;
        files: { filename: string; url: string; mimetype: string; size: number; key: string }[];
      },
      Error,
      { params: { name: string }; files: File[] }
    > & {
      onUploadProgress?: (e: AxiosProgressEvent) => void;
    },
  ) =>
    useMutation({
      mutationFn: (params: { params: { name: string }; files: File[] }) =>
        FileService.testStreamUpload(params.params, params.files),
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
    useRefreshable(
      useQuery({
        ...getEmployeeQueryOptions(subset, id),
        ...options,
      }),
    );

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
    useRefreshable(
      useQuery({
        ...getEmployeesQueryOptions(subset, rawParams),
        ...options,
      }),
    );

  export const getEmployeesInfiniteQueryOptions = <
    T extends EmployeeSubsetKey,
    LP extends EmployeeListParams,
  >(
    subset: T,
    rawParams?: LP,
  ) =>
    infiniteQueryOptions({
      queryKey: ["Employee", "getEmployees", "infinite", subset, rawParams],
      queryFn: ({ pageParam }) => getEmployees(subset, { ...rawParams, page: pageParam }),
      initialPageParam: 1 as number,
      getNextPageParam: (lastPage, allPages) => {
        const total = (lastPage as { total?: number })?.total ?? 0;
        const loaded = allPages.reduce(
          (sum, p) => sum + ((p as { rows?: unknown[] })?.rows?.length ?? 0),
          0,
        );
        return loaded < total ? allPages.length + 1 : undefined;
      },
      select: dedupeAndFlatten,
    });

  export const useEmployeesInfinite = <T extends EmployeeSubsetKey, LP extends EmployeeListParams>(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useRefreshable(
      useInfiniteQuery({
        ...getEmployeesInfiniteQueryOptions(subset, rawParams),
        ...options,
      }),
    );

  export async function save(spa: EmployeeSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/employee/save`,
      data: { spa },
    });
  }

  export const useSaveMutation = () =>
    useMutation({
      mutationFn: (params: { spa: EmployeeSaveParams[] }) => EmployeeService.save(params.spa),
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
      mutationFn: (params: { ids: number[] }) => EmployeeService.del(params.ids),
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
    useRefreshable(
      useQuery({
        ...getDocumentQueryOptions(subset, id),
        ...options,
      }),
    );

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
    useRefreshable(
      useQuery({
        ...findManyQueryOptions(subset, rawParams),
        ...options,
      }),
    );

  export async function getSimilarDocumentsByVector<T extends DocumentSubsetKey>(
    subset: T,
    params: DocumentSemanticParams,
  ): Promise<{ rows: (DocumentSubsetMapping[T] & { similarity: number })[] }> {
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
    useRefreshable(
      useQuery({
        ...getSimilarDocumentsByVectorQueryOptions(subset, params),
        ...options,
      }),
    );

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
    useRefreshable(
      useQuery({
        ...embedQueryQueryOptions(text, model, inputType),
        ...options,
      }),
    );

  export async function save(spa: DocumentSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/document/save`,
      data: { spa },
    });
  }

  export const useSaveMutation = () =>
    useMutation({
      mutationFn: (params: { spa: DocumentSaveParams[] }) => DocumentService.save(params.spa),
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
      mutationFn: (params: { ids: number[] }) => DocumentService.del(params.ids),
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
    useRefreshable(
      useQuery({
        ...getDepartmentQueryOptions(subset, id),
        ...options,
      }),
    );

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
    useRefreshable(
      useQuery({
        ...getDepartmentsQueryOptions(subset, rawParams),
        ...options,
      }),
    );

  export const getDepartmentsInfiniteQueryOptions = <
    T extends DepartmentSubsetKey,
    LP extends DepartmentListParams,
  >(
    subset: T,
    rawParams?: LP,
  ) =>
    infiniteQueryOptions({
      queryKey: ["Department", "getDepartments", "infinite", subset, rawParams],
      queryFn: ({ pageParam }) => getDepartments(subset, { ...rawParams, page: pageParam }),
      initialPageParam: 1 as number,
      getNextPageParam: (lastPage, allPages) => {
        const total = (lastPage as { total?: number })?.total ?? 0;
        const loaded = allPages.reduce(
          (sum, p) => sum + ((p as { rows?: unknown[] })?.rows?.length ?? 0),
          0,
        );
        return loaded < total ? allPages.length + 1 : undefined;
      },
      select: dedupeAndFlatten,
    });

  export const useDepartmentsInfinite = <
    T extends DepartmentSubsetKey,
    LP extends DepartmentListParams,
  >(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useRefreshable(
      useInfiniteQuery({
        ...getDepartmentsInfiniteQueryOptions(subset, rawParams),
        ...options,
      }),
    );

  export async function save(spa: DepartmentSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/department/save`,
      data: { spa },
    });
  }

  export const useSaveMutation = () =>
    useMutation({
      mutationFn: (params: { spa: DepartmentSaveParams[] }) => DepartmentService.save(params.spa),
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
      mutationFn: (params: { ids: number[] }) => DepartmentService.del(params.ids),
    });
}

export namespace DashboardService {
  export async function getDashboardStats(): Promise<DashboardStats> {
    return fetch({
      method: "GET",
      url: `/api/dashboard/getStats`,
    });
  }

  export const getDashboardStatsQueryOptions = () =>
    queryOptions({
      queryKey: ["Dashboard", "getDashboardStats"],
      queryFn: () => getDashboardStats(),
    });

  export const useDashboardStats = (options?: { enabled?: boolean }) =>
    useRefreshable(
      useQuery({
        ...getDashboardStatsQueryOptions(),
        ...options,
      }),
    );

  export function useGetRecentActivity2(
    params: { initialPeriod: ActivityPeriod },
    handlers: EventHandlers<RecentActivityOutEvents>,
    options: WebSocketChannelOptions = {},
  ) {
    return useWebSocketChannel<RecentActivityOutEvents, RecentActivityInEvents>(
      `/api/dashboard/getRecentActivity2`,
      params,
      handlers,
      options,
    );
  }

  export async function getRecentActivity(period: ActivityPeriod = "7"): Promise<ActivityGroup[]> {
    return fetch({
      method: "GET",
      url: `/api/dashboard/getRecentActivity?${qs.stringify({ period })}`,
    });
  }

  export const getRecentActivityQueryOptions = (period: ActivityPeriod = "7") =>
    queryOptions({
      queryKey: ["Dashboard", "getRecentActivity", period],
      queryFn: () => getRecentActivity(period),
    });

  export const useRecentActivity = (
    period: ActivityPeriod = "7",
    options?: { enabled?: boolean },
  ) =>
    useRefreshable(
      useQuery({
        ...getRecentActivityQueryOptions(period),
        ...options,
      }),
    );
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
    useRefreshable(
      useQuery({
        ...getCompanyQueryOptions(subset, id),
        ...options,
      }),
    );

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
    useRefreshable(
      useQuery({
        ...getCompaniesQueryOptions(subset, rawParams),
        ...options,
      }),
    );

  export const getCompaniesInfiniteQueryOptions = <
    T extends CompanySubsetKey,
    LP extends CompanyListParams,
  >(
    subset: T,
    rawParams?: LP,
  ) =>
    infiniteQueryOptions({
      queryKey: ["Company", "getCompanies", "infinite", subset, rawParams],
      queryFn: ({ pageParam }) => getCompanies(subset, { ...rawParams, page: pageParam }),
      initialPageParam: 1 as number,
      getNextPageParam: (lastPage, allPages) => {
        const total = (lastPage as { total?: number })?.total ?? 0;
        const loaded = allPages.reduce(
          (sum, p) => sum + ((p as { rows?: unknown[] })?.rows?.length ?? 0),
          0,
        );
        return loaded < total ? allPages.length + 1 : undefined;
      },
      select: dedupeAndFlatten,
    });

  export const useCompaniesInfinite = <T extends CompanySubsetKey, LP extends CompanyListParams>(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useRefreshable(
      useInfiniteQuery({
        ...getCompaniesInfiniteQueryOptions(subset, rawParams),
        ...options,
      }),
    );

  export async function save(spa: CompanySaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/company/save`,
      data: { spa },
    });
  }

  export const useSaveMutation = () =>
    useMutation({
      mutationFn: (params: { spa: CompanySaveParams[] }) => CompanyService.save(params.spa),
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
      mutationFn: (params: { ids: number[] }) => CompanyService.del(params.ids),
    });
}

export namespace ChatService {
  export function useSubscribeChat(
    params: {},
    handlers: EventHandlers<ChatOutEvents>,
    options: WebSocketChannelOptions = {},
  ) {
    return useWebSocketChannel<ChatOutEvents, ChatInEvents>(
      `/api/chat/subscribeChat`,
      params,
      handlers,
      options,
    );
  }
}

export namespace AuditLogService {
  export async function getAuditLog<T extends AuditLogSubsetKey>(
    subset: T,
    id: number,
  ): Promise<AuditLogSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/auditLog/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export const getAuditLogQueryOptions = <T extends AuditLogSubsetKey>(subset: T, id: number) =>
    queryOptions({
      queryKey: ["AuditLog", "getAuditLog", subset, id],
      queryFn: () => getAuditLog(subset, id),
    });

  export const useAuditLog = <T extends AuditLogSubsetKey>(
    subset: T,
    id: number,
    options?: { enabled?: boolean },
  ) =>
    useRefreshable(
      useQuery({
        ...getAuditLogQueryOptions(subset, id),
        ...options,
      }),
    );

  export async function getAuditLogs<T extends AuditLogSubsetKey, LP extends AuditLogListParams>(
    subset: T,
    rawParams?: LP,
  ): Promise<ListResult<LP, AuditLogSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/auditLog/findMany?${qs.stringify({ subset, rawParams })}`,
    });
  }

  export const getAuditLogsQueryOptions = <
    T extends AuditLogSubsetKey,
    LP extends AuditLogListParams,
  >(
    subset: T,
    rawParams?: LP,
  ) =>
    queryOptions({
      queryKey: ["AuditLog", "getAuditLogs", subset, rawParams],
      queryFn: () => getAuditLogs(subset, rawParams),
    });

  export const useAuditLogs = <T extends AuditLogSubsetKey, LP extends AuditLogListParams>(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useRefreshable(
      useQuery({
        ...getAuditLogsQueryOptions(subset, rawParams),
        ...options,
      }),
    );

  export const getAuditLogsInfiniteQueryOptions = <
    T extends AuditLogSubsetKey,
    LP extends AuditLogListParams,
  >(
    subset: T,
    rawParams?: LP,
  ) =>
    infiniteQueryOptions({
      queryKey: ["AuditLog", "getAuditLogs", "infinite", subset, rawParams],
      queryFn: ({ pageParam }) => getAuditLogs(subset, { ...rawParams, page: pageParam }),
      initialPageParam: 1 as number,
      getNextPageParam: (lastPage, allPages) => {
        const total = (lastPage as { total?: number })?.total ?? 0;
        const loaded = allPages.reduce(
          (sum, p) => sum + ((p as { rows?: unknown[] })?.rows?.length ?? 0),
          0,
        );
        return loaded < total ? allPages.length + 1 : undefined;
      },
      select: dedupeAndFlatten,
    });

  export const useAuditLogsInfinite = <T extends AuditLogSubsetKey, LP extends AuditLogListParams>(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useRefreshable(
      useInfiniteQuery({
        ...getAuditLogsInfiniteQueryOptions(subset, rawParams),
        ...options,
      }),
    );
}

export namespace AuditEventService {
  export async function getAuditEvent<T extends AuditEventSubsetKey>(
    subset: T,
    id: number,
  ): Promise<AuditEventSubsetMapping[T]> {
    return fetch({
      method: "GET",
      url: `/api/auditEvent/findById?${qs.stringify({ subset, id })}`,
    });
  }

  export const getAuditEventQueryOptions = <T extends AuditEventSubsetKey>(subset: T, id: number) =>
    queryOptions({
      queryKey: ["AuditEvent", "getAuditEvent", subset, id],
      queryFn: () => getAuditEvent(subset, id),
    });

  export const useAuditEvent = <T extends AuditEventSubsetKey>(
    subset: T,
    id: number,
    options?: { enabled?: boolean },
  ) =>
    useRefreshable(
      useQuery({
        ...getAuditEventQueryOptions(subset, id),
        ...options,
      }),
    );

  export async function getAuditEvents<
    T extends AuditEventSubsetKey,
    LP extends AuditEventListParams,
  >(subset: T, rawParams?: LP): Promise<ListResult<LP, AuditEventSubsetMapping[T]>> {
    return fetch({
      method: "GET",
      url: `/api/auditEvent/findMany?${qs.stringify({ subset, rawParams })}`,
    });
  }

  export const getAuditEventsQueryOptions = <
    T extends AuditEventSubsetKey,
    LP extends AuditEventListParams,
  >(
    subset: T,
    rawParams?: LP,
  ) =>
    queryOptions({
      queryKey: ["AuditEvent", "getAuditEvents", subset, rawParams],
      queryFn: () => getAuditEvents(subset, rawParams),
    });

  export const useAuditEvents = <T extends AuditEventSubsetKey, LP extends AuditEventListParams>(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useRefreshable(
      useQuery({
        ...getAuditEventsQueryOptions(subset, rawParams),
        ...options,
      }),
    );

  export const getAuditEventsInfiniteQueryOptions = <
    T extends AuditEventSubsetKey,
    LP extends AuditEventListParams,
  >(
    subset: T,
    rawParams?: LP,
  ) =>
    infiniteQueryOptions({
      queryKey: ["AuditEvent", "getAuditEvents", "infinite", subset, rawParams],
      queryFn: ({ pageParam }) => getAuditEvents(subset, { ...rawParams, page: pageParam }),
      initialPageParam: 1 as number,
      getNextPageParam: (lastPage, allPages) => {
        const total = (lastPage as { total?: number })?.total ?? 0;
        const loaded = allPages.reduce(
          (sum, p) => sum + ((p as { rows?: unknown[] })?.rows?.length ?? 0),
          0,
        );
        return loaded < total ? allPages.length + 1 : undefined;
      },
      select: dedupeAndFlatten,
    });

  export const useAuditEventsInfinite = <
    T extends AuditEventSubsetKey,
    LP extends AuditEventListParams,
  >(
    subset: T,
    rawParams?: LP,
    options?: { enabled?: boolean },
  ) =>
    useRefreshable(
      useInfiniteQuery({
        ...getAuditEventsInfiniteQueryOptions(subset, rawParams),
        ...options,
      }),
    );

  export async function save(spa: AuditEventSaveParams[]): Promise<number[]> {
    return fetch({
      method: "POST",
      url: `/api/auditEvent/save`,
      data: { spa },
    });
  }

  export const useSaveMutation = () =>
    useMutation({
      mutationFn: (params: { spa: AuditEventSaveParams[] }) => AuditEventService.save(params.spa),
    });

  export async function del(ids: number[]): Promise<number> {
    return fetch({
      method: "POST",
      url: `/api/auditEvent/del`,
      data: { ids },
    });
  }

  export const useDelMutation = () =>
    useMutation({
      mutationFn: (params: { ids: number[] }) => AuditEventService.del(params.ids),
    });
}

// AsyncIdConfig: AuditEvent
export const AuditEventAsyncIdConfig: AsyncIdConfig<
  AuditEventSubsetKey,
  AuditEventSubsetMapping,
  AuditEventListParams
> = {
  placeholderKey: "entity.AuditEvent",
  useList: AuditEventService.useAuditEvents,
  useListInfinite: AuditEventService.useAuditEventsInfinite,
};

// AsyncIdConfig: AuditLog
export const AuditLogAsyncIdConfig: AsyncIdConfig<
  AuditLogSubsetKey,
  AuditLogSubsetMapping,
  AuditLogListParams
> = {
  placeholderKey: "entity.AuditLog",
  useList: AuditLogService.useAuditLogs,
  useListInfinite: AuditLogService.useAuditLogsInfinite,
};

// AsyncIdConfig: Company
export const CompanyAsyncIdConfig: AsyncIdConfig<
  CompanySubsetKey,
  CompanySubsetMapping,
  CompanyListParams
> = {
  placeholderKey: "entity.Company",
  useList: CompanyService.useCompanies,
  useListInfinite: CompanyService.useCompaniesInfinite,
};

// AsyncIdConfig: Department
export const DepartmentAsyncIdConfig: AsyncIdConfig<
  DepartmentSubsetKey,
  DepartmentSubsetMapping,
  DepartmentListParams
> = {
  placeholderKey: "entity.Department",
  useList: DepartmentService.useDepartments,
  useListInfinite: DepartmentService.useDepartmentsInfinite,
};

// AsyncIdConfig: Employee
export const EmployeeAsyncIdConfig: AsyncIdConfig<
  EmployeeSubsetKey,
  EmployeeSubsetMapping,
  EmployeeListParams
> = {
  placeholderKey: "entity.Employee",
  useList: EmployeeService.useEmployees,
  useListInfinite: EmployeeService.useEmployeesInfinite,
};

// AsyncIdConfig: File
export const FileAsyncIdConfig: AsyncIdConfig<FileSubsetKey, FileSubsetMapping, FileListParams> = {
  placeholderKey: "entity.File",
  useList: FileService.useFiles,
  useListInfinite: FileService.useFilesInfinite,
};

// AsyncIdConfig: Milestone
export const MilestoneAsyncIdConfig: AsyncIdConfig<
  MilestoneSubsetKey,
  MilestoneSubsetMapping,
  MilestoneListParams
> = {
  placeholderKey: "entity.Milestone",
  useList: MilestoneService.useMilestones,
  useListInfinite: MilestoneService.useMilestonesInfinite,
};

// AsyncIdConfig: Project
export const ProjectAsyncIdConfig: AsyncIdConfig<
  ProjectSubsetKey,
  ProjectSubsetMapping,
  ProjectListParams
> = {
  placeholderKey: "entity.Project",
  useList: ProjectService.useProjects,
  useListInfinite: ProjectService.useProjectsInfinite,
};

// AsyncIdConfig: SyncFixture
export const SyncFixtureAsyncIdConfig: AsyncIdConfig<
  SyncFixtureSubsetKey,
  SyncFixtureSubsetMapping,
  SyncFixtureListParams
> = {
  placeholderKey: "entity.SyncFixture",
  useList: SyncFixtureService.useSyncFixtures,
  useListInfinite: SyncFixtureService.useSyncFixturesInfinite,
};

// AsyncIdConfig: Tag
export const TagAsyncIdConfig: AsyncIdConfig<TagSubsetKey, TagSubsetMapping, TagListParams> = {
  placeholderKey: "entity.Tag",
  useList: TagService.useTags,
  useListInfinite: TagService.useTagsInfinite,
};

// AsyncIdConfig: User
export const UserAsyncIdConfig: AsyncIdConfig<UserSubsetKey, UserSubsetMapping, UserListParams> = {
  placeholderKey: "entity.User",
  useList: UserService.useUsers,
  useListInfinite: UserService.useUsersInfinite,
};
